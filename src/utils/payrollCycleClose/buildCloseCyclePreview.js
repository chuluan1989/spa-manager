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
  formatMissingDaysMessage,
} from './attendancePeriodReview'
import {
  canSubmitCloseCycle,
  getCloseCycleStatusLabel,
} from './closeCycleStatus'

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

  const attendanceReview = buildEmployeeAttendancePeriodDays({
    employeeId,
    records: attendance ?? [],
    fromDate: range.fromDate,
    toDate: range.toDate,
    todayDate,
  })

  const existing = await fetchPayrollCycleClose({ employeeId, billingMonth, cycle })
  const status = existing?.status ?? null
  const attendanceComplete = attendanceReview.summary.isComplete
  const canSubmit = canSubmitCloseCycle(status) && attendanceComplete

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
    status,
    statusLabel: status ? getCloseCycleStatusLabel(status) : 'Chưa gửi',
    existing,
    attendanceReview,
    attendanceComplete,
    canSubmit,
    blockReasons: [],
    salary,
    details,
  }

  // Snapshot gắn sẵn vào preview — UI/submit dùng chung 1 kết quả
  preview.snapshot = buildCloseCycleSnapshot(preview)

  if (!attendanceComplete) {
    preview.blockReasons.push(formatMissingDaysMessage(attendanceReview.summary))
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
export function buildCloseCycleSnapshot(preview) {
  const salary = preview.salary
  const version = Number(preview.existing?.submissionVersion ?? 0) + 1
  return {
    version,
    capturedAt: new Date().toISOString(),
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
      days: preview.attendanceReview.days.map((day) => ({
        date: day.date,
        result: day.result,
        resultLabel: day.resultLabel,
        status: day.status || '',
        isMissing: day.isMissing,
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
  }
}
