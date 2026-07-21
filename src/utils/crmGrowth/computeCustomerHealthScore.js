import {
  HEALTH_GRADES,
  HEALTH_WEIGHTS,
} from './crmGrowthConstants'

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreFrequency(avgVisitsPerMonth) {
  // 0/mo → 0 · 2+/mo → 100
  return clampScore((Number(avgVisitsPerMonth) / 2) * 100)
}

function scoreRecency(daysSinceLastVisit) {
  // 0 ngày → 100 · ≥90 ngày → 0
  const days = Number(daysSinceLastVisit ?? 0)
  return clampScore(100 - (days / 90) * 100)
}

function scoreLtv(ltv, maxLtv) {
  const max = Math.max(1, Number(maxLtv) || 1)
  return clampScore((Number(ltv ?? 0) / max) * 100)
}

function scoreVisits(visitCount, maxVisits) {
  const max = Math.max(1, Number(maxVisits) || 1)
  return clampScore((Number(visitCount ?? 0) / max) * 100)
}

function scoreRequested(requestedCount, visitCount) {
  const visits = Number(visitCount ?? 0)
  if (visits <= 0) return 0
  return clampScore((Number(requestedCount ?? 0) / visits) * 100)
}

export function resolveHealthGrade(score) {
  const value = Number(score ?? 0)
  for (const grade of Object.values(HEALTH_GRADES)) {
    if (value >= grade.min && value <= grade.max) return grade
  }
  return HEALTH_GRADES.CRITICAL
}

/**
 * Rule-based Customer Health Score (0–100).
 * Weights: 30% frequency · 25% recency · 20% LTV · 15% visits · 10% requested.
 */
export function computeCustomerHealthScore(profile, peers = {}) {
  const parts = {
    frequency: scoreFrequency(profile.avgVisitsPerMonth),
    recency: scoreRecency(profile.daysSinceLastVisit),
    ltv: scoreLtv(profile.ltv ?? profile.totalSpend, peers.maxLtv ?? profile.ltv ?? profile.totalSpend),
    visits: scoreVisits(profile.visitCount, peers.maxVisits ?? profile.visitCount),
    requested: scoreRequested(profile.requestedCount, profile.visitCount),
  }

  const score = clampScore(
    parts.frequency * HEALTH_WEIGHTS.frequency
    + parts.recency * HEALTH_WEIGHTS.recency
    + parts.ltv * HEALTH_WEIGHTS.ltv
    + parts.visits * HEALTH_WEIGHTS.visits
    + parts.requested * HEALTH_WEIGHTS.requested,
  )

  const grade = resolveHealthGrade(score)
  return {
    score,
    gradeId: grade.id,
    gradeLabel: grade.label,
    parts,
  }
}
