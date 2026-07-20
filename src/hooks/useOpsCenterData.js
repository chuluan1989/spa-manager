import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDefaultDrillFilters, useDrillDownData } from './useDrillDownData'
import { buildDrillDownSummary } from '../utils/drillDownReport'
import { getTodayDate, getMonthStartDate } from '../utils/invoiceStorage'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { getAllActiveEmployees } from '../utils/employeeStorage'
import { loadPendingEditRequestsForCurrentManager } from '../utils/attendanceEditRequestService'
import { loadPayrollLocks } from '../utils/payrollService'
import { isPayrollMonthLocked } from '../utils/payrollEngine'
import { loadPayroll1AdminRows } from '../utils/payroll1Service'
import { loadSystemSettings } from '../utils/systemSettingsStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useDataSyncVersion } from './useDataSyncVersion'

function currentMonthKey(dateStr = getTodayDate()) {
  return String(dateStr ?? '').slice(0, 7)
}

function buildTodayHealth(activeEmployees, attendanceRows) {
  const activeIds = new Set(activeEmployees.map((e) => e.id).filter(Boolean))
  const checkedIds = new Set()
  for (const row of attendanceRows) {
    const id = row.employeeId
    if (id && activeIds.has(id)) checkedIds.add(id)
  }
  const activeCount = activeIds.size
  const checkedInCount = checkedIds.size
  return {
    activeCount,
    checkedInCount,
    notCheckedInCount: Math.max(0, activeCount - checkedInCount),
    date: attendanceRows[0]?.date || getTodayDate(),
  }
}

/**
 * Ops Center data: finance via useDrillDownData (same as Tổng quan),
 * plus one parallel batch for today health + alerts.
 */
export function useOpsCenterData(periodMode = 'month') {
  const today = getTodayDate()
  const filters = useMemo(() => {
    if (periodMode === 'today') {
      return buildDefaultDrillFilters({ fromDate: today, toDate: today, branchId: '' })
    }
    return buildDefaultDrillFilters({
      fromDate: getMonthStartDate(),
      toDate: today,
      branchId: '',
    })
  }, [periodMode, today])

  const {
    invoices,
    expenses,
    fixedCosts,
    loading: financeLoading,
    error: financeError,
    reload: reloadFinance,
    scopedFilters,
  } = useDrillDownData(filters)

  const financeSummary = useMemo(
    () => buildDrillDownSummary(invoices, expenses, scopedFilters, null, fixedCosts),
    [invoices, expenses, scopedFilters, fixedCosts],
  )

  const [opsLoading, setOpsLoading] = useState(true)
  const [opsError, setOpsError] = useState('')
  const [todayHealth, setTodayHealth] = useState(null)
  const [alerts, setAlerts] = useState({
    pendingAttendanceEdits: null,
    lockedPayrollMonths: null,
    kl1Incomplete: null,
    kl1UnavailableReason: '',
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const syncVersion = useDataSyncVersion()

  const reloadOps = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false

    async function loadOps() {
      setOpsLoading(true)
      setOpsError('')

      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu điều hành.')
        }

        const settings = loadSystemSettings()
        const month = currentMonthKey(today)
        const activeEmployees = getAllActiveEmployees()

        const tasks = [
          fetchAttendanceFiltered({ date: today }),
          loadPendingEditRequestsForCurrentManager(),
          loadPayrollLocks(month),
        ]

        const includeKl1 = settings.payroll1Enabled === true
        if (includeKl1) {
          tasks.push(loadPayroll1AdminRows({ branchId: '' }))
        }

        const results = await Promise.all(tasks)
        if (cancelled) return

        const attendanceRows = results[0] ?? []
        const pendingEdits = results[1] ?? []
        const locks = results[2] ?? []
        const kl1Rows = includeKl1 ? (results[3] ?? []) : null

        const health = buildTodayHealth(activeEmployees, attendanceRows)

        let kl1Incomplete = null
        let kl1UnavailableReason = ''
        if (!includeKl1) {
          kl1UnavailableReason = 'KL1 đang tắt trong cài đặt hệ thống.'
        } else if (!Array.isArray(kl1Rows)) {
          kl1UnavailableReason = 'Chưa đủ dữ liệu'
        } else {
          kl1Incomplete = kl1Rows.filter((row) => row && row.dataComplete !== true).length
        }

        const monthLocked = isPayrollMonthLocked(month, '', locks)

        setTodayHealth(health)
        setAlerts({
          pendingAttendanceEdits: pendingEdits.length,
          lockedPayrollMonths: monthLocked ? 1 : 0,
          lockedMonthLabel: monthLocked ? month : '',
          kl1Incomplete,
          kl1UnavailableReason,
        })
        setOpsError('')
      } catch (err) {
        if (!cancelled) {
          setOpsError(err?.message ?? 'Không thể tải dữ liệu điều hành.')
          setTodayHealth(null)
          setAlerts({
            pendingAttendanceEdits: null,
            lockedPayrollMonths: null,
            kl1Incomplete: null,
            kl1UnavailableReason: 'Chưa đủ dữ liệu',
          })
        }
      } finally {
        if (!cancelled) setOpsLoading(false)
      }
    }

    loadOps()
    return () => { cancelled = true }
  }, [refreshKey, syncVersion, today])

  const reload = useCallback(() => {
    reloadFinance()
    reloadOps()
  }, [reloadFinance, reloadOps])

  return {
    periodMode,
    filters: scopedFilters,
    financeSummary,
    financeLoading,
    financeError,
    todayHealth,
    alerts,
    opsLoading,
    opsError,
    loading: financeLoading || opsLoading,
    reload,
  }
}
