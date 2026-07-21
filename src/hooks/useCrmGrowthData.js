import { useMemo } from 'react'
import { buildDefaultCustomerFilters, useCustomersData } from './useCustomersData'
import {
  buildCareTodayList,
  buildCrmCeoInsights,
  buildCustomerGrowthMetrics,
  enrichCustomersForGrowth,
} from '../utils/crmGrowth/buildCustomerGrowth'

/**
 * CRM & Customer Growth V1 — rule-based aggregates over invoice-derived profiles.
 */
export function useCrmGrowthData(appliedFilters = buildDefaultCustomerFilters()) {
  const base = useCustomersData(appliedFilters)

  const growthCustomers = useMemo(
    () => enrichCustomersForGrowth(base.customers),
    [base.customers],
  )

  const filteredGrowthCustomers = useMemo(
    () => enrichCustomersForGrowth(base.filteredCustomers),
    [base.filteredCustomers],
  )

  const careToday = useMemo(
    () => buildCareTodayList(growthCustomers),
    [growthCustomers],
  )

  const metrics = useMemo(
    () => buildCustomerGrowthMetrics(growthCustomers),
    [growthCustomers],
  )

  const ceoInsights = useMemo(
    () => buildCrmCeoInsights(growthCustomers),
    [growthCustomers],
  )

  return {
    ...base,
    customers: growthCustomers,
    filteredCustomers: filteredGrowthCustomers,
    careToday,
    metrics,
    ceoInsights,
  }
}
