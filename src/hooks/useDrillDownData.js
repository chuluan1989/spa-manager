import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserRole,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { filterEmployeeReportInvoices } from '../utils/employeeInvoiceReport'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'
import { fetchReportPeriodData } from '../utils/reportDataFetcher'
import { subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { useDataSyncVersion } from './useDataSyncVersion'

export function buildDefaultDrillFilters(overrides = {}) {
  return {
    fromDate: getMonthStartDate(),
    toDate: getTodayDate(),
    branchId: isAdmin() ? '' : getCurrentUserBranch(),
    employeeId: isEmployee() ? getCurrentUserEmployeeId() : '',
    customerSearch: '',
    serviceId: '',
    discountFilter: '',
    ...overrides,
  }
}

export function useDrillDownData(filters) {
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const syncVersion = useDataSyncVersion()

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  const scopedFilters = useMemo(() => {
    const role = getCurrentUserRole()
    const next = { ...filters }
    if (role === 'branch_manager' || role === 'employee') {
      next.branchId = getCurrentUserBranch()
    }
    if (role === 'employee') {
      next.employeeId = getCurrentUserEmployeeId()
    }
    return next
  }, [filters])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu tổng quan.')
        }
        const result = await fetchReportPeriodData(scopedFilters)
        if (cancelled) return

        setInvoices(filterEmployeeReportInvoices(result.invoices, scopedFilters))
        setExpenses(result.expenses)
        setError('')
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu báo cáo.')
          setInvoices([])
          setExpenses([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [scopedFilters, refreshKey, syncVersion])

  useEffect(() => subscribeToDataSync(() => reload()), [reload])

  useEffect(() => subscribeInvoicesChanges(() => reload()), [reload])

  return { invoices, expenses, loading, error, reload, scopedFilters }
}
