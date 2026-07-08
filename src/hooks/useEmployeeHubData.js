import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered } from '../repositories/employeesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { loadEmployees, normalizeEmployee } from '../utils/employeeStorage'
import { loadInvoices } from '../utils/invoiceStorage'
import { employeeBelongsToBranch } from '../utils/branchEmployeeMatch'
import { filterSalaryInvoices, getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'

export function useEmployeeHubData({ branchId, month = getCurrentMonthValue() } = {}) {
  const [employees, setEmployees] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)
      const scope = { fromDate, toDate, branchId: branchId || '' }

      if (!isSupabaseConfigured) {
        const localEmployees = loadEmployees()
          .filter((row) => !branchId || employeeBelongsToBranch(row, branchId))
          .map((row) => normalizeEmployee(row))
        const localInvoices = filterSalaryInvoices(loadInvoices(), scope)
        if (!cancelled) {
          setEmployees(localEmployees)
          setInvoices(localInvoices)
          setLoading(false)
        }
        return
      }

      try {
        const [employeeRows, invoiceRows] = await Promise.all([
          fetchEmployeesFiltered({}),
          fetchInvoicesFiltered(scope),
        ])

        if (cancelled) return

        setEmployees((employeeRows ?? [])
          .map((row) => normalizeEmployee(row))
          .filter((row) => !branchId || employeeBelongsToBranch(row, branchId)))
        setInvoices(Array.isArray(invoiceRows) ? invoiceRows : [])
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu nhân viên từ Supabase.')
          const localEmployees = loadEmployees()
            .filter((row) => !branchId || employeeBelongsToBranch(row, branchId))
            .map((row) => normalizeEmployee(row))
          const localInvoices = filterSalaryInvoices(loadInvoices(), scope)
          setEmployees(localEmployees)
          setInvoices(localInvoices)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [branchId, month, refreshKey])

  return { employees, invoices, loading, error, reload }
}
