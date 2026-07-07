import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpensesFiltered } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { filterEmployeeReportInvoices } from '../utils/employeeInvoiceReport'
import {
  buildBranchDrillRows,
  buildDrillDownSummary,
  buildEmployeeDrillRows,
} from '../utils/drillDownReport'

function parseDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getPreviousPeriod(fromDate, toDate) {
  if (!fromDate || !toDate) return { fromDate: '', toDate: '' }
  const from = parseDate(fromDate)
  const to = parseDate(toDate)
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1)
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days + 1)
  return { fromDate: formatDate(prevFrom), toDate: formatDate(prevTo) }
}

function computeTrend(current, previous) {
  const cur = Number(current ?? 0)
  const prev = Number(previous ?? 0)
  if (prev === 0 && cur === 0) return { direction: 'flat', percent: 0 }
  if (prev === 0) return { direction: 'up', percent: 100 }
  const change = ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(change) < 0.5) return { direction: 'flat', percent: 0 }
  return {
    direction: change > 0 ? 'up' : 'down',
    percent: Math.abs(Math.round(change)),
  }
}

async function fetchPeriodData(filters) {
  if (!isSupabaseConfigured) {
    return { invoices: [], expenses: [] }
  }

  const { fromDate, toDate, branchId, employeeId, customerSearch } = filters
  const [invoiceRows, expenseRows] = await Promise.all([
    fetchInvoicesFiltered({
      fromDate,
      toDate,
      branchId: branchId || '',
      employeeId: employeeId || '',
      customerSearch,
    }),
    fetchExpensesFiltered({
      fromDate,
      toDate,
      branchId: branchId || '',
    }),
  ])

  let invoices = Array.isArray(invoiceRows) ? invoiceRows : []
  invoices = filterEmployeeReportInvoices(invoices, filters)
  const expenses = Array.isArray(expenseRows) ? expenseRows : []
  return { invoices, expenses }
}

export function useReportExplorerData(filters, { enabled = true } = {}) {
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [prevSummary, setPrevSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    async function load() {
      if (!isSupabaseConfigured) {
        setError('Supabase chưa cấu hình — Báo cáo yêu cầu dữ liệu Cloud.')
        setInvoices([])
        setExpenses([])
        setPrevSummary(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const prevPeriod = getPreviousPeriod(filters.fromDate, filters.toDate)
        const [current, previous] = await Promise.all([
          fetchPeriodData(filters),
          prevPeriod.fromDate && prevPeriod.toDate
            ? fetchPeriodData({ ...filters, ...prevPeriod })
            : Promise.resolve({ invoices: [], expenses: [] }),
        ])

        if (cancelled) return

        setInvoices(current.invoices)
        setExpenses(current.expenses)
        setPrevSummary(
          buildDrillDownSummary(previous.invoices, previous.expenses, filters),
        )
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu từ Supabase.')
          setInvoices([])
          setExpenses([])
          setPrevSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [filters, enabled])

  const summary = useMemo(
    () => buildDrillDownSummary(invoices, expenses, filters),
    [invoices, expenses, filters],
  )

  const branchRows = useMemo(
    () => buildBranchDrillRows(invoices, expenses, filters),
    [invoices, expenses, filters],
  )

  const employeeRows = useMemo(
    () => buildEmployeeDrillRows(invoices, filters),
    [invoices, expenses, filters],
  )

  const trends = useMemo(() => {
    if (!prevSummary) {
      return {}
    }
    return {
      ticketRevenue: computeTrend(summary.ticketRevenue, prevSummary.ticketRevenue),
      tips: computeTrend(summary.tips, prevSummary.tips),
      discount: computeTrend(summary.discount, prevSummary.discount),
      commission: computeTrend(summary.commission, prevSummary.commission),
      expenses: computeTrend(summary.expenses, prevSummary.expenses),
      profit: computeTrend(summary.profit, prevSummary.profit),
      customerCount: computeTrend(summary.customerCount, prevSummary.customerCount),
      invoiceCount: computeTrend(summary.invoiceCount, prevSummary.invoiceCount),
    }
  }, [summary, prevSummary])

  const topBranch = branchRows[0] ?? null
  const topEmployee = employeeRows[0] ?? null

  return {
    invoices,
    expenses,
    summary,
    branchRows,
    employeeRows,
    trends,
    topBranch,
    topEmployee,
    loading,
    error,
  }
}
