import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { countUniqueCustomers } from '../drillDownReport'
import { notifyDataSynced } from '../supabaseSync'
import { OW_STORAGE_KEYS } from './operationWorkflowConstants'

function daysInMonth(yearMonth) {
  const [y, m] = String(yearMonth).split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function shiftYearMonth(yearMonth, deltaMonths) {
  const [y, m] = String(yearMonth).split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1 + deltaMonths, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function customerKey(invoice) {
  const phone = (invoice.customerPhone ?? '').replace(/\D/g, '')
  const name = (invoice.customerName ?? '').trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (name) return `name:${name}`
  return `inv:${invoice.id}`
}

function monthWindows(endMonthKey, count = 4) {
  const windows = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthKey = shiftYearMonth(endMonthKey, -i)
    const last = daysInMonth(monthKey)
    windows.push({
      monthKey,
      fromDate: `${monthKey}-01`,
      toDate: `${monthKey}-${String(last).padStart(2, '0')}`,
    })
  }
  return windows
}

function metricsForInvoices(invoices) {
  const list = invoices ?? []
  const revenue = list.reduce((s, inv) => s + getInvoicePayment(inv), 0)
  const tips = list.reduce((s, inv) => s + getInvoiceTips(inv), 0)
  const customers = countUniqueCustomers(list)
  let requested = 0
  const keys = new Set()
  for (const inv of list) {
    if (!inv.customerRequested) continue
    keys.add(customerKey(inv))
  }
  requested = keys.size
  return {
    revenue,
    tips,
    customers,
    requested,
    requestedRate: customers ? Math.round((requested / customers) * 1000) / 10 : null,
    invoiceCount: list.length,
  }
}

/**
 * Monthly performance history for employee or branch (computed from invoices).
 */
export function buildPerformanceHistory({
  entityType = 'employee',
  entityId,
  invoices = [],
  endMonthKey,
  months = 4,
}) {
  if (!entityId || !endMonthKey) return []
  return monthWindows(endMonthKey, months).map((win) => {
    const scoped = (invoices ?? []).filter((inv) => {
      if (inv.date < win.fromDate || inv.date > win.toDate) return false
      if (entityType === 'employee') return inv.employeeId === entityId
      return inv.branchId === entityId
    })
    return {
      monthKey: win.monthKey,
      fromDate: win.fromDate,
      toDate: win.toDate,
      ...metricsForInvoices(scoped),
    }
  })
}

/** Optional cache snapshot (local only). */
export function savePerformanceSnapshot(entityType, entityId, history) {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.performanceSnapshots)
    const store = raw ? JSON.parse(raw) : {}
    store[`${entityType}:${entityId}`] = {
      savedAt: new Date().toISOString(),
      history,
    }
    localStorage.setItem(OW_STORAGE_KEYS.performanceSnapshots, JSON.stringify(store))
    notifyDataSynced(['operation-workflow'])
  } catch {
    // ignore
  }
}

export function loadPerformanceSnapshot(entityType, entityId) {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.performanceSnapshots)
    const store = raw ? JSON.parse(raw) : {}
    return store[`${entityType}:${entityId}`] || null
  } catch {
    return null
  }
}
