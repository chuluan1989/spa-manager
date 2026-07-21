import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getBranchById, loadBranches } from '../constants/branches'
import { getTodayDate } from '../utils/invoiceStorage'
import { fetchMergedInvoices } from '../utils/invoiceDataFetcher'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'
import {
  getActiveEmployeesByBranch,
  getAllActiveEmployees,
  getEmployeeById,
} from '../utils/employeeStorage'
import { getOperationWorkflowScopeBranchId } from '../utils/operationWorkflow/operationWorkflowAccess'
import { loadBranchDailyTasks, getBranchTaskProgress } from '../utils/operationWorkflow/dailyTaskStorage'
import { loadDailyTargetsForDate } from '../utils/operationWorkflow/dailyTargetStorage'
import { loadManagerNotes } from '../utils/operationWorkflow/managerNotesStorage'
import { loadOperationAuditLogs } from '../utils/operationWorkflow/operationAuditLog'
import { buildDailyTargetProgress } from '../utils/operationWorkflow/buildDailyTargetProgress'
import {
  buildCeoActionItems,
  buildOperationAlerts,
} from '../utils/operationWorkflow/buildOperationAlerts'
import { buildEmployeeTimeline } from '../utils/operationWorkflow/buildEmployeeTimeline'
import { buildPerformanceHistory } from '../utils/operationWorkflow/buildPerformanceHistory'

function shiftDate(iso, deltaDays) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const date = new Date(y, m - 1, d + deltaDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Operation Workflow data — Admin / Manager / Employee (scoped).
 */
export function useOperationWorkflowData({
  selectedBranchId = '',
  selectedEmployeeId = '',
  timelineDate = '',
} = {}) {
  const today = getTodayDate()
  const syncVersion = useDataSyncVersion()
  const scopeBranchId = getOperationWorkflowScopeBranchId(selectedBranchId)
  const employeeSelfId = isEmployee() ? getCurrentUserEmployeeId() : ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [payload, setPayload] = useState(null)
  const [localTick, setLocalTick] = useState(0)

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])
  const bumpLocal = useCallback(() => setLocalTick((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải Operation Workflow.')
        }
        const fromDate = shiftDate(today, -90)
        const [invoiceResult, attendance] = await Promise.all([
          fetchMergedInvoices({
            fromDate,
            toDate: today,
            branchId: scopeBranchId || undefined,
          }),
          fetchAttendanceFiltered({
            fromDate,
            toDate: today,
            branchId: scopeBranchId || undefined,
          }),
        ])
        if (cancelled) return
        const invoices = Array.isArray(invoiceResult)
          ? invoiceResult
          : (invoiceResult?.invoices ?? [])
        setPayload({ invoices, attendance: attendance ?? [] })
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải Operation Workflow.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey, syncVersion, scopeBranchId, today])

  useEffect(() => subscribeToDataSync(() => {
    reload()
    bumpLocal()
  }), [reload, bumpLocal])

  useEffect(() => {
    if (isEmployee()) return undefined
    return subscribeInvoicesChanges(() => reload())
  }, [reload])

  const derived = useMemo(() => {
    void localTick
    const invoices = payload?.invoices ?? []
    const attendance = payload?.attendance ?? []
    const invoicesToday = invoices.filter((inv) => inv.date === today)
    const attendanceToday = attendance.filter((a) => a.date === today)

    const branches = loadBranches()
      .filter((b) => b?.id && (!scopeBranchId || b.id === scopeBranchId))
      .map((b) => ({ id: b.id, name: getBranchById(b.id)?.name || b.name || b.id }))

    let employees = (scopeBranchId
      ? getActiveEmployeesByBranch(scopeBranchId)
      : getAllActiveEmployees()
    ).map((e) => ({
      id: e.id,
      name: e.name,
      branchId: e.branchId,
      branchName: getBranchById(e.branchId)?.name || '',
    }))

    if (isEmployee() && employeeSelfId) {
      employees = employees.filter((e) => e.id === employeeSelfId)
    }

    const lookbackDates = Array.from({ length: 7 }, (_, i) => shiftDate(today, -(i + 1)))

    const alerts = buildOperationAlerts({
      today,
      branches,
      employees,
      invoices,
      attendanceToday,
      lookbackDates,
    })

    const ceoActions = buildCeoActionItems(alerts)

    const targetRows = loadDailyTargetsForDate(today)
    const targetsByEmployeeId = new Map(targetRows.map((t) => [t.employeeId, t]))
    const targetProgress = buildDailyTargetProgress({
      employees,
      targetsByEmployeeId,
      invoicesToday,
    })

    const taskBranchId = scopeBranchId || branches[0]?.id || ''
    const dailyTasks = taskBranchId
      ? loadBranchDailyTasks(taskBranchId, today)
      : { catalog: [], completions: {}, branchId: '', date: today }
    const taskProgress = taskBranchId
      ? getBranchTaskProgress(taskBranchId, today)
      : { total: 0, done: 0, percent: 0, incomplete: [] }

    const focusEmployeeId = isEmployee()
      ? employeeSelfId
      : (selectedEmployeeId || employees[0]?.id || '')

    const timelineDateEffective = timelineDate || today
    const timeline = focusEmployeeId
      ? buildEmployeeTimeline({
          employeeId: focusEmployeeId,
          date: timelineDateEffective,
          invoices,
          attendanceRecords: attendance,
          notes: loadManagerNotes({ employeeId: focusEmployeeId, limit: 50 }),
        })
      : []

    const monthKey = today.slice(0, 7)
    const performanceHistory = focusEmployeeId
      ? buildPerformanceHistory({
          entityType: 'employee',
          entityId: focusEmployeeId,
          invoices,
          endMonthKey: monthKey,
          months: 4,
        })
      : []

    const notesToday = loadManagerNotes({
      branchId: scopeBranchId,
      date: today,
      limit: 30,
    })

    const auditLogs = loadOperationAuditLogs({
      branchId: scopeBranchId,
      limit: 150,
    })

    const user = getCurrentUser()

    return {
      today,
      branches,
      employees,
      invoices,
      invoicesToday,
      attendance,
      attendanceToday,
      alerts,
      ceoActions,
      targetProgress,
      dailyTasks,
      taskProgress,
      taskBranchId,
      focusEmployeeId,
      focusEmployee: focusEmployeeId ? getEmployeeById(focusEmployeeId) : null,
      timeline,
      timelineDate: timelineDateEffective,
      performanceHistory,
      notesToday,
      auditLogs,
      actor: {
        id: user?.employeeId || user?.role || '',
        name: user?.employeeName || user?.name || user?.role || '',
        branchId: getCurrentUserBranch() || '',
      },
      isAdminUser: isAdmin(),
    }
  }, [
    payload,
    localTick,
    scopeBranchId,
    today,
    selectedEmployeeId,
    timelineDate,
    employeeSelfId,
  ])

  return {
    loading,
    error,
    reload,
    bumpLocal,
    scopeBranchId,
    ...derived,
  }
}
