import { getAttendanceStatusConfig, getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { PAYROLL_ADJUSTMENT_LABELS } from '../constants/payrollTypes'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import {
  buildWalletTimeline,
  computeEmployeePayrollRow,
  computeNetSalary,
} from './payrollEngine'
import {
  getInvoiceServiceDetails,
  getServiceLineCommissionAmount,
} from './invoice'
import { readInvoiceTime } from './invoiceFilters'
import {
  filterSalaryInvoices,
  formatDisplayDate,
  getPayCycleLabel,
} from './salaryReport'

function getSalaryRole(invoice, employeeId) {
  if (employeeId && invoice.supportEmployeeId === employeeId) return SALARY_ROLES.SUPPORT
  return SALARY_ROLES.PRIMARY
}

function scaleCommission(amount, role) {
  if (role !== SALARY_ROLES.SUPPORT) return amount
  return Math.round(amount * SUPPORT_EMPLOYEE_COMMISSION_RATE)
}

export function computeGrossIncome(row) {
  return (
    (row.baseSalary ?? 0)
    + (row.commission ?? 0)
    + (row.tips ?? 0)
    + (row.bonus ?? 0)
    + (row.otherAdjustment ?? 0)
    - (row.reduction ?? 0)
  )
}

export function mapPayrollRowForExport(row, month = '') {
  return {
    month,
    branchId: row.branchId ?? '',
    employeeId: row.employeeId ?? '',
    employeeName: row.employeeName ?? '—',
    ticketRevenue: row.ticketRevenue ?? 0,
    commission: row.commission ?? 0,
    tips: row.tips ?? 0,
    baseSalary: row.baseSalary ?? 0,
    bonus: row.bonus ?? 0,
    penalty: row.penalty ?? 0,
    attendancePenalty: row.attendancePenalty ?? 0,
    manualPenalty: row.manualPenalty ?? 0,
    advance: row.advance ?? 0,
    otherAdjustment: row.otherAdjustment ?? 0,
    grossIncome: computeGrossIncome(row),
    netSalary: row.netSalary ?? 0,
    paidAmount: row.paidAmount ?? 0,
    remainingAmount: row.remainingAmount ?? 0,
    workDays: row.workDays ?? 0,
  }
}

function buildInvoiceServiceLines(invoices, employeeId, periodFilter) {
  const lines = []
  const scoped = filterSalaryInvoices(invoices, { ...periodFilter, employeeId })
    .filter((inv) => inv.employeeId === employeeId || inv.supportEmployeeId === employeeId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  for (const invoice of scoped) {
    const role = getSalaryRole(invoice, employeeId)
    const services = getInvoiceServiceDetails(invoice)
    const tips = role === SALARY_ROLES.PRIMARY ? Number(invoice.tips ?? 0) : 0
    const roleLabel = role === SALARY_ROLES.SUPPORT ? 'Hỗ trợ' : 'Chính'

    if (!services.length) {
      lines.push({
        date: invoice.date,
        displayDate: formatDisplayDate(invoice.date),
        time: readInvoiceTime(invoice),
        invoiceId: invoice.id,
        customerName: invoice.customerName || '—',
        serviceName: '—',
        price: 0,
        commissionPercent: 0,
        commissionAmount: 0,
        tips,
        earnedAmount: tips,
        roleLabel,
        sortKey: `${invoice.date}T${readInvoiceTime(invoice)}:${invoice.id}:0`,
      })
      continue
    }

    services.forEach((service, index) => {
      const baseCommission = getServiceLineCommissionAmount(service, {
        branchId: invoice.branchId,
        preferSnapshot: true,
      })
      const commissionAmount = scaleCommission(baseCommission, role)
      const lineTips = index === 0 ? tips : 0
      const price = Number(service.price ?? service.originalPrice ?? 0)
      const commissionPercent = Number(service.commissionPercent ?? 0)
      lines.push({
        date: invoice.date,
        displayDate: formatDisplayDate(invoice.date),
        time: readInvoiceTime(invoice),
        invoiceId: invoice.id,
        customerName: invoice.customerName || '—',
        serviceName: service.name ?? '—',
        price,
        commissionPercent,
        commissionAmount,
        tips: lineTips,
        earnedAmount: commissionAmount + lineTips,
        roleLabel,
        sortKey: `${invoice.date}T${readInvoiceTime(invoice)}:${invoice.id}:${index}`,
      })
    })
  }

  return lines.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

function groupInvoiceLinesByDay(lines) {
  const byDate = new Map()
  for (const line of lines) {
    if (!byDate.has(line.date)) byDate.set(line.date, [])
    byDate.get(line.date).push(line)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayLines]) => ({
      date,
      displayDate: formatDisplayDate(date),
      lines: dayLines,
      totals: {
        price: dayLines.reduce((sum, row) => sum + row.price, 0),
        commission: dayLines.reduce((sum, row) => sum + row.commissionAmount, 0),
        tips: dayLines.reduce((sum, row) => sum + row.tips, 0),
        earned: dayLines.reduce((sum, row) => sum + row.earnedAmount, 0),
        invoiceCount: new Set(dayLines.map((row) => row.invoiceId)).size,
      },
    }))
}

function buildAttendanceExportRows(attendanceRecords, employeeId) {
  return (attendanceRecords ?? [])
    .filter((row) => row.employeeId === employeeId)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map((row) => {
      const config = getAttendanceStatusConfig(row.status)
      const statGroup = config?.statGroup ?? ''
      return {
        date: row.date,
        displayDate: formatDisplayDate(row.date),
        status: row.status,
        statusLabel: getAttendanceStatusLabel(row.status),
        checkIn: '—',
        checkOut: '—',
        isLate: statGroup === 'late' || statGroup === 'late_permitted' ? 'Có' : '',
        isEarly: statGroup === 'early' || statGroup === 'early_permitted' ? 'Có' : '',
        penaltyAmount: Number(row.penaltyAmount ?? 0),
        note: row.reason || row.note || '',
      }
    })
}

function buildWalletExportRows(walletEntries) {
  return (walletEntries ?? []).map((entry) => ({
    date: entry.date,
    displayDate: formatDisplayDate(entry.date),
    time: entry.time || '',
    label: entry.label ?? '',
    typeLabel: PAYROLL_ADJUSTMENT_LABELS[entry.type] ?? entry.label ?? entry.type ?? '—',
    amount: Number(entry.amount ?? 0),
    reason: entry.reason ?? '',
    createdBy: entry.createdBy ?? '',
  }))
}

function buildAnalysis(invoiceLines, payrollRow) {
  const invoiceIds = new Set(invoiceLines.map((line) => line.invoiceId))
  const invoiceCount = invoiceIds.size
  const totalRevenue = invoiceLines.reduce((sum, row) => sum + row.price, 0)
  const avgInvoice = invoiceCount > 0 ? Math.round(totalRevenue / invoiceCount) : 0
  const avgTips = invoiceCount > 0 ? Math.round((payrollRow.tips ?? 0) / invoiceCount) : 0
  const avgCommissionPercent = invoiceLines.length
    ? Math.round(
      invoiceLines.reduce((sum, row) => sum + row.commissionPercent, 0) / invoiceLines.length,
    )
    : 0

  const serviceCounts = new Map()
  for (const line of invoiceLines) {
    const key = line.serviceName || '—'
    serviceCounts.set(key, (serviceCounts.get(key) ?? 0) + 1)
  }
  const topService = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  const revenueByDay = new Map()
  const tipsByDay = new Map()
  for (const line of invoiceLines) {
    revenueByDay.set(line.date, (revenueByDay.get(line.date) ?? 0) + line.price)
    tipsByDay.set(line.date, (tipsByDay.get(line.date) ?? 0) + line.tips)
  }

  const topRevenueDay = [...revenueByDay.entries()].sort((a, b) => b[1] - a[1])[0]
  const topTipsDay = [...tipsByDay.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    invoiceCount,
    avgInvoiceValue: avgInvoice,
    topServiceName: topService?.[0] ?? '—',
    topServiceCount: topService?.[1] ?? 0,
    avgTipsPerInvoice: avgTips,
    avgCommissionPercent,
    topRevenueDay: topRevenueDay ? formatDisplayDate(topRevenueDay[0]) : '—',
    topRevenueDayAmount: topRevenueDay?.[1] ?? 0,
    topTipsDay: topTipsDay ? formatDisplayDate(topTipsDay[0]) : '—',
    topTipsDayAmount: topTipsDay?.[1] ?? 0,
  }
}

export function reconcilePayrollExport({ payrollRow, invoiceLines }) {
  const errors = []
  const invoiceCommission = invoiceLines.reduce((sum, row) => sum + row.commissionAmount, 0)
  const invoiceTips = invoiceLines.reduce((sum, row) => sum + row.tips, 0)

  if (invoiceCommission !== (payrollRow.commission ?? 0)) {
    errors.push(
      `Hoa hồng hóa đơn (${invoiceCommission.toLocaleString('vi-VN')}) ≠ Hoa hồng lương (${(payrollRow.commission ?? 0).toLocaleString('vi-VN')})`,
    )
  }

  if (invoiceTips !== (payrollRow.tips ?? 0)) {
    errors.push(
      `Tips hóa đơn (${invoiceTips.toLocaleString('vi-VN')}) ≠ Tips lương (${(payrollRow.tips ?? 0).toLocaleString('vi-VN')})`,
    )
  }

  const expectedNet = computeNetSalary({
    baseSalary: payrollRow.baseSalary ?? 0,
    commission: payrollRow.commission ?? 0,
    tips: payrollRow.tips ?? 0,
    bonus: payrollRow.bonus ?? 0,
    reduction: payrollRow.reduction ?? 0,
    penalty: payrollRow.penalty ?? 0,
    advance: payrollRow.advance ?? 0,
    otherAdjustment: payrollRow.otherAdjustment ?? 0,
  })

  if (expectedNet !== (payrollRow.netSalary ?? 0)) {
    errors.push(
      `Thực nhận engine (${expectedNet.toLocaleString('vi-VN')}) ≠ Thực nhận UI (${(payrollRow.netSalary ?? 0).toLocaleString('vi-VN')})`,
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    totals: {
      invoiceCommission,
      invoiceTips,
      expectedNet,
    },
  }
}

export function buildEmployeePayrollExportData({
  employee,
  payrollRow,
  invoices,
  attendanceRecords,
  adjustments,
  month,
  cycle,
  fromDate,
  toDate,
}) {
  const row = payrollRow ?? computeEmployeePayrollRow(employee, invoices, attendanceRecords, adjustments)
  const periodFilter = { fromDate, toDate }
  const scopedInvoices = filterSalaryInvoices(invoices, { ...periodFilter, employeeId: row.employeeId })
  const scopedAdjustments = (adjustments ?? []).filter((item) => {
    if (item.employeeId !== row.employeeId) return false
    if (item.month !== month) return false
    if (fromDate && item.date < fromDate) return false
    if (toDate && item.date > toDate) return false
    return true
  })
  const invoiceLines = buildInvoiceServiceLines(invoices, row.employeeId, periodFilter)
  const invoiceDays = groupInvoiceLinesByDay(invoiceLines)
  const walletEntries = buildWalletTimeline(row.employeeId, scopedInvoices, attendanceRecords, scopedAdjustments)
  const walletRows = buildWalletExportRows(walletEntries)
  const attendanceRows = buildAttendanceExportRows(attendanceRecords, row.employeeId)
  const analysis = buildAnalysis(invoiceLines, row)
  const reconciliation = reconcilePayrollExport({ payrollRow: row, invoiceLines })

  return {
    meta: {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      branchId: row.branchId,
      branchName: row.branchName,
      month,
      cycle,
      cycleLabel: getPayCycleLabel(cycle),
      fromDate,
      toDate,
      exportedAt: new Date().toISOString(),
    },
    summary: mapPayrollRowForExport(row, month),
    invoiceLines,
    invoiceDays,
    walletRows,
    attendanceRows,
    analysis,
    reconciliation,
  }
}

export function buildBranchPayrollExportData({
  rows,
  branchId,
  branchName,
  month,
  cycle,
  fromDate,
  toDate,
}) {
  const mapped = (rows ?? []).map((row) => mapPayrollRowForExport(row, month))
  const totals = mapped.reduce(
    (acc, row) => {
      acc.ticketRevenue += row.ticketRevenue
      acc.commission += row.commission
      acc.tips += row.tips
      acc.baseSalary += row.baseSalary
      acc.bonus += row.bonus
      acc.penalty += row.penalty
      acc.advance += row.advance
      acc.otherAdjustment += row.otherAdjustment
      acc.grossIncome += row.grossIncome
      acc.netSalary += row.netSalary
      acc.paidAmount += row.paidAmount
      acc.remainingAmount += row.remainingAmount
      return acc
    },
    {
      ticketRevenue: 0,
      commission: 0,
      tips: 0,
      baseSalary: 0,
      bonus: 0,
      penalty: 0,
      advance: 0,
      otherAdjustment: 0,
      grossIncome: 0,
      netSalary: 0,
      paidAmount: 0,
      remainingAmount: 0,
    },
  )

  return {
    meta: {
      branchId,
      branchName,
      month,
      cycle,
      cycleLabel: getPayCycleLabel(cycle),
      fromDate,
      toDate,
      exportedAt: new Date().toISOString(),
    },
    rows: mapped,
    totals,
  }
}
