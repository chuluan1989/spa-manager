import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUserBranch,
  getCurrentUserRole,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getTodayDate, getMonthStartDate } from '../utils/invoiceStorage'
import { fetchReportPeriodData } from '../utils/reportDataFetcher'
import { fetchMergedInvoices } from '../utils/invoiceDataFetcher'
import { fetchAttendanceFiltered } from '../repositories/attendanceRepository'
import { loadPendingEditRequestsForCurrentManager } from '../utils/attendanceEditRequestService'
import { loadPayrollLocks } from '../utils/payrollService'
import { isPayrollMonthLocked } from '../utils/payrollEngine'
import { loadPayroll1AdminRows } from '../utils/payroll1Service'
import { loadSystemSettings } from '../utils/systemSettingsStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'
import { buildCopilotAlerts } from '../utils/copilot/buildCopilotAlerts'
import { buildCopilotOpportunities } from '../utils/copilot/buildCopilotOpportunities'
import { buildCopilotBrief } from '../utils/copilot/buildCopilotBrief'
import { buildCopilotPerformance } from '../utils/copilot/buildCopilotPerformance'
import { shiftDate } from '../utils/copilot/copilotTrends'

function currentMonthKey(dateStr) {
  return String(dateStr ?? '').slice(0, 7)
}

/**
 * Business Copilot data for Admin / Manager.
 * Employee should not use this hook for Action/Opportunity (page falls back to Explore).
 */
export function useBusinessCopilotData() {
  const today = getTodayDate()
  const role = getCurrentUserRole()
  const scopeBranchId = isAdmin() ? '' : (getCurrentUserBranch() || '')
  const syncVersion = useDataSyncVersion()

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
          throw new Error('Supabase chưa cấu hình. Không thể tải Business Copilot.')
        }

        const monthStart = getMonthStartDate()
        const rangeStart = shiftDate(today, -7)
        const financeFrom = rangeStart < monthStart ? rangeStart : monthStart
        // Ensure yesterday included when month boundary
        const yesterday = shiftDate(today, -1)
        const fromDate = financeFrom < yesterday ? financeFrom : yesterday

        const crmFrom = shiftDate(today, -120)
        const settings = loadSystemSettings()
        const month = currentMonthKey(today)

        const tasks = [
          fetchReportPeriodData({
            fromDate,
            toDate: today,
            branchId: scopeBranchId,
          }),
          fetchMergedInvoices({
            fromDate: crmFrom,
            toDate: today,
            branchId: scopeBranchId,
          }),
          fetchAttendanceFiltered({ date: today, branchId: scopeBranchId || undefined }),
          loadPendingEditRequestsForCurrentManager(),
          loadPayrollLocks(month),
        ]

        const includeKl1 = settings.payroll1Enabled === true
        if (includeKl1) {
          tasks.push(loadPayroll1AdminRows({ branchId: scopeBranchId || '' }))
        }

        const results = await Promise.all(tasks)
        if (cancelled) return

        const finance = results[0]
        const crm = results[1]
        const attendanceToday = results[2] ?? []
        const pendingEdits = results[3] ?? []
        const locks = results[4] ?? []
        const kl1Rows = includeKl1 ? (results[5] ?? []) : null

        let kl1Incomplete = null
        let kl1UnavailableReason = ''
        if (!includeKl1) {
          kl1UnavailableReason = 'KL1 đang tắt'
        } else if (Array.isArray(kl1Rows)) {
          kl1Incomplete = kl1Rows.filter((row) => row && row.dataComplete !== true).length
        } else {
          kl1UnavailableReason = 'Chưa đủ dữ liệu KL1'
        }

        const monthLocked = isPayrollMonthLocked(month, '', locks)

        setPayload({
          today,
          invoices: finance.invoices ?? [],
          expenses: finance.expenses ?? [],
          fixedCosts: finance.fixedCosts ?? [],
          crmInvoices: crm.invoices ?? [],
          attendanceToday,
          pendingEditCount: Array.isArray(pendingEdits) ? pendingEdits.length : 0,
          payrollMonthLocked: monthLocked,
          lockedMonthLabel: monthLocked ? month : '',
          kl1Incomplete,
          kl1UnavailableReason,
          scopeBranchId,
        })
        setError('')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải Business Copilot.')
          setPayload(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, syncVersion, today, scopeBranchId, role])

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
      return {
        alerts: [],
        opportunities: [],
        brief: buildCopilotBrief([], []),
        performance: null,
      }
    }

    const alerts = buildCopilotAlerts({
      today: payload.today,
      invoices: payload.invoices,
      expenses: payload.expenses,
      fixedCosts: payload.fixedCosts,
      attendanceToday: payload.attendanceToday,
      pendingEditCount: payload.pendingEditCount,
      payrollMonthLocked: payload.payrollMonthLocked,
      lockedMonthLabel: payload.lockedMonthLabel,
      kl1Incomplete: payload.kl1Incomplete,
      kl1UnavailableReason: payload.kl1UnavailableReason,
      scopeBranchId: payload.scopeBranchId,
    })

    const opportunities = buildCopilotOpportunities({
      today: payload.today,
      invoices: payload.invoices,
      crmInvoices: payload.crmInvoices,
      scopeBranchId: payload.scopeBranchId,
    })

    const brief = buildCopilotBrief(alerts, opportunities)
    const performance = buildCopilotPerformance({
      today: payload.today,
      invoices: payload.invoices,
      expenses: payload.expenses,
      fixedCosts: payload.fixedCosts,
      scopeBranchId: payload.scopeBranchId,
    })

    return { alerts, opportunities, brief, performance }
  }, [payload])

  return {
    loading,
    error,
    reload,
    enabled: !isEmployee(),
    ...derived,
  }
}
