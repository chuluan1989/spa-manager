import { getAttendanceStatusConfig, isVoidAttendanceStatus } from '../constants/attendanceTypes'
import { PAYROLL_ADJUSTMENT_TYPES } from '../constants/payrollTypes'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import { getInvoiceServiceDetails, getInvoiceServiceCommission, getInvoiceServiceTotal, getServiceLineCommissionAmount } from './invoice'

function getSalaryRole(invoice, employeeId) {
  if (employeeId && invoice.supportEmployeeId === employeeId) return SALARY_ROLES.SUPPORT
  return SALARY_ROLES.PRIMARY
}

function scaleCommission(amount, role) {
  if (role !== SALARY_ROLES.SUPPORT) return amount
  return Math.round(amount * SUPPORT_EMPLOYEE_COMMISSION_RATE)
}

function getInvoiceCommission(invoice, employeeId) {
  const role = getSalaryRole(invoice, employeeId)
  const base = getInvoiceServiceCommission(invoice)
  return scaleCommission(base, role)
}

export function computeAttendanceStats(attendanceRecords, employeeId) {
  const stats = {
    onTime: 0,
    late: 0,
    early: 0,
    permittedLeave: 0,
    unpermittedLeave: 0,
    weekendHoliday: 0,
    penaltyAmount: 0,
    workDays: 0,
    totalRecords: 0,
  }

  for (const record of attendanceRecords.filter((row) => row.employeeId === employeeId)) {
    if (isVoidAttendanceStatus(record.status)) continue
    stats.totalRecords += 1
    stats.penaltyAmount += Number(record.penaltyAmount ?? 0)
    const config = getAttendanceStatusConfig(record.status)
    if (!config) continue

    switch (config.statGroup) {
      case 'on_time':
        stats.onTime += 1
        stats.workDays += 1
        break
      case 'late':
        stats.late += 1
        break
      case 'early':
        stats.early += 1
        break
      case 'late_permitted':
      case 'early_permitted':
        stats.permittedLeave += 1
        break
      case 'half_off_permitted':
        stats.permittedLeave += 0.5
        stats.workDays += 0.5
        break
      case 'full_off_permitted':
        stats.permittedLeave += 1
        break
      case 'half_off_unpermitted':
        stats.unpermittedLeave += 0.5
        break
      case 'full_off_unpermitted':
        stats.unpermittedLeave += 1
        break
      case 'weekend':
        stats.weekendHoliday += 1
        break
      default:
        break
    }
  }

  return stats
}

export function computePayrollPaymentSummary(adjustments, employeeId, netSalary) {
  const paidAmount = adjustments
    .filter((row) => row.employeeId === employeeId && row.type === PAYROLL_ADJUSTMENT_TYPES.PAYMENT)
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  return {
    paidAmount,
    remainingAmount: Math.max(0, netSalary - paidAmount),
    provisionalNet: netSalary,
  }
}

export function buildInvoiceRevenueList(invoices, employeeId) {
  return invoices
    .filter((invoice) => invoice.employeeId === employeeId || invoice.supportEmployeeId === employeeId)
    .map((invoice) => {
      const role = getSalaryRole(invoice, employeeId)
      const services = getInvoiceServiceDetails(invoice).map((service) => service.name).join(', ')
      return {
        id: invoice.id,
        date: invoice.date,
        time: invoice.invoiceTime ?? '',
        customerName: invoice.customerName || '—',
        services: services || '—',
        branchName: invoice.branchName || '—',
        ticketRevenue: role === SALARY_ROLES.PRIMARY ? getInvoiceServiceTotal(invoice) : 0,
        commission: getInvoiceCommission(invoice, employeeId),
        tips: role === SALARY_ROLES.PRIMARY ? Number(invoice.tips ?? 0) : 0,
        role,
      }
    })
    .sort((a, b) => {
      const dateCmp = (b.date ?? '').localeCompare(a.date ?? '')
      if (dateCmp !== 0) return dateCmp
      return (b.time ?? '').localeCompare(a.time ?? '')
    })
}

export function buildTipsBreakdown(invoices, employeeId) {
  return buildInvoiceRevenueList(invoices, employeeId)
    .filter((row) => row.tips > 0)
    .map((row) => ({
      id: `${row.id}-tips`,
      invoiceId: row.id,
      date: row.date,
      time: row.time,
      customerName: row.customerName,
      services: row.services,
      tips: row.tips,
    }))
}

export function buildAdjustmentHistory(adjustments, employeeId, type) {
  return adjustments
    .filter((row) => row.employeeId === employeeId && row.type === type)
    .map((row) => ({
      id: row.id,
      date: row.date,
      amount: Number(row.amount ?? 0),
      reason: row.reason || row.note || '',
      content: row.reason || row.note || '',
      createdBy: row.createdByName || row.createdBy || '',
      note: row.note || '',
      expenseId: row.expenseId || '',
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export function formatPayrollTime(time) {
  if (!time) return ''
  const parts = String(time).trim().split(':')
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  return time
}
