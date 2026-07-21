import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { countUniqueCustomers } from '../drillDownReport'
import { resolveProgressTone } from './operationWorkflowConstants'

function customerKey(invoice) {
  const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function countRequested(invoices) {
  const keys = new Set()
  for (const inv of invoices) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  return keys.size
}

export function buildActualsFromInvoices(invoices) {
  const list = invoices ?? []
  return {
    revenue: list.reduce((sum, inv) => sum + getInvoicePayment(inv), 0),
    tips: list.reduce((sum, inv) => sum + getInvoiceTips(inv), 0),
    customers: countUniqueCustomers(list),
    requested: countRequested(list),
    invoiceCount: list.length,
  }
}

function pct(actual, target) {
  const t = Number(target)
  if (!Number.isFinite(t) || t <= 0) return null
  return Math.round((Number(actual ?? 0) / t) * 1000) / 10
}

/**
 * Build progress rows for employees with optional targets.
 */
export function buildDailyTargetProgress({
  employees = [],
  targetsByEmployeeId = new Map(),
  invoicesToday = [],
}) {
  return employees.map((emp) => {
    const empInvoices = invoicesToday.filter((inv) => inv.employeeId === emp.id)
    const actual = buildActualsFromInvoices(empInvoices)
    const target = targetsByEmployeeId.get(emp.id) || null
    const metrics = [
      {
        key: 'revenue',
        label: 'Doanh thu',
        actual: actual.revenue,
        target: target?.revenue ?? 0,
        percent: pct(actual.revenue, target?.revenue),
      },
      {
        key: 'customers',
        label: 'Khách',
        actual: actual.customers,
        target: target?.customers ?? 0,
        percent: pct(actual.customers, target?.customers),
      },
      {
        key: 'requested',
        label: 'Khách yêu cầu',
        actual: actual.requested,
        target: target?.requested ?? 0,
        percent: pct(actual.requested, target?.requested),
      },
      {
        key: 'tips',
        label: 'Tips',
        actual: actual.tips,
        target: target?.tips ?? 0,
        percent: pct(actual.tips, target?.tips),
      },
    ].map((m) => ({ ...m, tone: resolveProgressTone(m.percent) }))

    const withTarget = metrics.filter((m) => m.target > 0 && m.percent != null)
    const overallPercent = withTarget.length
      ? Math.round(withTarget.reduce((s, m) => s + m.percent, 0) / withTarget.length)
      : null

    return {
      employeeId: emp.id,
      name: emp.name,
      branchId: emp.branchId,
      branchName: emp.branchName || '',
      target,
      actual,
      metrics,
      overallPercent,
      overallTone: resolveProgressTone(overallPercent),
      hasTarget: Boolean(target),
    }
  })
}
