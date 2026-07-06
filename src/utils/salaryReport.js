import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { getInvoiceServiceDetails, getInvoiceServiceTotal } from './invoice'

export const PAY_CYCLES = {
  PERIOD_1: 'period1',
  PERIOD_2: 'period2',
  FULL: 'full',
}

export const PAY_CYCLE_OPTIONS = [
  { value: PAY_CYCLES.PERIOD_1, label: 'Kỳ 1 (ngày 1 – 15)' },
  { value: PAY_CYCLES.PERIOD_2, label: 'Kỳ 2 (ngày 16 – cuối tháng)' },
  { value: PAY_CYCLES.FULL, label: 'Cả tháng' },
]

export function getCurrentMonthValue() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

export function getPayPeriodRange(monthValue, cycle) {
  if (!monthValue) return { fromDate: '', toDate: '' }

  const [yearStr, monthStr] = monthValue.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const lastDay = getLastDayOfMonth(year, month)
  const mm = String(month).padStart(2, '0')

  if (cycle === PAY_CYCLES.PERIOD_1) {
    return { fromDate: `${year}-${mm}-01`, toDate: `${year}-${mm}-15` }
  }

  if (cycle === PAY_CYCLES.PERIOD_2) {
    return { fromDate: `${year}-${mm}-16`, toDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
  }

  return {
    fromDate: `${year}-${mm}-01`,
    toDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function getPayCycleLabel(cycle) {
  return PAY_CYCLE_OPTIONS.find((option) => option.value === cycle)?.label ?? '—'
}

export function formatDisplayDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function getInvoiceTips(invoice) {
  return Number.isFinite(invoice.tips) ? invoice.tips : 0
}

function scaleCommissionAmount(amount, role) {
  if (role !== SALARY_ROLES.SUPPORT) return amount
  return Math.round(amount * SUPPORT_EMPLOYEE_COMMISSION_RATE)
}

function filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId }) {
  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false
    if (branchId && invoice.branchId !== branchId) return false
    if (employeeId) {
      const matchesPrimary = invoice.employeeId === employeeId
      const matchesSupport = invoice.supportEmployeeId === employeeId
      if (!matchesPrimary && !matchesSupport) return false
    }
    return true
  })
}

function getSalaryRole(invoice, employeeId) {
  if (employeeId && invoice.supportEmployeeId === employeeId) {
    return SALARY_ROLES.SUPPORT
  }
  return SALARY_ROLES.PRIMARY
}

function buildInvoiceSalaryRow(invoice, employeeId, role = getSalaryRole(invoice, employeeId)) {
  const services = getInvoiceServiceDetails(invoice).map((service) => ({
    serviceId: service.id,
    serviceName: service.name,
    price: service.price ?? 0,
    commissionPercent: service.commissionPercent ?? 0,
    commissionAmount: scaleCommissionAmount(service.commissionAmount ?? 0, role),
  }))
  const tips = role === SALARY_ROLES.PRIMARY ? getInvoiceTips(invoice) : 0
  const serviceRevenue = role === SALARY_ROLES.PRIMARY
    ? getInvoiceServiceTotal(invoice)
    : 0
  const serviceCommission = services.reduce((sum, service) => sum + service.commissionAmount, 0)
  const totalSalary = serviceCommission + tips

  return {
    invoiceId: invoice.id,
    date: invoice.date,
    displayDate: formatDisplayDate(invoice.date),
    customerName: invoice.customerName || '—',
    salaryRole: role,
    roleLabel: role === SALARY_ROLES.SUPPORT ? 'Hỗ trợ' : 'Chính',
    services,
    tips,
    serviceRevenue,
    serviceCommission,
    totalSalary,
    totalRevenue: serviceRevenue,
  }
}

function buildEmployeeSalaryReport(invoices, employeeId, cycle) {
  const invoiceRows = [...invoices]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((invoice) => buildInvoiceSalaryRow(invoice, employeeId))

  const invoiceCount = invoiceRows.length
  const serviceCount = invoiceRows.reduce((sum, row) => sum + row.services.length, 0)
  const revenue = invoiceRows.reduce((sum, row) => sum + row.serviceRevenue, 0)
  const tips = invoiceRows.reduce((sum, row) => sum + row.tips, 0)
  const serviceCommission = invoiceRows.reduce((sum, row) => sum + row.serviceCommission, 0)
  const totalSalary = tips + serviceCommission

  const first = invoices[0]
  const employee = getEmployeeById(employeeId)
  const branchName = employee?.branchId
    ? getBranchName(employee.branchId)
    : first?.branchName ?? '—'

  return {
    employeeId: employeeId || first?.employeeId || '',
    employeeName: employee?.name ?? first?.employeeName ?? '—',
    branchName,
    cycleLabel: getPayCycleLabel(cycle),
    summary: {
      invoiceCount,
      serviceCount,
      revenue,
      tips,
      serviceCommission,
      totalSalary,
    },
    invoices: invoiceRows,
    periodTotals: {
      revenue,
      tips,
      serviceCommission,
      totalSalary,
    },
  }
}

export function computeSalaryReport(invoices, filters) {
  const { month, cycle, branchId, employeeId } = filters
  const { fromDate, toDate } = getPayPeriodRange(month, cycle)
  const filtered = filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId })

  const employeeGroups = new Map()
  for (const invoice of filtered) {
    if (invoice.employeeId) {
      if (!employeeGroups.has(invoice.employeeId)) employeeGroups.set(invoice.employeeId, [])
      employeeGroups.get(invoice.employeeId).push(invoice)
    }

    if (invoice.supportEmployeeId) {
      if (!employeeGroups.has(invoice.supportEmployeeId)) {
        employeeGroups.set(invoice.supportEmployeeId, [])
      }
      employeeGroups.get(invoice.supportEmployeeId).push(invoice)
    }
  }

  const targetEmployeeIds = employeeId
    ? [employeeId]
    : [...employeeGroups.keys()]

  const employees = targetEmployeeIds
    .map((id) => buildEmployeeSalaryReport(employeeGroups.get(id) ?? [], id, cycle))
    .filter((report) => report.summary.invoiceCount > 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))

  return {
    fromDate,
    toDate,
    cycleLabel: getPayCycleLabel(cycle),
    employees,
  }
}
