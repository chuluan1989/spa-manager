import { useMemo } from 'react'
import { buildDefaultCustomerFilters, useCustomersData } from './useCustomersData'
import {
  buildCareTodayList,
  buildCrmCeoInsights,
  buildCustomerGrowthMetrics,
  enrichCustomersForGrowth,
} from '../utils/crmGrowth/buildCustomerGrowth'
import { buildRetentionLists } from '../utils/crmGrowth/buildRetentionLists'

/**
 * CRM & Customer Growth V1 — rule-based aggregates over invoice-derived profiles.
 */
export function useCrmGrowthData(appliedFilters = buildDefaultCustomerFilters()) {
  const base = useCustomersData(appliedFilters)

  const growthCustomers = useMemo(
    () => enrichCustomersForGrowth(base.customers),
    [base.customers],
  )

  const filteredGrowthCustomers = useMemo(() => {
    const keys = new Set((base.filteredCustomers ?? []).map((c) => c.key))
    return growthCustomers.filter((c) => keys.has(c.key))
  }, [growthCustomers, base.filteredCustomers])

  const careToday = useMemo(
    () => buildCareTodayList(growthCustomers),
    [growthCustomers],
  )

  const retentionLists = useMemo(
    () => buildRetentionLists(growthCustomers),
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
    retentionLists,
    metrics,
    ceoInsights,
  }
}
