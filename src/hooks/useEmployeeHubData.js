import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered, subscribeEmployeesChanges } from '../repositories/employeesRepository'
import { fetchInvoicesFiltered, subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { normalizeEmployee } from '../utils/employeeStorage'
import { employeeBelongsToBranch } from '../utils/branchEmployeeMatch'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../utils/salaryReport'
import { subscribeToDataSync } from '../utils/supabaseSync'

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

      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu nhân viên.')
        }

        const [employeeRows, invoiceRows] = await Promise.all([
          fetchEmployeesFiltered({}),
          fetchInvoicesFiltered(scope),
        ])

        if (cancelled) return

        setEmployees((employeeRows ?? [])
          .map((row) => normalizeEmployee(row))
          .filter((row) => !branchId || employeeBelongsToBranch(row, branchId)))
        setInvoices(Array.isArray(invoiceRows) ? invoiceRows : [])
        setError('')
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

  useEffect(() => {
    const onLiveChange = () => reload()
    const unsubEmployees = subscribeEmployeesChanges(onLiveChange)
    const unsubInvoices = subscribeInvoicesChanges(onLiveChange)
    const unsubDataSync = subscribeToDataSync(onLiveChange)
    return () => {
      unsubEmployees()
      unsubInvoices()
      unsubDataSync()
    }
  }, [reload])

  return { employees, invoices, loading, error, reload }
}
