import { getInvoiceServiceDetails, getInvoiceServiceCommission, getInvoiceServiceTotal } from '../invoice'
import { getTodayDate } from '../invoiceStorage'
import { getEmployeeById } from '../employeeStorage'
import { getBranchName } from '../branchStorage'
import { computeEmployeePayrollRow } from '../payrollEngine'
import { fetchInvoicesFiltered } from '../../repositories/invoicesRepository'
import { fetchAttendanceFiltered } from '../../repositories/attendanceRepository'
import { fetchPayrollAdjustments } from '../../repositories/payrollRepository'
import { fetchPayrollCycleClose } from '../../repositories/payrollCycleCloseRepository'
import { CLOSE_CYCLES, getCloseCycleRange, shiftMonthValue } from './payCycleCalendar'
import {
  buildEmployeeAttendancePeriodDays,
  formatCloseBlockAttendanceMessage,
  isAttendanceOptionalForCloseCycle,
} from './attendancePeriodReview'
import {
  clampRangeToEmployment,
  isClosePeriodOutsideEmployment,
  resolveEmployeeEmploymentEndDate,
  resolveEmployeeEmploymentStartDate,
} from './employmentPeriodGate'
import { buildCloseConfirmationsSnapshot } from './closeConfirmations'
import { loadCorrectionRequestsForEmployeeRange } from '../attendanceEditRequestService'
import {
  canSubmitCloseCycle,
  getCloseCycleStatusLabel,
} from './closeCycleStatus'
import { getCurrentUser } from '../../constants/auth'
import { checkUnsyncedLocalInvoices } from '../invoiceLegacyMigrate'

function filterAdjustmentsForCloseCycle(adjustments, { employeeId, fromDate, toDate }) {
  return (adjustments ?? []).filter((row) => {
    if (row.employeeId !== employeeId) return false
    const date = String(row.date || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date >= fromDate && date <= toDate
    }
    return true
  })
}

function buildInvoiceDetailLines(invoices, employeeId) {
  return (invoices ?? []).map((invoice) => {
    const role = invoice.supportEmployeeId === employeeId ? 'support' : 'primary'
    const services = getInvoiceServiceDetails(invoice)
    return {
      id: invoice.id,
      date: invoice.date,
      branchId: invoice.branchId ?? '',
      branchName: invoice.branchName || getBranchName(invoice.branchId) || '',
      customerName: invoice.customerName || '',
      role,
      ticketRevenue: role === 'primary' ? getInvoiceServiceTotal(invoice) : 0,
      tips: role === 'primary' ? (Number(invoice.tips) || 0) : 0,
      commission: getInvoiceServiceCommission(invoice),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price ?? 0,
        commissionPercent: service.commissionPercent ?? 0,
        commissionAmount: service.commissionAmount ?? 0,
      })),
    }
  })
}

/**
 * Tải dữ liệu + bảng lương dự kiến theo quy ước kỳ chốt mới.
 * Không đổi công thức payrollEngine — chỉ đổi khoảng ngày nguồn.
 * Snapshot phải lấy từ cùng object preview này.
 */
export async function buildCloseCyclePreview({
  employeeId,
  billingMonth,
  cycle = CLOSE_CYCLES.PERIOD_2,
  todayDate = getTodayDate(),
}) {
  if (!employeeId || !billingMonth || !cycle) {
    throw new Error('Thiếu nhân viên / tháng / kỳ lương.')
  }
  if (cycle !== CLOSE_CYCLES.PERIOD_1 && cycle !== CLOSE_CYCLES.PERIOD_2) {
    throw new Error('Kỳ lương không hợp lệ.')
  }

  const range = getCloseCycleRange(billingMonth, cycle)
  if (!range.fromDate || !range.toDate) {
    throw new Error('Không xác định được khoảng ngày kỳ lương.')
  }

  const employee = getEmployeeById(employeeId)
  if (!employee) throw new Error('Không tìm thấy nhân viên.')
  const branchId = employee.branchId ?? ''
  if (!branchId) throw new Error('Nhân viên thiếu chi nhánh — không thể chốt kỳ.')

  const {
    startDate: employmentStartDate,
    source: employmentStartSource,
    warning: employmentStartWarning,
  } = resolveEmployeeEmploymentStartDate(employee)
  const employmentEndDate = resolveEmployeeEmploymentEndDate(employee)
  const periodBeforeEmployment = isClosePeriodOutsideEmployment(
    range,
    employmentStartDate,
    employmentEndDate,
  )
  const effectiveAttendanceRange = clampRangeToEmployment(
    range.fromDate,
    range.toDate,
    employmentStartDate,
    employmentEndDate,
  )

  const adjustmentMonths = cycle === CLOSE_CYCLES.PERIOD_1
    ? [billingMonth, shiftMonthValue(billingMonth, -1)]
    : [billingMonth]

  const [invoices, attendance, ...adjustmentGroups] = await Promise.all([
    fetchInvoicesFiltered({
      fromDate: range.fromDate,
      toDate: range.toDate,
      employeeId,
    }),
    fetchAttendanceFiltered({
      fromDate: range.fromDate,
      toDate: range.toDate,
      employeeId,
    }),
    ...adjustmentMonths.map((month) => fetchPayrollAdjustments({ month, employeeId })),
  ])

  const adjustmentsRaw = adjustmentGroups.flat()
  const seenAdj = new Set()
  const adjustments = []
  for (const row of adjustmentsRaw) {
    if (!row?.id || seenAdj.has(row.id)) continue
    seenAdj.add(row.id)
    adjustments.push(row)
  }
  const scopedAdjustments = filterAdjustmentsForCloseCycle(adjustments, {
    employeeId,
    fromDate: range.fromDate,
    toDate: range.toDate,
  })

  const payrollRow = computeEmployeePayrollRow(
    employee,
    invoices ?? [],
    attendance ?? [],
    scopedAdjustments,
  )

  const correctionRequests = await loadCorrectionRequestsForEmployeeRange(
    employeeId,
    range.fromDate,
    range.toDate,
  ).catch(() => [])

  const attendanceReview = buildEmployeeAttendancePeriodDays({
    employeeId,
    records: attendance ?? [],
    fromDate: range.fromDate,
    toDate: range.toDate,
    todayDate,
    correctionRequests,
    employmentStartDate,
    employmentEndDate,
  })

  const existing = await fetchPayrollCycleClose({ employeeId, billingMonth, cycle })
  const status = existing?.status ?? null
  const attendanceWaiver = isAttendanceOptionalForCloseCycle(billingMonth, cycle)
  const attendanceComplete = attendanceWaiver || attendanceReview.summary.isComplete

  const syncCheck = await checkUnsyncedLocalInvoices(getCurrentUser()).catch((err) => ({
    hasUnsynced: false,
    count: 0,
    error: err?.message ?? 'Không kiểm tra được hóa đơn chưa đồng bộ.',
  }))
  const invoicesSynced = !syncCheck.error && !syncCheck.hasUnsynced
  const previewLoaded = true
  const canSubmit = (
    !periodBeforeEmployment
    && canSubmitCloseCycle(status)
    && attendanceComplete
    && invoicesSynced
    && previewLoaded
  )

  const salary = {
    baseSalary: payrollRow.baseSalary ?? 0,
    ticketRevenue: payrollRow.ticketRevenue ?? 0,
    commission: payrollRow.commission ?? 0,
    tips: payrollRow.tips ?? 0,
    bonus: payrollRow.bonus ?? 0,
    penalty: payrollRow.penalty ?? 0,
    advance: payrollRow.advance ?? 0,
    reduction: payrollRow.reduction ?? 0,
    otherAdjustment: payrollRow.otherAdjustment ?? 0,
    netSalary: payrollRow.netSalary ?? 0,
    invoiceCount: payrollRow.invoiceCount ?? 0,
  }

  const details = {
    invoices: buildInvoiceDetailLines(invoices ?? [], employeeId),
    adjustments: scopedAdjustments.map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      amount: Number(row.amount ?? 0),
      reason: row.reason || '',
      note: row.note || '',
      branchId: row.branchId || '',
    })),
  }

  const preview = {
    employeeId,
    employeeName: employee.name ?? '—',
    branchId,
    branchName: getBranchName(branchId) || '',
    billingMonth,
    cycle,
    fromDate: range.fromDate,
    toDate: range.toDate,
    submitDate: range.submitDate,
    todayDate,
    employmentStartDate,
    employmentStartSource,
    employmentStartWarning,
    periodBeforeEmployment,
    effectiveAttendanceFromDate: effectiveAttendanceRange.empty
      ? ''
      : effectiveAttendanceRange.fromDate,
    effectiveAttendanceToDate: effectiveAttendanceRange.empty
      ? ''
      : effectiveAttendanceRange.toDate,
    status,
    statusLabel: status ? getCloseCycleStatusLabel(status) : 'Chưa gửi',
    existing,
    attendanceReview,
    attendanceComplete,
    attendanceWaiver,
    invoicesSynced,
    unsyncedInvoiceCount: syncCheck.count ?? 0,
    unsyncedInvoiceError: syncCheck.error || null,
    previewLoaded,
    canSubmit,
    blockReasons: [],
    infoNotes: [],
    salary,
    details,
  }

  // Snapshot gắn sẵn vào preview — UI/submit dùng chung 1 kết quả
  preview.snapshot = buildCloseCycleSnapshot(preview)

  if (periodBeforeEmployment) {
    preview.blockReasons.push(
      'Kỳ lương này nằm trước ngày bắt đầu làm việc — không áp dụng với nhân viên.',
    )
  }
  if (employmentStartWarning) {
    preview.infoNotes.push(`[Admin] ${employmentStartWarning}`)
  } else if (
    employmentStartDate
    && effectiveAttendanceRange.clamped
    && !effectiveAttendanceRange.empty
    && effectiveAttendanceRange.fromDate > range.fromDate
  ) {
    const [, m, d] = employmentStartDate.split('-')
    preview.infoNotes.push(
      `Chỉ kiểm tra chấm công từ ${d}/${m}/${employmentStartDate.slice(0, 4)} (ngày bắt đầu làm việc).`,
    )
  }
  if (attendanceWaiver) {
    preview.infoNotes.push(
      'Ngoại lệ Kỳ 1 tháng 07/2026: không bắt buộc đủ chấm công lịch sử để gửi chốt.',
    )
  } else if (!periodBeforeEmployment && !attendanceComplete) {
    preview.blockReasons.push(formatCloseBlockAttendanceMessage(attendanceReview.summary))
  }
  if (syncCheck.error) {
    preview.blockReasons.push(
      `Không kiểm tra được hóa đơn/Tour chưa đồng bộ: ${syncCheck.error}`,
    )
  } else if (syncCheck.hasUnsynced) {
    preview.blockReasons.push(
      `Còn ${syncCheck.count} hóa đơn chưa đồng bộ.`,
    )
  }
  if (!canSubmitCloseCycle(status)) {
    preview.blockReasons.push(
      status === 'approved'
        ? 'Kỳ này đã được Admin duyệt — không gửi lại.'
        : 'Kỳ này đã gửi, đang chờ Admin duyệt.',
    )
  }

  return preview
}

/** Build snapshot từ cùng preview (không tính lương lại). */
export function buildCloseCycleSnapshot(preview, confirmations = null) {
  const salary = preview.salary
  const version = Number(preview.existing?.submissionVersion ?? 0) + 1
  const capturedAt = new Date().toISOString()
  return {
    version,
    capturedAt,
    period: {
      billingMonth: preview.billingMonth,
      cycle: preview.cycle,
      fromDate: preview.fromDate,
      toDate: preview.toDate,
      submitDate: preview.submitDate,
    },
    employee: {
      id: preview.employeeId,
      name: preview.employeeName,
      branchId: preview.branchId,
      branchName: preview.branchName,
    },
    attendance: {
      summary: preview.attendanceReview.summary,
      waiver: Boolean(preview.attendanceWaiver),
      days: preview.attendanceReview.days.map((day) => ({
        date: day.date,
        result: day.result,
        resultLabel: day.resultLabel,
        status: day.status || '',
        isMissing: day.isMissing,
        isPendingCorrection: Boolean(day.isPendingCorrection),
        blocksClose: Boolean(day.blocksClose),
      })),
    },
    details: preview.details ?? { invoices: [], adjustments: [] },
    salary: { ...salary },
    totals: {
      ticketRevenue: salary.ticketRevenue,
      commission: salary.commission,
      tips: salary.tips,
      bonus: salary.bonus,
      penalty: salary.penalty,
      advance: salary.advance,
      reduction: salary.reduction,
      otherAdjustment: salary.otherAdjustment,
      baseSalary: salary.baseSalary,
      netSalary: salary.netSalary,
      invoiceCount: salary.invoiceCount,
    },
    confirmations: confirmations
      ? buildCloseConfirmationsSnapshot(confirmations, capturedAt)
      : (preview.existing?.snapshot?.confirmations ?? null),
  }
}
