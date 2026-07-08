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
        const result = await fetchReportPeriodData(scopedFilters)
        if (cancelled) return

        let nextInvoices = filterEmployeeReportInvoices(result.invoices, scopedFilters)
        setInvoices(nextInvoices)
        setExpenses(result.expenses)

        if (result.source === 'local' && isSupabaseConfigured) {
          setError('Supabase chưa phản hồi — đang dùng dữ liệu cục bộ.')
        } else if (result.source === 'local-fallback') {
          setError(result.error?.message
            ? `${result.error.message} — đang dùng dữ liệu cục bộ.`
            : 'Không tải được Cloud — đang dùng dữ liệu cục bộ.')
        } else if (result.source === 'local' && !isSupabaseConfigured) {
          setError('Supabase chưa cấu hình — đang dùng dữ liệu cục bộ.')
        } else {
          setError('')
        }
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

  return { invoices, expenses, loading, error, reload, scopedFilters }
}
