/**
 * Benchmark (horizontal) sort keys + TOP / BOTTOM extractors.
 */

export const BENCHMARK_METRICS = [
  { key: 'revenue', label: 'Doanh thu', format: 'money' },
  { key: 'revenuePerWorkDay', label: 'Doanh thu/ngày làm', format: 'money', primary: true },
  { key: 'totalCustomerCount', label: 'Khách', format: 'number' },
  { key: 'customersPerWorkDay', label: 'Khách/ngày', format: 'number' },
  { key: 'requestedCustomerCount', label: 'Khách yêu cầu', format: 'number' },
  { key: 'requestedPerWorkDay', label: 'Khách yêu cầu/ngày', format: 'number' },
  { key: 'requestedRate', label: 'Tỷ lệ khách yêu cầu', format: 'rate' },
  { key: 'tips', label: 'Tips', format: 'money' },
  { key: 'tipsPerWorkDay', label: 'Tips/ngày', format: 'number' },
  { key: 'averageRevenuePerCustomer', label: 'Doanh thu/khách', format: 'money' },
  { key: 'performanceScore', label: 'Performance Score', format: 'score' },
  { key: 'workDays', label: 'Ngày công', format: 'number' },
]

export const DEFAULT_BENCHMARK_SORT = 'revenuePerWorkDay'

export function getBenchmarkMetric(key) {
  return BENCHMARK_METRICS.find((m) => m.key === key) || BENCHMARK_METRICS.find((m) => m.primary)
}

/**
 * Sort rows by benchmark metric. Nulls sink to bottom when desc.
 */
export function sortBenchmarkRows(rows, sortKey = DEFAULT_BENCHMARK_SORT, sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1
  const key = sortKey || DEFAULT_BENCHMARK_SORT
  return [...(rows ?? [])].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    const aNull = av == null || Number.isNaN(Number(av))
    const bNull = bv == null || Number.isNaN(Number(bv))
    if (aNull && bNull) return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'vi')
    if (aNull) return 1
    if (bNull) return -1
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv), 'vi') * dir
    }
    const diff = (Number(av) - Number(bv)) * dir
    if (diff !== 0) return diff
    // Tie-break: prefer higher revenue/work-day, then revenue
    const tie = (Number(b.revenuePerWorkDay ?? 0) - Number(a.revenuePerWorkDay ?? 0))
      || (Number(b.revenue ?? 0) - Number(a.revenue ?? 0))
    return tie
  })
}

/**
 * TOP and BOTTOM by absolute metric value (benchmark, not MoM %).
 */
export function buildBenchmarkTopBottom(rows, {
  metric = DEFAULT_BENCHMARK_SORT,
  limit = 5,
} = {}) {
  const sortedDesc = sortBenchmarkRows(rows, metric, 'desc')
  const withValue = sortedDesc.filter((row) => {
    const v = row[metric]
    return v != null && Number.isFinite(Number(v))
  })
  return {
    metric,
    top: withValue.slice(0, limit),
    bottom: [...withValue].reverse().slice(0, limit),
  }
}
