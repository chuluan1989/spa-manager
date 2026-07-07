import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterByUserBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpenses } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { loadExpenses, saveExpenses, normalizeExpense } from '../utils/expenseStorage'
import { useDataSyncVersion } from './useDataSyncVersion'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'

export function buildDefaultExpenseFilters(overrides = {}) {
  return {
    fromDate: getMonthStartDate(),
    toDate: getTodayDate(),
    branchId: isAdmin() ? '' : getCurrentUserBranch(),
    expenseType: '',
    categoryId: '',
    ...overrides,
  }
}

export function useExpensesData(filters) {
  const [allExpenses, setAllExpenses] = useState([])
  const [allInvoices, setAllInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const syncVersion = useDataSyncVersion()

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  const scopedFilters = useMemo(() => {
    const next = { ...filters }
    if (!isAdmin()) {
      next.branchId = getCurrentUserBranch()
    }
    return next
  }, [filters])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        if (isSupabaseConfigured) {
          const [expenseRows, invoiceRows] = await Promise.all([
            fetchExpenses(),
            fetchInvoicesFiltered({
              fromDate: scopedFilters.fromDate || '',
              toDate: scopedFilters.toDate || '',
              branchId: scopedFilters.branchId || '',
            }),
          ])

          if (cancelled) return

          const normalized = (expenseRows ?? []).map(normalizeExpense)
          setAllExpenses(normalized)
          setAllInvoices(invoiceRows ?? [])
          saveExpenses(normalized)
        } else {
          const local = loadExpenses()
          if (cancelled) return
          setAllExpenses(local)
          setAllInvoices([])
          setError('Supabase chưa cấu hình — đang dùng dữ liệu cục bộ.')
        }
      } catch (err) {
        if (cancelled) return
        const local = loadExpenses()
        setAllExpenses(local)
        setAllInvoices([])
        setError(err?.message || 'Không thể tải chi phí từ Supabase.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [scopedFilters.fromDate, scopedFilters.toDate, scopedFilters.branchId, refreshKey, syncVersion])

  const expenses = useMemo(
    () => filterByUserBranch(allExpenses),
    [allExpenses],
  )

  return {
    expenses,
    allExpenses: filterByUserBranch(allExpenses),
    invoices: filterByUserBranch(allInvoices),
    loading,
    error,
    reload,
  }
}
