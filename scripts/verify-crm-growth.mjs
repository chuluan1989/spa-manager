/**
 * Verify CRM & Customer Growth V1 (rule-based, no AI, no migration).
 * Run: npm run verify:crm-growth
 */

import './_polyfill-storage.mjs'
import assert from 'node:assert/strict'
import { CUSTOMER_SEGMENTS } from '../src/constants/customerTypes.js'
import { classifyGrowthSegment } from '../src/utils/crmGrowth/classifyGrowthSegment.js'
import {
  buildCareTodayList,
  buildCrmCeoInsights,
  buildCustomerGrowthMetrics,
  computeAvgReturnCycleDays,
  computeCustomerLtv,
  enrichCustomerGrowthProfile,
  enrichCustomersForGrowth,
} from '../src/utils/crmGrowth/buildCustomerGrowth.js'
import { computeCustomerHealthScore, resolveHealthGrade } from '../src/utils/crmGrowth/computeCustomerHealthScore.js'
import { buildCustomerFullTimeline } from '../src/utils/crmGrowth/buildCustomerFullTimeline.js'
import { buildRetentionLists } from '../src/utils/crmGrowth/buildRetentionLists.js'
import {
  GROWTH_THRESHOLDS,
  HEALTH_WEIGHTS,
  RETENTION_BUCKETS,
  TIMELINE_EVENT_TYPES,
} from '../src/utils/crmGrowth/crmGrowthConstants.js'
import { addCustomerCareLog } from '../src/utils/customerProfileStorage.js'

localStorage.clear()

{
  assert.equal(
    classifyGrowthSegment({ visitCount: 5, daysSinceLastVisit: 100, avgVisitsPerMonth: 2, totalTicketRevenue: 0 }, 10_000_000),
    CUSTOMER_SEGMENTS.DORMANT,
  )
  assert.equal(
    classifyGrowthSegment({ visitCount: 4, daysSinceLastVisit: 50, avgVisitsPerMonth: 1, totalTicketRevenue: 0 }, 10_000_000),
    CUSTOMER_SEGMENTS.AT_RISK,
  )
  assert.equal(
    classifyGrowthSegment({ visitCount: 8, daysSinceLastVisit: 10, avgVisitsPerMonth: 2.5, totalTicketRevenue: 0 }, 10_000_000),
    CUSTOMER_SEGMENTS.VIP,
  )
  assert.equal(
    classifyGrowthSegment({ visitCount: 5, daysSinceLastVisit: 20, avgVisitsPerMonth: 1.2, totalTicketRevenue: 0 }, 10_000_000),
    CUSTOMER_SEGMENTS.LOYAL,
  )
  assert.equal(
    classifyGrowthSegment({ visitCount: 1, daysSinceLastVisit: 5, avgVisitsPerMonth: 1, totalTicketRevenue: 0 }, 10_000_000),
    CUSTOMER_SEGMENTS.NEW,
  )
  assert.ok(GROWTH_THRESHOLDS.dormantDays >= 90)
  assert.equal(HEALTH_WEIGHTS.frequency, 0.30)
}

{
  const healthHigh = computeCustomerHealthScore({
    avgVisitsPerMonth: 3,
    daysSinceLastVisit: 5,
    ltv: 10_000_000,
    visitCount: 12,
    requestedCount: 8,
  }, { maxLtv: 10_000_000, maxVisits: 12 })
  assert.ok(healthHigh.score >= 80)
  assert.equal(resolveHealthGrade(97).id, 'vip')
  assert.equal(resolveHealthGrade(85).id, 'excellent')
  assert.equal(resolveHealthGrade(65).id, 'normal')
  assert.equal(resolveHealthGrade(45).id, 'at_risk')
  assert.equal(resolveHealthGrade(20).id, 'critical')

  const healthLow = computeCustomerHealthScore({
    avgVisitsPerMonth: 0.2,
    daysSinceLastVisit: 100,
    ltv: 100_000,
    visitCount: 1,
    requestedCount: 0,
  }, { maxLtv: 10_000_000, maxVisits: 12 })
  assert.ok(healthLow.score < 40)
}

{
  const profile = enrichCustomerGrowthProfile({
    key: 'phone:0901',
    name: 'Lan',
    phone: '0901',
    visitCount: 3,
    totalSpend: 3_000_000,
    totalTicketRevenue: 2_500_000,
    avgSpendPerVisit: 1_000_000,
    avgVisitsPerMonth: 1.5,
    daysSinceLastVisit: 100,
    segment: CUSTOMER_SEGMENTS.DORMANT,
    firstVisitDate: '2025-01-01',
    lastVisitDate: '2025-03-10',
    dateOfBirth: '1990-07-15',
    invoices: [
      { id: 'i1', date: '2025-01-01', invoiceTime: '09:00', employeeName: 'Mai', customerRequested: true, services: [{ id: 's1', name: 'Gội đầu', price: 200000 }], tips: 50000 },
      { id: 'i2', date: '2025-02-01', invoiceTime: '10:00', employeeName: 'Mai', customerRequested: false, services: [{ id: 's1', name: 'Gội đầu', price: 200000 }], tips: 0 },
      { id: 'i3', date: '2025-03-10', invoiceTime: '11:00', employeeName: 'Hoa', customerRequested: true, services: [{ id: 's2', name: 'Massage', price: 500000 }], tips: 100000 },
    ],
    employeeStats: [{ id: 'e1', name: 'Mai Nhi', count: 2 }],
    serviceStats: [
      { id: 's1', name: 'Gội đầu', count: 2, revenue: 400000 },
      { id: 's2', name: 'Massage', count: 1, revenue: 500000 },
    ],
    latestEmployeeId: 'e1',
    latestEmployeeName: 'Mai Nhi',
    primaryBranchName: 'Sóc Trăng',
  })
  assert.equal(computeCustomerLtv(profile), 3_000_000)
  assert.equal(profile.ltv, 3_000_000)
  assert.ok(computeAvgReturnCycleDays(profile) > 0)
  assert.equal(profile.primaryEmployeeName, 'Mai Nhi')
  assert.equal(profile.favoriteServiceName, 'Gội đầu')
  assert.ok(profile.healthScore >= 0 && profile.healthScore <= 100)
  assert.equal(profile.valueAnalysis.topRevenueServiceName, 'Massage')
  assert.equal(profile.requestedCount, 2)

  addCustomerCareLog({
    customerKey: 'phone:0901',
    careDate: '2025-03-15',
    followUpDate: '2025-04-01',
    caretaker: 'QL',
    content: 'Gọi mời quay lại',
  })

  const timeline = buildCustomerFullTimeline(profile)
  assert.ok(timeline.some((e) => e.type === TIMELINE_EVENT_TYPES.FIRST_VISIT))
  assert.ok(timeline.some((e) => e.type === TIMELINE_EVENT_TYPES.INVOICE))
  assert.ok(timeline.some((e) => e.type === TIMELINE_EVENT_TYPES.CARE_NOTE))
  assert.ok(timeline.some((e) => e.type === TIMELINE_EVENT_TYPES.FOLLOW_UP))
  assert.ok(timeline.some((e) => e.customerRequested))
  for (let i = 1; i < timeline.length; i += 1) {
    const prev = `${timeline[i - 1].date}T${timeline[i - 1].time || '00:00'}`
    const cur = `${timeline[i].date}T${timeline[i].time || '00:00'}`
    assert.ok(prev >= cur, 'timeline must be newest-first')
  }
}

{
  const customers = enrichCustomersForGrowth([
    {
      key: 'a',
      name: 'A',
      phone: '1',
      visitCount: 4,
      totalSpend: 5_000_000,
      totalTicketRevenue: 4_000_000,
      avgSpendPerVisit: 1_250_000,
      avgVisitsPerMonth: 0.5,
      daysSinceLastVisit: 100,
      segment: CUSTOMER_SEGMENTS.DORMANT,
      firstVisitDate: '2024-01-01',
      lastVisitDate: '2026-04-01',
      primaryBranchId: 'b1',
      primaryBranchName: 'Sóc Trăng',
      primaryEmployeeId: 'e1',
      primaryEmployeeName: 'Mai',
      latestEmployeeId: 'e1',
      invoices: [{ id: 'x1', date: '2026-04-01', services: [{ name: 'Nail', price: 300000 }], customerRequested: false }],
      employeeStats: [{ id: 'e1', name: 'Mai', count: 4 }],
      serviceStats: [{ id: 's1', name: 'Nail', count: 4, revenue: 1_200_000 }],
    },
    {
      key: 'b',
      name: 'B',
      phone: '2',
      visitCount: 6,
      totalSpend: 12_000_000,
      totalTicketRevenue: 10_000_000,
      avgSpendPerVisit: 2_000_000,
      avgVisitsPerMonth: 2.5,
      daysSinceLastVisit: 5,
      segment: CUSTOMER_SEGMENTS.VIP,
      firstVisitDate: '2026-07-10',
      lastVisitDate: '2026-07-16',
      primaryBranchId: 'b1',
      primaryBranchName: 'Sóc Trăng',
      primaryEmployeeId: 'e1',
      primaryEmployeeName: 'Mai',
      latestEmployeeId: 'e1',
      invoices: [
        { id: 'y1', date: '2026-07-10', customerRequested: true, services: [{ name: 'VIP', price: 2_000_000 }] },
        { id: 'y2', date: '2026-07-16', customerRequested: true, services: [{ name: 'VIP', price: 2_000_000 }] },
      ],
      employeeStats: [{ id: 'e1', name: 'Mai', count: 6 }],
      serviceStats: [{ id: 's2', name: 'VIP', count: 6, revenue: 10_000_000 }],
    },
    {
      key: 'c',
      name: 'C',
      phone: '3',
      visitCount: 3,
      totalSpend: 2_000_000,
      totalTicketRevenue: 1_800_000,
      avgSpendPerVisit: 666_000,
      avgVisitsPerMonth: 0.8,
      daysSinceLastVisit: 50,
      segment: CUSTOMER_SEGMENTS.AT_RISK,
      firstVisitDate: '2025-06-01',
      lastVisitDate: '2026-05-20',
      dateOfBirth: new Date().toISOString().slice(0, 10),
      primaryBranchId: 'b2',
      primaryBranchName: 'Bạc Liêu',
      primaryEmployeeId: 'e2',
      primaryEmployeeName: 'Hoa',
      latestEmployeeId: 'e2',
      invoices: [{ id: 'z1', date: '2026-05-20', services: [{ name: 'Gội', price: 200000 }], customerRequested: false }],
      employeeStats: [{ id: 'e2', name: 'Hoa', count: 3 }],
      serviceStats: [{ id: 's3', name: 'Gội', count: 3, revenue: 600000 }],
    },
    {
      key: 'd',
      name: 'D',
      phone: '4',
      visitCount: 2,
      totalSpend: 800_000,
      totalTicketRevenue: 700_000,
      avgSpendPerVisit: 400_000,
      avgVisitsPerMonth: 0.4,
      daysSinceLastVisit: 70,
      segment: CUSTOMER_SEGMENTS.AT_RISK,
      firstVisitDate: '2025-01-01',
      lastVisitDate: '2026-05-01',
      primaryBranchId: 'b2',
      primaryBranchName: 'Bạc Liêu',
      primaryEmployeeId: 'e2',
      primaryEmployeeName: 'Hoa',
      invoices: [{ id: 'w1', date: '2026-05-01', services: [{ name: 'Spa', price: 350000 }] }],
      employeeStats: [{ id: 'e2', name: 'Hoa', count: 2 }],
      serviceStats: [{ id: 's4', name: 'Spa', count: 2, revenue: 700000 }],
    },
  ])

  addCustomerCareLog({
    customerKey: 'a',
    careDate: '2026-07-01',
    followUpDate: '2020-01-01',
    caretaker: 'QL',
    content: 'Gọi lại',
  })

  const care = buildCareTodayList(customers, { today: '2026-07-21' })
  assert.ok(care.length >= 2)
  assert.ok(care.some((row) => row.key === 'a'))

  const retention = buildRetentionLists(customers)
  assert.ok(retention[RETENTION_BUCKETS.DAYS_90].some((r) => r.key === 'a'))
  assert.ok(retention[RETENTION_BUCKETS.DAYS_60].some((r) => r.key === 'd'))
  assert.ok(retention[RETENTION_BUCKETS.DAYS_45].some((r) => r.key === 'c'))
  const rowA = retention[RETENTION_BUCKETS.DAYS_90].find((r) => r.key === 'a')
  assert.ok(rowA.healthScore != null)
  assert.ok(rowA.primaryEmployeeName)
  assert.ok(rowA.lastServiceName)

  const metrics = buildCustomerGrowthMetrics(customers)
  assert.equal(metrics.totalCustomers, 4)
  assert.ok(metrics.returnRate > 0)
  assert.equal(metrics.vipCount, 1)
  assert.equal(metrics.dormantCount, 1)
  assert.ok(metrics.avgHealthScore >= 0)

  const ceo = buildCrmCeoInsights(customers, { today: '2026-07-21' })
  assert.ok(ceo.atRisk.length >= 1)
  assert.ok(ceo.vip.length >= 1)
  assert.ok(ceo.newVip.some((c) => c.key === 'b'))
  assert.ok(ceo.topSpenders[0].key === 'b')
  assert.ok(ceo.topReturners.length >= 1)
  assert.ok(Array.isArray(ceo.bestBranches))
}

console.log('verify:crm-growth PASS')
