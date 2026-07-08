import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserRole,
} from '../constants/auth'
import { useDataSyncVersion } from './useDataSyncVersion'
import {
  buildCrmDashboard,
  buildCustomerProfiles,
  buildRemarketingLists,
  filterCustomers,
  scopeInvoicesForCrm,
} from '../utils/customerAnalytics'
import { loadCustomerProfileMap } from '../utils/customerProfileStorage'
import { fetchMergedInvoices } from '../utils/invoiceDataFetcher'
import { subscribeToDataSync } from '../utils/supabaseSync'

export function buildDefaultCustomerFilters(overrides = {}) {
  return {
    query: '',
    branchId: '',
    employeeId: '',
    serviceQuery: '',
    segment: '',
    fromDate: '',
    toDate: '',
    ...overrides,
  }
}

export function useCustomersData(appliedFilters = buildDefaultCustomerFilters()) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const syncVersion = useDataSyncVersion()
  const role = getCurrentUserRole()
  const branchId = getCurrentUserBranch()
  const employeeId = getCurrentUserEmployeeId()

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await fetchMergedInvoices({
          fromDate: appliedFilters.fromDate || '',
          toDate: appliedFilters.toDate || '',
          branchId: appliedFilters.branchId || '',
          employeeId: appliedFilters.employeeId || '',
        })
        if (!cancelled) {
          setInvoices(result.invoices)
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải hóa đơn khách hàng.')
          setInvoices([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [appliedFilters.fromDate, appliedFilters.toDate, appliedFilters.branchId, appliedFilters.employeeId, refreshKey, syncVersion])

  useEffect(() => subscribeToDataSync(() => reload()), [reload])

  const scopedInvoices = useMemo(
    () => scopeInvoicesForCrm(invoices, { role, branchId, employeeId }),
    [invoices, role, branchId, employeeId],
  )

  const profileMap = useMemo(() => {
    void refreshKey
    return loadCustomerProfileMap()
  }, [refreshKey])

  const customers = useMemo(
    () => buildCustomerProfiles(scopedInvoices, profileMap),
    [scopedInvoices, profileMap],
  )

  const filteredCustomers = useMemo(
    () => filterCustomers(customers, appliedFilters),
    [customers, appliedFilters],
  )

  const dashboard = useMemo(() => buildCrmDashboard(customers), [customers])
  const remarketingLists = useMemo(() => buildRemarketingLists(customers), [customers])

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'spa-manager-invoices'
        || event.key === 'spa-manager-customer-profiles'
        || event.key === 'spa-manager-customer-care') {
        reload()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  return {
    customers,
    filteredCustomers,
    dashboard,
    remarketingLists,
    scopedInvoices,
    loading,
    error,
    reload,
  }
}
