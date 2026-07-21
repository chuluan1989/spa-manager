import { CUSTOMER_SEGMENTS } from '../../constants/customerTypes'
import { GROWTH_THRESHOLDS } from './crmGrowthConstants'
import { loadSystemSettings } from '../systemSettingsStorage'

/**
 * Rule-based growth segment (invoice-history profile fields only).
 * Priority: DORMANT → AT_RISK → VIP → LOYAL → NEW
 */
export function classifyGrowthSegment(profile, vipThreshold) {
  const visitCount = Number(profile.visitCount ?? 0)
  const days = Number(profile.daysSinceLastVisit ?? 0)
  const avg = Number(profile.avgVisitsPerMonth ?? 0)
  const revenue = Number(profile.totalTicketRevenue ?? 0)
  const threshold = Number(
    vipThreshold ?? loadSystemSettings().vipCustomerThreshold ?? 10_000_000,
  )

  if (days >= GROWTH_THRESHOLDS.dormantDays) {
    return CUSTOMER_SEGMENTS.DORMANT
  }
  if (
    visitCount >= 2
    && days >= GROWTH_THRESHOLDS.atRiskMinDays
    && days <= GROWTH_THRESHOLDS.atRiskMaxDays
  ) {
    return CUSTOMER_SEGMENTS.AT_RISK
  }
  if (avg >= GROWTH_THRESHOLDS.vipMinVisitsPerMonth || revenue >= threshold) {
    return CUSTOMER_SEGMENTS.VIP
  }
  if (
    visitCount >= GROWTH_THRESHOLDS.loyalMinVisits
    && days < GROWTH_THRESHOLDS.loyalMaxIdleDays
  ) {
    return CUSTOMER_SEGMENTS.LOYAL
  }
  if (
    visitCount <= GROWTH_THRESHOLDS.newMaxVisits
    && days < GROWTH_THRESHOLDS.newMaxIdleDays
  ) {
    return CUSTOMER_SEGMENTS.NEW
  }
  if (visitCount <= 1) return CUSTOMER_SEGMENTS.NEW
  if (days >= GROWTH_THRESHOLDS.atRiskMinDays) return CUSTOMER_SEGMENTS.AT_RISK
  return CUSTOMER_SEGMENTS.LOYAL
}
