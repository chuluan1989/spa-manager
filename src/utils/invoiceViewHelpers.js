import { getBranchName } from './branchStorage'
import { formatCurrency, getInvoiceServiceTotal } from './invoice'
import { loadEmployees } from './employeeStorage'

export function aggregateInvoiceBranchSummaries(branches, invoices) {
  return branches.map((branch) => {
    const branchInvoices = invoices.filter((inv) => inv.branchId === branch.id)
    const ticketRevenue = branchInvoices.reduce((sum, inv) => sum + getInvoiceServiceTotal(inv), 0)
    const tips = branchInvoices.reduce((sum, inv) => sum + (Number(inv.tips) || 0), 0)

    return {
      branchId: branch.id,
      branchName: branch.name ?? getBranchName(branch.id),
      employeeCount: branchInvoices.length,
      countLabel: 'hóa đơn',
      invoiceCount: branchInvoices.length,
      ticketRevenue,
      tips,
      commission: 0,
      netSalary: ticketRevenue + tips,
    }
  })
}

export function aggregateInvoiceEmployeeSummaries(invoices, branchId) {
  const employees = loadEmployees().filter((emp) => {
    if (branchId && emp.branchId !== branchId) return false
    if (emp.status === 'inactive' || emp.status === 'archived') return false
    return true
  })

  const employeeMap = new Map()

  for (const emp of employees) {
    employeeMap.set(emp.id, {
      employeeId: emp.id,
      employeeName: emp.name,
      branchId: emp.branchId,
      position: emp.position ?? '',
      avatar: emp.avatar ?? '',
      invoiceCount: 0,
      ticketRevenue: 0,
      tips: 0,
    })
  }

  for (const invoice of invoices) {
    if (branchId && invoice.branchId !== branchId) continue
    const ids = [invoice.employeeId, invoice.supportEmployeeId].filter(Boolean)
    for (const id of ids) {
      if (!employeeMap.has(id)) continue
      const row = employeeMap.get(id)
      row.invoiceCount += 1
      if (invoice.employeeId === id) {
        row.ticketRevenue += getInvoiceServiceTotal(invoice)
        row.tips += Number(invoice.tips) || 0
      }
    }
  }

  return [...employeeMap.values()]
    .filter((row) => row.invoiceCount > 0 || employees.some((e) => e.id === row.employeeId))
    .sort((a, b) => b.ticketRevenue - a.ticketRevenue || a.employeeName.localeCompare(b.employeeName, 'vi'))
}

export function formatInvoiceBranchStats(branch) {
  return [
    { label: 'Hóa đơn', value: branch.invoiceCount, formatted: String(branch.invoiceCount) },
    { label: 'Doanh thu vé', value: branch.ticketRevenue, formatted: formatCurrency(branch.ticketRevenue) },
    { label: 'Tips', value: branch.tips, formatted: formatCurrency(branch.tips), tone: 'tips' },
  ]
}
