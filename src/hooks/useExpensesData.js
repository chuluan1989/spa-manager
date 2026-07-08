import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterByUserBranch,
  getCurrentUserBranch,
  isAdmin,
} from '../constants/auth'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpenses } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { saveExpenses, normalizeExpense } from '../utils/expenseStorage'
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
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải chi phí.')
        }

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
        setError('')
      } catch (err) {
        if (cancelled) return
        setAllExpenses([])
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
