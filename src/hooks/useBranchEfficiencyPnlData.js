import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getBranchName } from '../utils/branchStorage'
import { fetchReportPeriodData } from '../utils/reportDataFetcher'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { fetchPayrollAdjustments } from '../repositories/payrollRepository'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'
import {
  getDefaultPayCycleForVietnamDate,
  getPayPeriodRange,
  getVietnamCurrentMonthValue,
  PAY_CYCLES,
} from '../utils/salaryReport'
import {
  buildBranchEfficiencyPnl,
  UNKNOWN_BRANCH_ID,
} from '../utils/managementReports/branchEfficiencyPnl'
import { createBranchEfficiencyReportCache } from '../utils/managementReports/branchEfficiencyCache'
import { buildBranchEfficiencyWarnings } from '../utils/managementReports/branchEfficiencyWarnings'

export function buildDefaultBranchEfficiencyFilters(overrides = {}) {
  const month = getVietnamCurrentMonthValue()
  const cycle = getDefaultPayCycleForVietnamDate()
  const range = getPayPeriodRange(month, cycle)
  return {
    month,
    cycle,
    fromDate: range.fromDate,
    toDate: range.toDate,
    branchId: isAdmin() ? '' : (getCurrentUserBranch() || ''),
    ...overrides,
  }
}

/** Đồng bộ from/to khi đổi tháng hoặc kỳ. */
export function resolveEfficiencyRange({ month, cycle, fromDate, toDate, mode = 'cycle' }) {
  if (mode === 'custom' && fromDate && toDate) {
    return { fromDate, toDate }
  }
  const range = getPayPeriodRange(month, cycle || PAY_CYCLES.FULL)
  return { fromDate: range.fromDate, toDate: range.toDate }
}

export function useBranchEfficiencyPnlData(filters) {
  const syncVersion = useDataSyncVersion()
  const scopeBranchId = canSelectBranch()
    ? (filters.branchId || '')
    : (getCurrentUserBranch() || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [payload, setPayload] = useState(null)
  const reportCacheRef = useRef(createBranchEfficiencyReportCache())

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  const range = useMemo(
    () => ({ fromDate: filters.fromDate, toDate: filters.toDate }),
    [filters.fromDate, filters.toDate],
  )

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
          throw new Error('Supabase chưa cấu hình. Không thể tải báo cáo hiệu quả chi nhánh.')
        }

        const [finance, attendance, adjustments] = await Promise.all([
          fetchReportPeriodData({
            fromDate: range.fromDate,
            toDate: range.toDate,
            branchId: '',
          }),
          fetchAttendanceFiltered({
            fromDate: range.fromDate,
            toDate: range.toDate,
          }),
          fetchPayrollAdjustments({
            fromDate: range.fromDate,
            toDate: range.toDate,
          }),
        ])

        if (cancelled) return
        setPayload({
          cacheId: `${range.fromDate}|${range.toDate}|r${refreshKey}|s${syncVersion}`,
          invoices: finance.invoices ?? [],
          expenses: finance.expenses ?? [],
          fixedCosts: finance.fixedCosts ?? [],
          attendance: attendance ?? [],
          adjustments: adjustments ?? [],
        })
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải báo cáo hiệu quả chi nhánh.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, syncVersion, range.fromDate, range.toDate])

  useEffect(() => {
    if (isEmployee()) return undefined
    return subscribeToDataSync(() => reload())
  }, [reload])

  useEffect(() => {
    if (isEmployee()) return undefined
    return subscribeInvoicesChanges(() => reload())
  }, [reload])

  const report = useMemo(() => {
    if (!payload) return null
    const cache = reportCacheRef.current
    const key = cache.makeKey({
      fromDate: range.fromDate,
      toDate: range.toDate,
      payloadId: payload.cacheId,
    })
    const hit = cache.get(key)
    if (hit) return hit

    const built = buildBranchEfficiencyPnl({
      fromDate: range.fromDate,
      toDate: range.toDate,
      branchId: '',
      invoices: payload.invoices,
      expenses: payload.expenses,
      fixedCosts: payload.fixedCosts,
      adjustments: payload.adjustments,
      attendanceRecords: payload.attendance,
      getBranchName,
    })
    return cache.set(key, built)
  }, [payload, range.fromDate, range.toDate])

  const displayRows = useMemo(() => {
    if (!report) return []
    let rows = report.rows
    if (scopeBranchId) {
      rows = rows.filter((row) => row.branchId === scopeBranchId)
    }
    return rows
  }, [report, scopeBranchId])

  const displayTotal = useMemo(() => {
    if (!report) return null
    if (!scopeBranchId) return report.systemTotal
    const only = displayRows[0]
    return only || null
  }, [report, scopeBranchId, displayRows])

  const warnings = useMemo(() => {
    if (!report || !payload) return { items: [], hasWarnings: false }
    return buildBranchEfficiencyWarnings({
      report,
      invoices: payload.invoices,
      expenses: payload.expenses,
      adjustments: payload.adjustments,
      fromDate: range.fromDate,
      toDate: range.toDate,
    })
  }, [report, payload, range.fromDate, range.toDate])

  return {
    loading,
    error,
    reload,
    scopeBranchId,
    report,
    rows: displayRows,
    systemTotal: displayTotal,
    unknownBranchId: UNKNOWN_BRANCH_ID,
    formula: report?.formula || '',
    invoices: payload?.invoices ?? [],
    expenses: payload?.expenses ?? [],
    adjustments: payload?.adjustments ?? [],
    warnings,
    cacheSize: reportCacheRef.current.size,
  }
}
