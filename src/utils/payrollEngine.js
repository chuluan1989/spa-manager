import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import {
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  PAYROLL_DETAIL_CATEGORIES,
  PAYROLL_WALLET_SOURCE,
} from '../constants/payrollTypes'
import { getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { getPayrollBranchDisplayTitle, getPayrollBranchSortOrder } from '../constants/branchPayrollDisplay'
import { getBranchName } from './branchStorage'
import { isPayrollListEmployee, recordBelongsToBranch } from './branchEmployeeMatch'
import { collectEmployeeIdsWithRecordBranchActivity } from './employeeBranchTimeline'
import { getInvoiceServiceDetails, getInvoiceServiceCommission, getInvoiceServiceTotal, getServiceLineCommissionAmount } from './invoice'
import {
  computeAttendanceStats,
  computePayrollPaymentSummary,
} from './payrollLiveHelpers'
import {
  filterSalaryInvoices,
  getPayPeriodRange,
  PAY_CYCLES,
} from './salaryReport'

export function parseBaseSalary(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const amount = Number.parseInt(digits, 10)
  return Number.isFinite(amount) ? amount : 0
}

function getSalaryRole(invoice, employeeId) {
  if (employeeId && invoice.supportEmployeeId === employeeId) return SALARY_ROLES.SUPPORT
  return SALARY_ROLES.PRIMARY
}

function scaleCommission(amount, role) {
  if (role !== SALARY_ROLES.SUPPORT) return amount
  return Math.round(amount * SUPPORT_EMPLOYEE_COMMISSION_RATE)
}

function sumEmployeeInvoices(invoices, employeeId) {
  let ticketRevenue = 0
  let commission = 0
  let tips = 0
  let invoiceCount = 0

  for (const invoice of invoices) {
    const role = getSalaryRole(invoice, employeeId)
    const isPrimary = role === SALARY_ROLES.PRIMARY
    invoiceCount += 1
    if (isPrimary) {
      ticketRevenue += getInvoiceServiceTotal(invoice)
      tips += Number.isFinite(invoice.tips) ? invoice.tips : 0
    }
    commission += scaleCommission(getInvoiceServiceCommission(invoice), role)
  }

  return { ticketRevenue, commission, tips, invoiceCount }
}

function sumAdjustments(adjustments, employeeId, type) {
  return adjustments
    .filter((row) => row.employeeId === employeeId && row.type === type)
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

function sumAttendancePenalty(attendanceRecords, employeeId) {
  return attendanceRecords
    .filter((row) => row.employeeId === employeeId)
    .reduce((sum, row) => sum + Number(row.penaltyAmount ?? 0), 0)
}

export function computeNetSalary(parts) {
  return (
    parts.baseSalary
    + parts.commission
    + parts.tips
    + parts.bonus
    + (parts.kpi ?? 0)
    - parts.reduction
    - parts.penalty
    - parts.advance
    // otherAdjustment (Điều chỉnh khác) — legacy: vẫn tính trên payrollRow để audit,
    // KHÔNG còn cộng vào lương thực nhận vận hành.
  )
}

function collectEmployeeRecordBranchIds(invoices, attendanceRecords, adjustments, employeeId) {
  const ids = new Set()
  for (const invoice of invoices) {
    if (invoice.employeeId !== employeeId && invoice.supportEmployeeId !== employeeId) continue
    const branchId = invoice.branchId ?? ''
    if (branchId) ids.add(branchId)
  }
  for (const row of attendanceRecords) {
    if (row.employeeId !== employeeId) continue
    const branchId = row.branchId ?? ''
    if (branchId) ids.add(branchId)
  }
  for (const row of adjustments) {
    if (row.employeeId !== employeeId) continue
    const branchId = row.branchId ?? ''
    if (branchId) ids.add(branchId)
  }
  return ids
}

function filterEmployeeRecordsByBranch(invoices, attendanceRecords, adjustments, employeeId, branchId) {
  const scopedInvoices = invoices.filter((invoice) => {
    if (invoice.employeeId !== employeeId && invoice.supportEmployeeId !== employeeId) return false
    return recordBelongsToBranch(invoice, branchId)
  })
  const scopedAttendance = attendanceRecords.filter(
    (row) => row.employeeId === employeeId && recordBelongsToBranch(row, branchId),
  )
  const scopedAdjustments = adjustments.filter(
    (row) => row.employeeId === employeeId && recordBelongsToBranch(row, branchId),
  )
  return { scopedInvoices, scopedAttendance, scopedAdjustments }
}

function collectRecordDateRange(invoices, attendanceRecords, adjustments) {
  let fromDate = ''
  let toDate = ''
  const consider = (value) => {
    const date = String(value ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    if (!fromDate || date < fromDate) fromDate = date
    if (!toDate || date > toDate) toDate = date
  }
  for (const invoice of invoices ?? []) consider(invoice.date)
  for (const row of attendanceRecords ?? []) consider(row.date || row.attendanceDate)
  for (const row of adjustments ?? []) consider(row.date || row.effectiveDate)
  return { fromDate: fromDate || null, toDate: toDate || null }
}

function computeEmployeePayrollBranchSection(employee, invoices, attendanceRecords, adjustments, branchId) {
  const employeeId = employee.id
  const invoiceTotals = sumEmployeeInvoices(invoices, employeeId)
  const attendancePenalty = sumAttendancePenalty(attendanceRecords, employeeId)
  const manualPenalty = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.PENALTY)
  const bonus = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.BONUS)
  const reduction = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.REDUCTION)
  const advance = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.ADVANCE)
  const otherAdjustment = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT)
  const kpi = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.KPI)
  const parts = {
    baseSalary: 0,
    ticketRevenue: invoiceTotals.ticketRevenue,
    commission: invoiceTotals.commission,
    tips: invoiceTotals.tips,
    bonus,
    kpi,
    reduction,
    penalty: attendancePenalty + manualPenalty,
    attendancePenalty,
    manualPenalty,
    advance,
    otherAdjustment,
  }
  const { workDays } = computeAttendanceStats(attendanceRecords, employeeId)
  const { fromDate, toDate } = collectRecordDateRange(invoices, attendanceRecords, adjustments)

  return {
    branchId,
    branchName: getPayrollBranchDisplayTitle(branchId, getBranchName(branchId)),
    fromDate,
    toDate,
    invoiceCount: invoiceTotals.invoiceCount,
    workDays,
    ...parts,
    netSalary: computeNetSalary(parts),
  }
}

export function computeEmployeePayrollBranchSections(employee, invoices, attendanceRecords, adjustments) {
  const employeeId = employee.id
  const branchIds = collectEmployeeRecordBranchIds(invoices, attendanceRecords, adjustments, employeeId)
  if (branchIds.size <= 1) return null

  return [...branchIds]
    .sort((a, b) => {
      const orderDiff = getPayrollBranchSortOrder(a) - getPayrollBranchSortOrder(b)
      if (orderDiff !== 0) return orderDiff
      return getBranchName(a).localeCompare(getBranchName(b), 'vi')
    })
    .map((branchId) => {
      const { scopedInvoices, scopedAttendance, scopedAdjustments } = filterEmployeeRecordsByBranch(
        invoices,
        attendanceRecords,
        adjustments,
        employeeId,
        branchId,
      )
      return computeEmployeePayrollBranchSection(
        employee,
        scopedInvoices,
        scopedAttendance,
        scopedAdjustments,
        branchId,
      )
    })
}

export function computeEmployeePayrollRow(employee, invoices, attendanceRecords, adjustments) {
  const employeeId = employee.id
  const scopedInvoices = invoices.filter(
    (invoice) => invoice.employeeId === employeeId || invoice.supportEmployeeId === employeeId,
  )
  const invoiceTotals = sumEmployeeInvoices(scopedInvoices, employeeId)
  const attendancePenalty = sumAttendancePenalty(attendanceRecords, employeeId)
  const manualPenalty = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.PENALTY)
  const bonus = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.BONUS)
  const reduction = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.REDUCTION)
  const advance = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.ADVANCE)
  const otherAdjustment = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT)
  const kpi = sumAdjustments(adjustments, employeeId, PAYROLL_ADJUSTMENT_TYPES.KPI)
  const baseSalary = parseBaseSalary(employee.salaryRate)

  const parts = {
    baseSalary,
    ticketRevenue: invoiceTotals.ticketRevenue,
    commission: invoiceTotals.commission,
    tips: invoiceTotals.tips,
    bonus,
    kpi,
    reduction,
    penalty: attendancePenalty + manualPenalty,
    attendancePenalty,
    manualPenalty,
    advance,
    otherAdjustment,
  }

  const netSalary = computeNetSalary(parts)
  const grossBeforeDeduction = (
    parts.baseSalary + parts.commission + parts.tips + parts.bonus + (parts.kpi ?? 0)
    - parts.reduction - parts.penalty
  )
  const paymentSummary = computePayrollPaymentSummary(adjustments, employeeId, netSalary)
  const { workDays } = computeAttendanceStats(attendanceRecords, employeeId)
  const branchSections = computeEmployeePayrollBranchSections(
    employee,
    scopedInvoices,
    attendanceRecords,
    adjustments,
  )

  return {
    employeeId,
    employeeName: employee.name ?? '—',
    branchId: employee.branchId ?? '',
    branchName: getPayrollBranchDisplayTitle(employee.branchId, getBranchName(employee.branchId)) || '—',
    position: employee.position ?? '',
    avatar: employee.avatar ?? '',
    invoiceCount: invoiceTotals.invoiceCount,
    workDays,
    branchSections,
    ...parts,
    grossBeforeDeduction,
    netSalary,
    ...paymentSummary,
  }
}

export function computePayrollReport({
  month,
  cycle = PAY_CYCLES.FULL,
  branchId,
  employeeId,
  employees,
  invoices,
  attendanceRecords,
  adjustments,
}) {
  const { fromDate, toDate } = getPayPeriodRange(month, cycle)
  const scopedInvoices = filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId })
  const scopedAttendance = (attendanceRecords ?? []).filter((row) => {
    if (branchId && !recordBelongsToBranch(row, branchId)) return false
    if (employeeId && row.employeeId !== employeeId) return false
    return true
  })
  const scopedAdjustments = (adjustments ?? []).filter((row) => {
    if (row.month !== month) return false
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    if (branchId && !recordBelongsToBranch(row, branchId)) return false
    if (employeeId && row.employeeId !== employeeId) return false
    return true
  })

  const branchActivityIds = branchId && !employeeId
    ? collectEmployeeIdsWithRecordBranchActivity(branchId, [
        ...scopedInvoices,
        ...scopedAttendance,
        ...scopedAdjustments,
      ])
    : null

  const scopedEmployees = employees.filter((employee) => {
    if (employeeId && employee.id !== employeeId) return false
    if (branchActivityIds && !branchActivityIds.has(employee.id)) return false
    if (!isPayrollListEmployee(employee, '')) return false
    return true
  })

  // AttendanceRecords đã được hook lọc theo đúng logic Kỳ 1/Kỳ 2.

  const rows = scopedEmployees
    .map((employee) => computeEmployeePayrollRow(employee, scopedInvoices, scopedAttendance, scopedAdjustments))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))

  const dashboard = rows.reduce(
    (acc, row) => {
      acc.baseSalary += row.baseSalary
      acc.ticketRevenue += row.ticketRevenue
      acc.commission += row.commission
      acc.tips += row.tips
      acc.bonus += row.bonus
      acc.kpi += row.kpi ?? 0
      acc.reduction += row.reduction
      acc.penalty += row.penalty
      acc.advance += row.advance
      acc.otherAdjustment += row.otherAdjustment
      acc.netSalary += row.netSalary
      return acc
    },
    {
      employeeCount: scopedEmployees.length,
      baseSalary: 0,
      ticketRevenue: 0,
      commission: 0,
      tips: 0,
      bonus: 0,
      kpi: 0,
      reduction: 0,
      penalty: 0,
      advance: 0,
      otherAdjustment: 0,
      netSalary: 0,
    },
  )

  return {
    month,
    fromDate,
    toDate,
    rows,
    dashboard,
  }
}

export function buildWalletTimeline(employeeId, invoices, attendanceRecords, adjustments, options = {}) {
  const entries = []
  const invoiceBranchId = options.invoiceBranchId || ''

  for (const adjustment of adjustments.filter((row) => row.employeeId === employeeId)) {
    // Điều chỉnh khác — legacy: không đưa vào timeline vận hành (chỉ còn trong audit/DB).
    if (adjustment.type === PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT) continue
    const isDebit = [
      PAYROLL_ADJUSTMENT_TYPES.PENALTY,
      PAYROLL_ADJUSTMENT_TYPES.ADVANCE,
      PAYROLL_ADJUSTMENT_TYPES.REDUCTION,
      PAYROLL_ADJUSTMENT_TYPES.PAYMENT,
    ].includes(adjustment.type)
    let signedAmount
    if (adjustment.type === PAYROLL_ADJUSTMENT_TYPES.KPI) {
      signedAmount = Number(adjustment.amount ?? 0)
    } else if (adjustment.type === PAYROLL_ADJUSTMENT_TYPES.PAYMENT) {
      signedAmount = -Math.abs(Number(adjustment.amount ?? 0))
    } else {
      signedAmount = isDebit
        ? -Math.abs(Number(adjustment.amount ?? 0))
        : Math.abs(Number(adjustment.amount ?? 0))
    }

    entries.push({
      id: adjustment.id,
      date: adjustment.date,
      time: '',
      source: PAYROLL_WALLET_SOURCE.MANUAL,
      type: adjustment.type,
      category: adjustment.type,
      label: PAYROLL_ADJUSTMENT_LABELS[adjustment.type] ?? adjustment.type,
      amount: signedAmount,
      reason: adjustment.reason || adjustment.note || '',
      createdBy: adjustment.createdByName || adjustment.createdBy || '',
    })
  }

  for (const record of attendanceRecords.filter((row) => row.employeeId === employeeId && Number(row.penaltyAmount) > 0)) {
    entries.push({
      id: record.id,
      date: record.date,
      time: '',
      source: PAYROLL_WALLET_SOURCE.ATTENDANCE,
      type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
      category: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
      label: 'Phạt chấm công',
      amount: -Number(record.penaltyAmount),
      reason: getAttendanceStatusLabel(record.status),
      createdBy: 'Hệ thống',
    })
  }

  for (const invoice of invoices.filter(
    (row) => {
      if (row.employeeId !== employeeId && row.supportEmployeeId !== employeeId) return false
      // Danh sách HĐ ví theo CN đang xem; tiền CN khác chỉ nằm trong net (stats).
      if (invoiceBranchId && !recordBelongsToBranch(row, invoiceBranchId)) return false
      return true
    },
  )) {
    const role = getSalaryRole(invoice, employeeId)
    const services = getInvoiceServiceDetails(invoice).map((service) => service.name).join(', ') || 'Dịch vụ'
    const customer = invoice.customerName ? `Khách ${invoice.customerName}` : 'Khách hàng'
    const commission = scaleCommission(getInvoiceServiceCommission(invoice), role)
    const tips = role === SALARY_ROLES.PRIMARY ? Number(invoice.tips ?? 0) : 0
    const ticketRevenue = role === SALARY_ROLES.PRIMARY ? getInvoiceServiceTotal(invoice) : 0

    if (commission > 0) {
      entries.push({
        id: `${invoice.id}-commission`,
        date: invoice.date,
        time: invoice.invoiceTime ?? '',
        source: PAYROLL_WALLET_SOURCE.INVOICE,
        type: PAYROLL_DETAIL_CATEGORIES.COMMISSION,
        category: PAYROLL_DETAIL_CATEGORIES.COMMISSION,
        label: `Hoa hồng · ${services}`,
        amount: commission,
        reason: customer,
        createdBy: 'Hệ thống',
        meta: { invoiceId: invoice.id, ticketRevenue, role },
      })
    }

    if (tips > 0) {
      entries.push({
        id: `${invoice.id}-tips`,
        date: invoice.date,
        time: invoice.invoiceTime ?? '',
        source: PAYROLL_WALLET_SOURCE.INVOICE,
        type: PAYROLL_DETAIL_CATEGORIES.TIPS,
        category: PAYROLL_DETAIL_CATEGORIES.TIPS,
        label: `Tips · ${services}`,
        amount: tips,
        reason: customer,
        createdBy: 'Hệ thống',
        meta: { invoiceId: invoice.id, role },
      })
    }
  }

  return entries.sort((a, b) => {
    const dateCmp = (a.date ?? '').localeCompare(b.date ?? '')
    if (dateCmp !== 0) return dateCmp
    const timeCmp = (a.time ?? '').localeCompare(b.time ?? '')
    if (timeCmp !== 0) return timeCmp
    return String(a.id).localeCompare(String(b.id))
  })
}

export function filterWalletByCategory(entries, category) {
  if (!category || category === PAYROLL_DETAIL_CATEGORIES.NET) return entries
  if (category === PAYROLL_DETAIL_CATEGORIES.COMMISSION) {
    return entries.filter((entry) => entry.category === PAYROLL_DETAIL_CATEGORIES.COMMISSION)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.TIPS) {
    return entries.filter((entry) => entry.category === PAYROLL_DETAIL_CATEGORIES.TIPS)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.REVENUE) {
    return entries.filter((entry) => entry.source === PAYROLL_WALLET_SOURCE.INVOICE)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.PENALTY) {
    return entries.filter((entry) =>
      entry.type === PAYROLL_ADJUSTMENT_TYPES.PENALTY || entry.source === PAYROLL_WALLET_SOURCE.ATTENDANCE,
    )
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.BONUS) {
    return entries.filter((entry) => entry.type === PAYROLL_ADJUSTMENT_TYPES.BONUS)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.ADVANCE) {
    return entries.filter((entry) => entry.type === PAYROLL_ADJUSTMENT_TYPES.ADVANCE)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.REDUCTION) {
    return entries.filter((entry) => entry.type === PAYROLL_ADJUSTMENT_TYPES.REDUCTION)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.ADJUSTMENT) {
    return entries.filter((entry) => entry.type === PAYROLL_ADJUSTMENT_TYPES.ADJUSTMENT)
  }
  if (category === PAYROLL_DETAIL_CATEGORIES.KPI) {
    return entries.filter((entry) => entry.type === PAYROLL_ADJUSTMENT_TYPES.KPI)
  }
  return entries
}

export function isPayrollMonthLocked(month, branchId, locks) {
  const globalLock = locks.find((lock) => lock.month === month && !lock.branchId && lock.isLocked)
  if (globalLock) return true
  if (!branchId) {
    return locks.some((lock) => lock.month === month && lock.isLocked)
  }
  return locks.some((lock) => lock.month === month && lock.branchId === branchId && lock.isLocked)
}
