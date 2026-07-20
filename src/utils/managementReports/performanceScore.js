/**
 * Rule-based Performance Score 0–100 for Management Reports V2.
 *
 * Weights:
 * 30% Doanh thu/ngày
 * 20% Khách yêu cầu %
 * 15% Doanh thu/khách
 * 10% Tips/ngày
 * 15% Xu hướng tăng trưởng 3 tháng
 * 10% Chuyên cần
 */

import { computeAttendanceStats } from '../payrollLiveHelpers'
import { safeDivide } from './periodCompare'

export const PERFORMANCE_WEIGHTS = {
  revenuePerWorkDay: 0.30,
  requestedRate: 0.20,
  averageRevenuePerCustomer: 0.15,
  tipsPerWorkDay: 0.10,
  evolution: 0.15,
  attendance: 0.10,
}

export const PERFORMANCE_GRADES = [
  { min: 95, id: 'excellent', label: 'Xuất sắc' },
  { min: 85, id: 'very-good', label: 'Rất tốt' },
  { min: 70, id: 'good', label: 'Tốt' },
  { min: 50, id: 'improve', label: 'Cần cải thiện' },
  { min: 0, id: 'alert', label: 'Cảnh báo' },
]

export function resolvePerformanceGrade(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return { id: 'none', label: '—' }
  for (const grade of PERFORMANCE_GRADES) {
    if (n >= grade.min) return { id: grade.id, label: grade.label }
  }
  return PERFORMANCE_GRADES[PERFORMANCE_GRADES.length - 1]
}

/**
 * Percentile score 0–100 within peer values (higher is better).
 * Null/undefined values get 0.
 */
export function percentileScore(value, peerValues) {
  if (value == null || !Number.isFinite(Number(value))) return 0
  const peers = (peerValues ?? [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
  if (peers.length === 0) return 0
  if (peers.length === 1) return Number(value) > 0 ? 70 : 40

  const sorted = [...peers].sort((a, b) => a - b)
  const v = Number(value)
  let below = 0
  for (const p of sorted) {
    if (p < v) below += 1
    else break
  }
  // Mid-rank percentile
  const equal = sorted.filter((p) => p === v).length
  const rank = below + (equal + 1) / 2
  return Math.round((rank / sorted.length) * 1000) / 10
}

function evolutionComponent(evolution) {
  const id = evolution?.conclusion?.id
  if (id === 'improving') return 90
  if (id === 'stable') return 55
  if (id === 'declining') return 25
  if (id === 'new') return 50
  return 40
}

/**
 * Chuyên cần: on-time share among countable attendance (exclude weekend).
 * Late/early still present but lower score; unpermitted leave hurts.
 */
export function attendanceDiligenceScore(attendanceStats) {
  if (!attendanceStats) return 40
  const {
    onTime = 0,
    late = 0,
    early = 0,
    permittedLeave = 0,
    unpermittedLeave = 0,
    workDays = 0,
    totalRecords = 0,
  } = attendanceStats

  const presentLike = onTime + late + early + (workDays > 0 ? 0 : 0)
  const denom = onTime + late + early + permittedLeave + unpermittedLeave
  if (denom <= 0 && totalRecords <= 0) {
    // No attendance records — neutral-low (new hire / no data)
    return workDays > 0 ? 60 : 35
  }
  if (denom <= 0) return 40

  const onTimeRate = onTime / denom
  const unpermPenalty = Math.min(40, unpermittedLeave * 12)
  const latePenalty = Math.min(25, (late + early) * 4)
  const raw = onTimeRate * 100 - unpermPenalty - latePenalty
  return Math.max(0, Math.min(100, Math.round(raw)))
}

const COMPONENT_META = [
  { key: 'revenuePerWorkDay', label: 'Doanh thu/ngày', weight: PERFORMANCE_WEIGHTS.revenuePerWorkDay },
  { key: 'requestedRate', label: 'Tỷ lệ khách yêu cầu', weight: PERFORMANCE_WEIGHTS.requestedRate },
  { key: 'averageRevenuePerCustomer', label: 'Doanh thu/khách', weight: PERFORMANCE_WEIGHTS.averageRevenuePerCustomer },
  { key: 'tipsPerWorkDay', label: 'Tips/ngày', weight: PERFORMANCE_WEIGHTS.tipsPerWorkDay },
  { key: 'evolution', label: 'Xu hướng 3 tháng', weight: PERFORMANCE_WEIGHTS.evolution },
  { key: 'attendance', label: 'Chuyên cần', weight: PERFORMANCE_WEIGHTS.attendance },
]

/**
 * Compute one row's performance score given peer rows + optional evolution + attendance stats.
 */
export function computePerformanceScore(row, peers, { evolution = null, attendanceStats = null } = {}) {
  const peerList = peers?.length ? peers : [row]

  const components = {
    revenuePerWorkDay: percentileScore(
      row.revenuePerWorkDay ?? row.averageRevenuePerWorkDay,
      peerList.map((p) => p.revenuePerWorkDay ?? p.averageRevenuePerWorkDay),
    ),
    requestedRate: percentileScore(
      row.requestedRate,
      peerList.map((p) => p.requestedRate),
    ),
    averageRevenuePerCustomer: percentileScore(
      row.averageRevenuePerCustomer,
      peerList.map((p) => p.averageRevenuePerCustomer),
    ),
    tipsPerWorkDay: percentileScore(
      row.tipsPerWorkDay,
      peerList.map((p) => p.tipsPerWorkDay),
    ),
    evolution: evolutionComponent(evolution),
    attendance: attendanceDiligenceScore(
      attendanceStats ?? row.attendanceStats ?? null,
    ),
  }

  let score = 0
  for (const meta of COMPONENT_META) {
    score += (components[meta.key] ?? 0) * meta.weight
  }
  score = Math.round(Math.max(0, Math.min(100, score)) * 10) / 10

  const ranked = COMPONENT_META
    .map((meta) => ({
      key: meta.key,
      label: meta.label,
      value: components[meta.key],
      weight: meta.weight,
    }))
    .sort((a, b) => b.value - a.value)

  const grade = resolvePerformanceGrade(score)
  const trendLabel = evolution?.conclusion?.label || '—'
  const trendTone = evolution?.conclusion?.tone || 'neutral'

  return {
    performanceScore: score,
    performanceGrade: grade.label,
    performanceGradeId: grade.id,
    performanceTrendLabel: trendLabel,
    performanceTrendTone: trendTone,
    performanceComponents: components,
    strongestMetric: ranked[0] ?? null,
    weakestMetric: ranked[ranked.length - 1] ?? null,
  }
}

/**
 * Attach scores + system/branch ranks to employee or branch rows.
 */
export function enrichRowsWithPerformance(rows, {
  getEvolution,
  getAttendanceStats,
  groupByBranch = true,
} = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return []

  const scored = list.map((row) => {
    const peers = groupByBranch && row.branchId
      ? list.filter((p) => p.branchId === row.branchId)
      : list
    const evolution = getEvolution?.(row) ?? row.evolution ?? null
    const attendanceStats = getAttendanceStats?.(row) ?? row.attendanceStats ?? null
    const scoreFields = computePerformanceScore(row, peers.length ? peers : list, {
      evolution,
      attendanceStats,
    })
    return { ...row, evolution, ...scoreFields }
  })

  // Rank by performance score within branch + system-wide
  if (groupByBranch) {
    const byBranch = new Map()
    for (const row of scored) {
      const key = row.branchId || 'unknown'
      if (!byBranch.has(key)) byBranch.set(key, [])
      byBranch.get(key).push(row)
    }
    for (const group of byBranch.values()) {
      const sorted = [...group].sort(
        (a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)
          || (b.revenuePerWorkDay ?? 0) - (a.revenuePerWorkDay ?? 0),
      )
      sorted.forEach((row, index) => {
        row.performanceRankInBranch = index + 1
        row.performanceRankInBranchTotal = sorted.length
      })
    }
  }

  const systemSorted = [...scored].sort(
    (a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)
      || (b.revenuePerWorkDay ?? 0) - (a.revenuePerWorkDay ?? 0),
  )
  systemSorted.forEach((row, index) => {
    row.performanceRankSystem = index + 1
    row.performanceRankSystemTotal = systemSorted.length
  })

  // Also rank by revenue/work-day (primary operational rank)
  const byRevDay = [...scored].sort(
    (a, b) => (b.revenuePerWorkDay ?? -1) - (a.revenuePerWorkDay ?? -1),
  )
  byRevDay.forEach((row, index) => {
    row.revenuePerWorkDayRankSystem = index + 1
    row.revenuePerWorkDayRankSystemTotal = byRevDay.length
  })

  if (groupByBranch) {
    const byBranch = new Map()
    for (const row of scored) {
      const key = row.branchId || 'unknown'
      if (!byBranch.has(key)) byBranch.set(key, [])
      byBranch.get(key).push(row)
    }
    for (const group of byBranch.values()) {
      const sorted = [...group].sort(
        (a, b) => (b.revenuePerWorkDay ?? -1) - (a.revenuePerWorkDay ?? -1),
      )
      sorted.forEach((row, index) => {
        row.revenuePerWorkDayRankInBranch = index + 1
        row.revenuePerWorkDayRankInBranchTotal = sorted.length
      })
    }
  }

  return scored
}

export function buildAttendanceStatsMap(attendanceRecords, employeeIds) {
  const map = new Map()
  for (const id of employeeIds ?? []) {
    map.set(id, computeAttendanceStats(attendanceRecords ?? [], id))
  }
  return map
}

export { safeDivide }
