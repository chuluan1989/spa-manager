import { RETENTION_BUCKET_LABELS, RETENTION_BUCKETS } from './crmGrowthConstants'

function toRetentionRow(customer, bucket) {
  return {
    key: customer.key,
    name: customer.name,
    phone: customer.phone,
    branchName: customer.primaryBranchName || '—',
    primaryEmployeeName: customer.primaryEmployeeName || customer.latestEmployeeName || '—',
    lastServiceName: customer.lastServiceName || customer.favoriteServiceName || '—',
    lastVisitDate: customer.lastVisitDate || '',
    daysSinceLastVisit: customer.daysSinceLastVisit ?? 0,
    healthScore: customer.healthScore ?? 0,
    healthGradeLabel: customer.healthGradeLabel ?? '—',
    healthGradeId: customer.healthGradeId ?? '',
    bucket,
    bucketLabel: RETENTION_BUCKET_LABELS[bucket],
    ltv: customer.ltv ?? customer.totalSpend ?? 0,
    segment: customer.segment,
  }
}

/**
 * Retention lists: 45 / 60 / 90 days chưa quay lại.
 */
export function buildRetentionLists(customers) {
  const list = customers ?? []
  const days45 = []
  const days60 = []
  const days90 = []

  for (const customer of list) {
    const days = Number(customer.daysSinceLastVisit ?? 0)
    if (days >= 90) {
      days90.push(toRetentionRow(customer, RETENTION_BUCKETS.DAYS_90))
    } else if (days >= 60) {
      days60.push(toRetentionRow(customer, RETENTION_BUCKETS.DAYS_60))
    } else if (days >= 45) {
      days45.push(toRetentionRow(customer, RETENTION_BUCKETS.DAYS_45))
    }
  }

  const byIdle = (a, b) => (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0)
    || (a.healthScore ?? 0) - (b.healthScore ?? 0)

  return {
    [RETENTION_BUCKETS.DAYS_45]: days45.sort(byIdle),
    [RETENTION_BUCKETS.DAYS_60]: days60.sort(byIdle),
    [RETENTION_BUCKETS.DAYS_90]: days90.sort(byIdle),
    all: [...days45, ...days60, ...days90].sort(byIdle),
  }
}
