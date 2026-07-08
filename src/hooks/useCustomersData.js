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
import { loadInvoices } from '../utils/invoiceStorage'

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
  const syncVersion = useDataSyncVersion()
  const role = getCurrentUserRole()
  const branchId = getCurrentUserBranch()
  const employeeId = getCurrentUserEmployeeId()

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  const scopedInvoices = useMemo(() => {
    void refreshKey
    void syncVersion
    const all = loadInvoices()
    return scopeInvoicesForCrm(all, { role, branchId, employeeId })
  }, [refreshKey, syncVersion, role, branchId, employeeId])

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
    reload,
  }
}
