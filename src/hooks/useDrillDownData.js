import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpensesFiltered } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import {
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserRole,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { filterEmployeeReportInvoices } from '../utils/employeeInvoiceReport'
import { getMonthStartDate, getTodayDate } from '../utils/invoiceStorage'

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
      if (!isSupabaseConfigured) {
        setError('Supabase chưa cấu hình — Dashboard/Báo cáo yêu cầu dữ liệu Cloud.')
        setInvoices([])
        setExpenses([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const { fromDate, toDate, branchId, employeeId, customerSearch } = scopedFilters

      try {
        const [invoiceRows, expenseRows] = await Promise.all([
          fetchInvoicesFiltered({
            fromDate,
            toDate,
            branchId: branchId || '',
            employeeId: employeeId || '',
            customerSearch,
          }),
          fetchExpensesFiltered({
            fromDate,
            toDate,
            branchId: branchId || '',
          }),
        ])

        if (cancelled) return

        let nextInvoices = Array.isArray(invoiceRows) ? invoiceRows : []
        nextInvoices = filterEmployeeReportInvoices(nextInvoices, scopedFilters)
        setInvoices(nextInvoices)
        setExpenses(Array.isArray(expenseRows) ? expenseRows : [])
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu từ Supabase.')
          setInvoices([])
          setExpenses([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [scopedFilters, refreshKey])

  return { invoices, expenses, loading, error, reload, scopedFilters }
}
