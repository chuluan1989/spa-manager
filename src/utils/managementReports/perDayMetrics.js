/**
 * Work-day normalized KPIs — primary performance axis for Management Reports V2.
 */

import { computeSafeTrend, safeDivide } from './periodCompare'

/**
 * Attach per-work-day metrics + trends onto a metrics row that already has workDays.
 */
export function attachPerDayMetrics(current, previous = null) {
  const workDays = Number(current?.workDays ?? 0)
  const prevWorkDays = Number(previous?.workDays ?? previous?.previousWorkDays ?? 0)

  const revenuePerWorkDay = safeDivide(current?.revenue, workDays)
  const customersPerWorkDay = safeDivide(current?.totalCustomerCount, workDays)
  const requestedPerWorkDay = safeDivide(current?.requestedCustomerCount, workDays)
  const tipsPerWorkDay = safeDivide(current?.tips, workDays)

  const prevRevenuePerWorkDay = safeDivide(previous?.revenue, prevWorkDays)
  const prevCustomersPerWorkDay = safeDivide(previous?.totalCustomerCount, prevWorkDays)
  const prevRequestedPerWorkDay = safeDivide(previous?.requestedCustomerCount, prevWorkDays)
  const prevTipsPerWorkDay = safeDivide(previous?.tips, prevWorkDays)

  return {
    ...current,
    // Alias kept for V1 consumers
    averageRevenuePerWorkDay: revenuePerWorkDay,
    revenuePerWorkDay,
    customersPerWorkDay,
    requestedPerWorkDay,
    tipsPerWorkDay,
    workDaysTrend: computeSafeTrend(workDays, prevWorkDays),
    revenuePerWorkDayTrend: computeSafeTrend(revenuePerWorkDay, prevRevenuePerWorkDay),
    customersPerWorkDayTrend: computeSafeTrend(customersPerWorkDay, prevCustomersPerWorkDay),
    requestedPerWorkDayTrend: computeSafeTrend(requestedPerWorkDay, prevRequestedPerWorkDay),
    tipsPerWorkDayTrend: computeSafeTrend(tipsPerWorkDay, prevTipsPerWorkDay),
    previous: current.previous
      ? {
          ...current.previous,
          workDays: prevWorkDays,
          revenuePerWorkDay: prevRevenuePerWorkDay,
          customersPerWorkDay: prevCustomersPerWorkDay,
          requestedPerWorkDay: prevRequestedPerWorkDay,
          tipsPerWorkDay: prevTipsPerWorkDay,
        }
      : current.previous,
  }
}
