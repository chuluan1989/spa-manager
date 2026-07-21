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
} from '../src/utils/crmGrowth/buildCustomerGrowth.js'
import { GROWTH_THRESHOLDS } from '../src/utils/crmGrowth/crmGrowthConstants.js'
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
}

{
  const profile = enrichCustomerGrowthProfile({
    key: 'phone:0901',
    name: 'Lan',
    phone: '0901',
    visitCount: 3,
    totalSpend: 3_000_000,
    totalTicketRevenue: 2_500_000,
    daysSinceLastVisit: 100,
    segment: CUSTOMER_SEGMENTS.DORMANT,
    dateOfBirth: '1990-07-15',
    invoices: [
      { date: '2025-01-01' },
      { date: '2025-02-01' },
      { date: '2025-03-10' },
    ],
    employeeStats: [{ id: 'e1', name: 'Mai Nhi', count: 2 }],
    serviceStats: [{ id: 's1', name: 'Gội đầu', count: 3 }],
    latestEmployeeId: 'e1',
    latestEmployeeName: 'Mai Nhi',
  })
  assert.equal(computeCustomerLtv(profile), 3_000_000)
  assert.equal(profile.ltv, 3_000_000)
  assert.ok(computeAvgReturnCycleDays(profile) > 0)
  assert.equal(profile.primaryEmployeeName, 'Mai Nhi')
  assert.equal(profile.favoriteServiceName, 'Gội đầu')
}

{
  const customers = [
    enrichCustomerGrowthProfile({
      key: 'a',
      name: 'A',
      phone: '1',
      visitCount: 4,
      totalSpend: 5_000_000,
      totalTicketRevenue: 4_000_000,
      daysSinceLastVisit: 100,
      segment: CUSTOMER_SEGMENTS.DORMANT,
      primaryBranchId: 'b1',
      primaryBranchName: 'Sóc Trăng',
      primaryEmployeeId: 'e1',
      primaryEmployeeName: 'Mai',
      latestEmployeeId: 'e1',
      invoices: [],
      employeeStats: [],
      serviceStats: [],
    }),
    enrichCustomerGrowthProfile({
      key: 'b',
      name: 'B',
      phone: '2',
      visitCount: 6,
      totalSpend: 12_000_000,
      totalTicketRevenue: 10_000_000,
      daysSinceLastVisit: 5,
      segment: CUSTOMER_SEGMENTS.VIP,
      primaryBranchId: 'b1',
      primaryBranchName: 'Sóc Trăng',
      primaryEmployeeId: 'e1',
      primaryEmployeeName: 'Mai',
      latestEmployeeId: 'e1',
      invoices: [],
      employeeStats: [],
      serviceStats: [],
    }),
    enrichCustomerGrowthProfile({
      key: 'c',
      name: 'C',
      phone: '3',
      visitCount: 3,
      totalSpend: 2_000_000,
      totalTicketRevenue: 1_800_000,
      daysSinceLastVisit: 50,
      segment: CUSTOMER_SEGMENTS.AT_RISK,
      dateOfBirth: new Date().toISOString().slice(0, 10),
      primaryBranchId: 'b2',
      primaryBranchName: 'Bạc Liêu',
      primaryEmployeeId: 'e2',
      primaryEmployeeName: 'Hoa',
      latestEmployeeId: 'e2',
      invoices: [],
      employeeStats: [],
      serviceStats: [],
    }),
  ]

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
  assert.ok(care.some((row) => row.reasons.includes('birthday') || row.key === 'c'))

  const metrics = buildCustomerGrowthMetrics(customers)
  assert.equal(metrics.totalCustomers, 3)
  assert.ok(metrics.returnRate > 0)
  assert.equal(metrics.vipCount, 1)
  assert.equal(metrics.dormantCount, 1)
  assert.ok(metrics.bySegment[CUSTOMER_SEGMENTS.VIP].revenue >= 10_000_000)

  const ceo = buildCrmCeoInsights(customers)
  assert.ok(ceo.atRisk.length >= 1)
  assert.ok(ceo.vip.length >= 1)
}

console.log('verify:crm-growth PASS')
