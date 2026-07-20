import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  getCurrentUserBranch,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'
import { fetchReportPeriodData } from '../utils/reportDataFetcher'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'
import { getActiveEmployeesByBranch, getAllActiveEmployees } from '../utils/employeeStorage'
import { getManagementComparePeriod } from '../utils/managementReports/periodCompare'
import {
  buildBranchManagementRows,
  buildEmployeeManagementRows,
} from '../utils/managementReports/managementMetrics'

export function buildDefaultManagementFilters(overrides = {}) {
  const today = getTodayDate()
  return {
    fromDate: getMonthStartDate(),
    toDate: today,
    branchId: isAdmin() ? '' : getCurrentUserBranch(),
    employeeQuery: '',
    sortKey: 'revenue',
    sortDir: 'desc',
    ...overrides,
  }
}

function filterInvoicesByRange(invoices, fromDate, toDate) {
  return (invoices ?? []).filter((inv) => {
    const d = inv?.date ?? ''
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })
}

function filterExpensesByRange(expenses, fromDate, toDate) {
  return (expenses ?? []).filter((row) => {
    const d = row?.date ?? ''
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })
}

/**
 * Management Reports data — Admin / Manager.
 * Employee personal view is handled separately in Report.jsx (existing salary panel).
 */
export function useManagementReportsData(filters) {
  const today = getTodayDate()
  const syncVersion = useDataSyncVersion()
  const scopeBranchId = isAdmin() ? (filters.branchId || '') : (getCurrentUserBranch() || '')

  const compare = useMemo(
    () => getManagementComparePeriod(filters.fromDate, filters.toDate, today),
    [filters.fromDate, filters.toDate, today],
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [payload, setPayload] = useState(null)

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    if (isEmployee()) {
      setLoading(false)
      setPayload(null)
      return undefined
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải báo cáo quản trị.')
        }

        const spanFrom = [filters.fromDate, compare.fromDate].filter(Boolean).sort()[0]
        const spanTo = [filters.toDate, compare.toDate].filter(Boolean).sort().at(-1)

        const [finance, attendance] = await Promise.all([
          fetchReportPeriodData({
            fromDate: spanFrom,
            toDate: spanTo,
            branchId: scopeBranchId,
          }),
          fetchAttendanceFiltered({
            fromDate: spanFrom,
            toDate: spanTo,
            branchId: scopeBranchId || undefined,
          }),
        ])

        if (cancelled) return

        setPayload({
          invoices: finance.invoices ?? [],
          expenses: finance.expenses ?? [],
          fixedCosts: finance.fixedCosts ?? [],
          attendance: attendance ?? [],
        })
        setError('')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải báo cáo quản trị.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [
    refreshKey,
    syncVersion,
    filters.fromDate,
    filters.toDate,
    scopeBranchId,
    compare.fromDate,
    compare.toDate,
  ])

  useEffect(() => {
    if (isEmployee()) return undefined
    return subscribeToDataSync(() => reload())
  }, [reload])

  useEffect(() => {
    if (isEmployee()) return undefined
    return subscribeInvoicesChanges(() => reload())
  }, [reload])

  const derived = useMemo(() => {
    if (!payload) {
      return { branchRows: [], employeeRows: [], compare }
    }

    const currentInvoices = filterInvoicesByRange(
      payload.invoices,
      filters.fromDate,
      filters.toDate,
    )
    const previousInvoices = filterInvoicesByRange(
      payload.invoices,
      compare.fromDate,
      compare.toDate,
    )
    const currentExpenses = filterExpensesByRange(
      payload.expenses,
      filters.fromDate,
      filters.toDate,
    )
    const previousExpenses = filterExpensesByRange(
      payload.expenses,
      compare.fromDate,
      compare.toDate,
    )
    const currentAttendance = (payload.attendance ?? []).filter((row) => {
      const d = row.date ?? ''
      return (!filters.fromDate || d >= filters.fromDate) && (!filters.toDate || d <= filters.toDate)
    })
    const previousAttendance = (payload.attendance ?? []).filter((row) => {
      const d = row.date ?? ''
      return (!compare.fromDate || d >= compare.fromDate) && (!compare.toDate || d <= compare.toDate)
    })

    const employeeIdSet = new Set(
      (scopeBranchId
        ? getActiveEmployeesByBranch(scopeBranchId)
        : getAllActiveEmployees()
      ).map((e) => e.id).filter(Boolean),
    )

    const branchRows = buildBranchManagementRows({
      invoices: currentInvoices,
      previousInvoices,
      expenses: currentExpenses,
      previousExpenses,
      fixedCosts: payload.fixedCosts,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      previousFromDate: compare.fromDate,
      previousToDate: compare.toDate,
      scopeBranchId,
    })

    const employeeRows = buildEmployeeManagementRows({
      invoices: currentInvoices,
      previousInvoices,
      attendanceRecords: currentAttendance,
      previousAttendanceRecords: previousAttendance,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      previousFromDate: compare.fromDate,
      previousToDate: compare.toDate,
      scopeBranchId,
      employeeIds: employeeIdSet,
    })

    return {
      branchRows,
      employeeRows,
      compare,
      currentInvoices,
      previousInvoices,
    }
  }, [payload, filters.fromDate, filters.toDate, scopeBranchId, compare])

  return {
    loading,
    error,
    reload,
    scopeBranchId,
    ...derived,
  }
}
