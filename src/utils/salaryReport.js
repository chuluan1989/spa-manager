import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../constants/salary'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { getInvoiceServiceDetails, getInvoiceServiceTotal, invoiceHasDiscount } from './invoice'

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

export function filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId, discountFilter = '' }) {
  return invoices.filter((invoice) => {
    if (fromDate && invoice.date < fromDate) return false
    if (toDate && invoice.date > toDate) return false
    if (branchId && invoice.branchId !== branchId) return false
    if (employeeId) {
      const matchesPrimary = invoice.employeeId === employeeId
      const matchesSupport = invoice.supportEmployeeId === employeeId
      if (!matchesPrimary && !matchesSupport) return false
    }
    if (discountFilter === 'with' && !invoiceHasDiscount(invoice)) return false
    if (discountFilter === 'without' && invoiceHasDiscount(invoice)) return false
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

function groupInvoicesByEmployee(invoices) {
  const employeeGroups = new Map()

  for (const invoice of invoices) {
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

  return employeeGroups
}

function buildDailySalaryRows(invoiceRows) {
  const byDate = new Map()

  for (const row of invoiceRows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date).push(row)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const serviceMap = new Map()
      let tips = 0
      let serviceCommission = 0
      let serviceRevenue = 0

      for (const row of rows) {
        tips += row.tips
        serviceCommission += row.serviceCommission
        serviceRevenue += row.serviceRevenue
        for (const service of row.services) {
          const key = service.serviceId || service.serviceName
          const current = serviceMap.get(key) ?? {
            serviceId: service.serviceId,
            serviceName: service.serviceName,
            quantity: 0,
            revenue: 0,
            commission: 0,
          }
          current.quantity += 1
          current.revenue += service.price ?? 0
          current.commission += service.commissionAmount ?? 0
          serviceMap.set(key, current)
        }
      }

      return {
        date,
        displayDate: formatDisplayDate(date),
        invoiceCount: rows.length,
        services: [...serviceMap.values()].sort((a, b) => a.serviceName.localeCompare(b.serviceName, 'vi')),
        serviceRevenue,
        tips,
        serviceCommission,
        totalSalary: tips + serviceCommission,
      }
    })
}

function buildAdminEmployeeSummary(invoices, employeeId) {
  const invoiceRows = [...invoices]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((invoice) => buildInvoiceSalaryRow(invoice, employeeId))

  const invoiceCount = invoiceRows.length
  const serviceCount = invoiceRows.reduce((sum, row) => sum + row.services.length, 0)
  const serviceRevenue = invoiceRows.reduce((sum, row) => sum + row.serviceRevenue, 0)
  const tips = invoiceRows.reduce((sum, row) => sum + row.tips, 0)
  const serviceCommission = invoiceRows.reduce((sum, row) => sum + row.serviceCommission, 0)
  const totalSalary = tips + serviceCommission

  const first = invoices[0]
  const employee = getEmployeeById(employeeId)

  return {
    employeeId: employeeId || first?.employeeId || '',
    employeeName: employee?.name ?? first?.employeeName ?? '—',
    branchName: employee?.branchId
      ? getBranchName(employee.branchId)
      : first?.branchName ?? '—',
    invoiceCount,
    serviceCount,
    serviceRevenue,
    tips,
    serviceCommission,
    totalSalary,
  }
}

/** Báo cáo tổng hợp theo nhân viên cho Admin (lọc theo khoảng ngày). */
export function computeAdminEmployeeReports(invoices, filters) {
  const { fromDate, toDate, branchId, employeeId, cycle = PAY_CYCLES.FULL, discountFilter = '' } = filters
  const filtered = filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId, discountFilter })
  const employeeGroups = groupInvoicesByEmployee(filtered)
  const targetEmployeeIds = employeeId ? [employeeId] : [...employeeGroups.keys()]

  const employees = targetEmployeeIds
    .map((id) => buildAdminEmployeeSummary(employeeGroups.get(id) ?? [], id))
    .filter((row) => row.invoiceCount > 0)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi'))

  const periodTotals = employees.reduce(
    (acc, row) => {
      acc.serviceRevenue += row.serviceRevenue
      acc.tips += row.tips
      acc.serviceCommission += row.serviceCommission
      acc.totalSalary += row.totalSalary
      acc.invoiceCount += row.invoiceCount
      return acc
    },
    { invoiceCount: 0, serviceRevenue: 0, tips: 0, serviceCommission: 0, totalSalary: 0 },
  )

  return {
    fromDate,
    toDate,
    cycleLabel: getPayCycleLabel(cycle),
    employees,
    periodTotals,
  }
}

/** Chi tiết doanh số/lương theo từng ngày của một nhân viên. */
export function computeEmployeeDailyReports(invoices, employeeId, filters) {
  const { fromDate, toDate, branchId, cycle = PAY_CYCLES.FULL, discountFilter = '' } = filters
  const filtered = filterSalaryInvoices(invoices, { fromDate, toDate, branchId, employeeId, discountFilter })
  const employeeGroups = groupInvoicesByEmployee(filtered)
  const employeeInvoices = employeeGroups.get(employeeId) ?? []

  const invoiceRows = [...employeeInvoices]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .map((invoice) => buildInvoiceSalaryRow(invoice, employeeId))

  const summary = buildAdminEmployeeSummary(employeeInvoices, employeeId)
  const days = buildDailySalaryRows(invoiceRows)

  return {
    ...summary,
    cycleLabel: getPayCycleLabel(cycle),
    days,
    periodTotals: {
      serviceRevenue: summary.serviceRevenue,
      tips: summary.tips,
      serviceCommission: summary.serviceCommission,
      totalSalary: summary.totalSalary,
    },
  }
}
