import { useCallback, useEffect, useMemo, useState } from 'react'
import { filterEmployeeReportInvoices } from '../utils/employeeInvoiceReport'
import {
  buildBranchDrillRows,
  buildDrillDownSummary,
  buildEmployeeDrillRows,
} from '../utils/drillDownReport'
import { loadPayrollCostForFilters } from '../utils/payrollCostLoader'
import { fetchReportPeriodData } from '../utils/reportDataFetcher'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'

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
  const result = await fetchReportPeriodData(filters)
  let invoices = filterEmployeeReportInvoices(result.invoices, filters)
  return {
    invoices,
    expenses: result.expenses,
    fixedCosts: result.fixedCosts ?? [],
    source: result.source,
    error: result.error,
  }
}

export function useReportExplorerData(filters, { enabled = true } = {}) {
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [fixedCosts, setFixedCosts] = useState([])
  const [attendance, setAttendance] = useState([])
  const [employees, setEmployees] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [payrollByBranch, setPayrollByBranch] = useState(null)
  const [prevSummary, setPrevSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const syncVersion = useDataSyncVersion()
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const prevPeriod = getPreviousPeriod(filters.fromDate, filters.toDate)
        const [current, previous] = await Promise.all([
          fetchPeriodData(filters),
          prevPeriod.fromDate && prevPeriod.toDate
            ? fetchPeriodData({ ...filters, ...prevPeriod })
            : Promise.resolve({ invoices: [], expenses: [], fixedCosts: [], source: 'cloud' }),
        ])

        if (cancelled) return

        const [payroll, prevPayroll] = await Promise.all([
          loadPayrollCostForFilters(filters, current.invoices),
          prevPeriod.fromDate && prevPeriod.toDate
            ? loadPayrollCostForFilters({ ...filters, ...prevPeriod }, previous.invoices)
            : Promise.resolve({ payrollByBranch: null, attendance: [], employees: [], adjustments: [] }),
        ])
        if (cancelled) return

        setInvoices(current.invoices)
        setExpenses(current.expenses)
        setFixedCosts(current.fixedCosts ?? [])
        setAttendance(payroll.attendance ?? [])
        setEmployees(payroll.employees ?? [])
        setAdjustments(payroll.adjustments ?? [])
        setPayrollByBranch(payroll.payrollByBranch)
        setPrevSummary(
          buildDrillDownSummary(
            previous.invoices,
            previous.expenses,
            { ...filters, ...prevPeriod },
            prevPayroll.payrollByBranch,
            previous.fixedCosts ?? [],
          ),
        )

        setError('')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu báo cáo.')
          setInvoices([])
          setExpenses([])
          setFixedCosts([])
          setAttendance([])
          setEmployees([])
          setAdjustments([])
          setPayrollByBranch(null)
          setPrevSummary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [filters, enabled, syncVersion, refreshKey])

  useEffect(() => {
    return subscribeToDataSync(() => reload())
  }, [reload])

  useEffect(() => {
    return subscribeInvoicesChanges(() => reload())
  }, [reload])

  const summary = useMemo(
    () => buildDrillDownSummary(invoices, expenses, filters, payrollByBranch, fixedCosts),
    [invoices, expenses, filters, payrollByBranch, fixedCosts],
  )

  const branchRows = useMemo(
    () => buildBranchDrillRows(invoices, expenses, filters, payrollByBranch, fixedCosts),
    [invoices, expenses, filters, payrollByBranch, fixedCosts],
  )

  const employeeRows = useMemo(
    () => {
      const rows = buildEmployeeDrillRows(invoices, filters)
      if (!attendance.length) return rows
      const penaltyByEmployee = new Map()
      for (const row of attendance) {
        const id = row.employeeId
        if (!id) continue
        penaltyByEmployee.set(id, (penaltyByEmployee.get(id) ?? 0) + Number(row.penaltyAmount ?? 0))
      }
      return rows.map((row) => ({
        ...row,
        attendancePenalty: penaltyByEmployee.get(row.employeeId) ?? 0,
      }))
    },
    [invoices, filters, attendance],
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
      fixedExpenses: computeTrend(summary.fixedExpenses, prevSummary.fixedExpenses),
      variableExpenses: computeTrend(summary.variableExpenses, prevSummary.variableExpenses),
      profit: computeTrend(summary.profit, prevSummary.profit),
      actualRevenue: computeTrend(summary.actualRevenue, prevSummary.actualRevenue),
      totalSalary: computeTrend(summary.totalSalary, prevSummary.totalSalary),
      profitMargin: computeTrend(summary.profitMargin, prevSummary.profitMargin),
      customerCount: computeTrend(summary.customerCount, prevSummary.customerCount),
      invoiceCount: computeTrend(summary.invoiceCount, prevSummary.invoiceCount),
    }
  }, [summary, prevSummary])

  const topBranch = branchRows[0] ?? null
  const topEmployee = employeeRows[0] ?? null

  return {
    invoices,
    expenses,
    fixedCosts,
    attendance,
    employees,
    adjustments,
    summary,
    branchRows,
    employeeRows,
    trends,
    topBranch,
    topEmployee,
    loading,
    error,
    reload,
  }
}
