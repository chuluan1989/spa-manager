/**
 * Verify Business Copilot V1 rules + nav (no ops-center menu).
 * Run: npm run verify:business-copilot
 */

import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

function createStorage() {
  const store = new Map()
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null },
    setItem(key, value) { store.set(key, String(value)) },
    removeItem(key) { store.delete(key) },
    clear() { store.clear() },
    get length() { return store.size },
    key(index) { return [...store.keys()][index] ?? null },
  }
}

globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function setUser(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

const { ADMIN_NAV_ORDER, BRANCH_MANAGER_NAV_ORDER, EMPLOYEE_NAV_ORDER, NAV_ITEMS } = await import('../src/constants/navigation.js')
const { canAccessOpsCenter } = await import('../src/utils/opsCenter/opsCenterAccess.js')
const { subscribeAttendanceChanges, getAttendanceTableName } = await import('../src/repositories/attendanceRepository.js')
const { buildCopilotAlerts } = await import('../src/utils/copilot/buildCopilotAlerts.js')
const { buildCopilotOpportunities } = await import('../src/utils/copilot/buildCopilotOpportunities.js')
const { buildCopilotBrief } = await import('../src/utils/copilot/buildCopilotBrief.js')
const { buildCopilotPerformance } = await import('../src/utils/copilot/buildCopilotPerformance.js')
const { computeTrend, getPreviousPeriod, shiftDate } = await import('../src/utils/copilot/copilotTrends.js')
const { COPILOT_DROP_PERCENT, COPILOT_GROW_PERCENT } = await import('../src/utils/copilot/copilotConstants.js')

assert.equal(canAccessOpsCenter(), false, 'ops-center must stay inaccessible')
assert.equal(typeof subscribeAttendanceChanges, 'function', 'attendance realtime subscriber must exist')
assert.equal(getAttendanceTableName(), 'attendance')
assert.ok(!NAV_ITEMS.some((item) => item.id === 'ops-center'), 'NAV_ITEMS must not include ops-center')
assert.ok(!ADMIN_NAV_ORDER.includes('ops-center'), 'Admin nav must not include Điều hành')
assert.ok(!BRANCH_MANAGER_NAV_ORDER.includes('ops-center'))
assert.ok(!EMPLOYEE_NAV_ORDER.includes('ops-center'))
assert.ok(ADMIN_NAV_ORDER.includes('dashboard'))
assert.equal(NAV_ITEMS.find((i) => i.id === 'dashboard')?.label, 'Tổng quan')

const today = '2026-07-20'
const yesterday = shiftDate(today, -1)
assert.equal(yesterday, '2026-07-19')
assert.deepEqual(getPreviousPeriod(today, today), { fromDate: yesterday, toDate: yesterday })

const down = computeTrend(80, 100)
assert.equal(down.direction, 'down')
assert.equal(down.percent, 20)
assert.ok(down.percent >= COPILOT_DROP_PERCENT)

const up = computeTrend(120, 100)
assert.equal(up.direction, 'up')
assert.ok(up.percent >= COPILOT_GROW_PERCENT)

// Seed minimal branch + empty employee stores via defaults
const invoices = [
  {
    id: 'i1',
    date: yesterday,
    branchId: 'tra-vinh',
    branchName: 'Trà Vinh Khoẻ Spa',
    employeeId: 'e1',
    employeeName: 'Lan',
    tips: 100000,
    serviceTotal: 500000,
    total: 600000,
    commission: 50000,
    invoiceTime: '15:00',
    services: [{ id: 's1', name: 'Massage', price: 500000, commissionAmount: 50000 }],
  },
  {
    id: 'i2',
    date: today,
    branchId: 'tra-vinh',
    branchName: 'Trà Vinh Khoẻ Spa',
    employeeId: 'e1',
    employeeName: 'Lan',
    tips: 20000,
    serviceTotal: 200000,
    total: 220000,
    commission: 20000,
    invoiceTime: '10:00',
    services: [{ id: 's1', name: 'Massage', price: 200000, commissionAmount: 20000 }],
  },
  {
    id: 'i3',
    date: today,
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    employeeId: 'e2',
    employeeName: 'Mai',
    tips: 80000,
    serviceTotal: 700000,
    total: 780000,
    commission: 70000,
    invoiceTime: '18:30',
    services: [
      { id: 's1', name: 'Massage', price: 400000, commissionAmount: 40000 },
      { id: 's2', name: 'Facial', price: 300000, commissionAmount: 30000 },
    ],
  },
  {
    id: 'i4',
    date: yesterday,
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    employeeId: 'e2',
    employeeName: 'Mai',
    tips: 40000,
    serviceTotal: 400000,
    total: 440000,
    commission: 40000,
    invoiceTime: '17:00',
    services: [{ id: 's2', name: 'Facial', price: 400000, commissionAmount: 40000 }],
  },
]

const afterSilent = new Date(2026, 6, 20, 15, 0, 0)
const alerts = buildCopilotAlerts({
  today,
  invoices,
  expenses: [],
  fixedCosts: [],
  attendanceToday: [],
  pendingEditCount: 2,
  payrollMonthLocked: true,
  lockedMonthLabel: '2026-07',
  kl1Incomplete: 3,
  scopeBranchId: '',
  now: afterSilent,
})

assert.ok(alerts.some((a) => a.type === 'BRANCH_SILENT'), 'silent branch after 14:00')
assert.ok(alerts.some((a) => a.type === 'BRANCH_REV_DROP'), 'branch revenue drop')
assert.ok(alerts.some((a) => a.type === 'SYS_TIPS_DROP' || a.type === 'ATT_EDIT_PENDING'))
assert.ok(alerts.some((a) => a.type === 'ATT_EDIT_PENDING'))
assert.ok(alerts.some((a) => a.type === 'PAY_LOCK'))
assert.ok(alerts.some((a) => a.type === 'KL1_INCOMPLETE'))
assert.ok(alerts.every((a) => a.cta?.pageId), 'every alert has CTA page')
assert.ok(alerts.every((a) => Array.isArray(a.actionSteps) && a.actionSteps.length > 0))

const opps = buildCopilotOpportunities({
  today,
  invoices,
  crmInvoices: [
    ...invoices,
    {
      id: 'old',
      date: '2026-03-01',
      branchId: 'soc-trang',
      customerName: 'A',
      customerPhone: '0901111222',
      serviceTotal: 100000,
      tips: 0,
      total: 100000,
      services: [{ id: 's1', name: 'Massage', price: 100000 }],
    },
    {
      id: 'old2',
      date: '2026-04-01',
      branchId: 'soc-trang',
      customerName: 'A',
      customerPhone: '0901111222',
      serviceTotal: 100000,
      tips: 0,
      total: 100000,
      services: [{ id: 's1', name: 'Massage', price: 100000 }],
    },
  ],
  scopeBranchId: '',
})

assert.ok(opps.some((o) => o.type === 'BRANCH_GROW'), 'branch growth opportunity')
assert.ok(opps.every((o) => o.cta?.pageId), 'every opportunity has CTA')

const brief = buildCopilotBrief(alerts, opps)
assert.ok(brief.firstTask?.text, 'brief task when alerts exist')
assert.ok(brief.firstOpportunity?.text, 'brief opportunity when opps exist')

const performance = buildCopilotPerformance({
  today,
  invoices,
  expenses: [],
  fixedCosts: [],
  scopeBranchId: '',
})
assert.equal(typeof performance.ticketRevenueToday, 'number')
assert.equal(typeof performance.profitMonth, 'number')
assert.ok(Array.isArray(performance.topBranches))
assert.ok(Array.isArray(performance.topEmployees))
assert.ok(Array.isArray(performance.topServices))

setUser({ role: 'admin', branch: 'all' })
const { getVisibleNavItems } = await import('../src/constants/auth.js')
const adminNav = getVisibleNavItems()
assert.ok(!adminNav.some((i) => i.id === 'ops-center' || i.label === 'Điều hành'))
assert.ok(adminNav.some((i) => i.id === 'dashboard' && i.label === 'Tổng quan'))

console.log('PASS — verify:business-copilot')
console.log('  ✓ ops-center hidden')
console.log('  ✓ attendance realtime via subscribeAttendanceChanges (postgres_changes)')
console.log('  ✓ alerts + opportunities rule engine')
console.log('  ✓ brief + performance builders')
console.log('  ✓ Admin nav has Tổng quan only (no Điều hành)')
