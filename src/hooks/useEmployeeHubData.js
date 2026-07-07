import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered } from '../repositories/employeesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { normalizeEmployee } from '../utils/employeeStorage'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'

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
      if (!isSupabaseConfigured) {
        setError('Supabase chưa cấu hình — module Nhân viên yêu cầu dữ liệu Cloud.')
        setEmployees([])
        setInvoices([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

      try {
        const [employeeRows, invoiceRows] = await Promise.all([
          fetchEmployeesFiltered(branchId ? { branchId } : {}),
          fetchInvoicesFiltered({ fromDate, toDate, branchId: branchId || '' }),
        ])

        if (cancelled) return

        setEmployees((employeeRows ?? []).map((row) => normalizeEmployee(row)))
        setInvoices(Array.isArray(invoiceRows) ? invoiceRows : [])
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải dữ liệu nhân viên từ Supabase.')
          setEmployees([])
          setInvoices([])
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
