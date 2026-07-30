import { getBranchName } from './branchStorage'
import { formatCurrency, getInvoiceServiceTotal } from './invoice'
import { getEmployeeById, loadEmployees } from './employeeStorage'
import { collectEmployeeIdsWithRecordBranchActivity } from './employeeBranchTimeline'

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
  const scopedInvoices = branchId
    ? invoices.filter((inv) => inv.branchId === branchId)
    : invoices

  const employeeMap = new Map()

  for (const invoice of scopedInvoices) {
    for (const id of [invoice.employeeId, invoice.supportEmployeeId].filter(Boolean)) {
      if (!employeeMap.has(id)) {
        const emp = getEmployeeById(id)
        employeeMap.set(id, {
          employeeId: id,
          employeeName: emp?.name ?? invoice.employeeName ?? id,
          branchId: branchId || invoice.branchId || emp?.branchId || '',
          position: emp?.position ?? '',
          avatar: emp?.avatar ?? '',
          invoiceCount: 0,
          ticketRevenue: 0,
          tips: 0,
        })
      }
      const row = employeeMap.get(id)
      row.invoiceCount += 1
      if (invoice.employeeId === id) {
        row.ticketRevenue += getInvoiceServiceTotal(invoice)
        row.tips += Number(invoice.tips) || 0
      }
    }
  }

  if (branchId) {
    const activityIds = collectEmployeeIdsWithRecordBranchActivity(branchId, scopedInvoices)
    for (const emp of loadEmployees()) {
      if (emp.status === 'inactive' || emp.status === 'archived') continue
      if (!activityIds.has(emp.id) || employeeMap.has(emp.id)) continue
      employeeMap.set(emp.id, {
        employeeId: emp.id,
        employeeName: emp.name,
        branchId,
        position: emp.position ?? '',
        avatar: emp.avatar ?? '',
        invoiceCount: 0,
        ticketRevenue: 0,
        tips: 0,
      })
    }
  }

  return [...employeeMap.values()]
    .filter((row) => row.invoiceCount > 0)
    .sort((a, b) => b.ticketRevenue - a.ticketRevenue || a.employeeName.localeCompare(b.employeeName, 'vi'))
}

export function formatInvoiceBranchStats(branch) {
  return [
    { label: 'Hóa đơn', value: branch.invoiceCount, formatted: String(branch.invoiceCount) },
    { label: 'Doanh thu vé', value: branch.ticketRevenue, formatted: formatCurrency(branch.ticketRevenue) },
    { label: 'Tips', value: branch.tips, formatted: formatCurrency(branch.tips), tone: 'tips' },
  ]
}
