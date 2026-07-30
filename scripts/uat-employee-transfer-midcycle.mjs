/**
 * UAT logic — Chuyển công tác giữa kỳ (không dùng Cherry/Trúc Ly).
 * Run: npx vite-node scripts/uat-employee-transfer-midcycle.mjs
 */
import assert from 'node:assert/strict'

const memoryStore = new Map()
globalThis.localStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, value) => { memoryStore.set(key, String(value)) },
  removeItem: (key) => { memoryStore.delete(key) },
  clear: () => { memoryStore.clear() },
}

const {
  buildWorkAssignmentHistoryRows,
  getEmployeeBranchAtDate,
  getEmployeeBranchSegments,
  validateProposedTransfer,
} = await import('../src/utils/employeeBranchTimeline.js')
const { computeEmployeePayrollRow } = await import('../src/utils/payrollEngine.js')

const UAT_ID = 'uat-transfer-midcycle-202608'
const UAT_NAME = 'UAT Cong Tac'

const employeeBefore = {
  id: UAT_ID,
  name: UAT_NAME,
  branchId: 'tram-spa',
  startDate: '2026-06-01',
  salaryRate: '0',
  branchHistory: [],
}

const employeeAfter = {
  ...employeeBefore,
  branchId: 'soc-trang',
  branchHistory: [{
    fromBranchId: 'tram-spa',
    toBranchId: 'soc-trang',
    effectiveDate: '2026-08-18',
    reason: 'UAT mid-cycle',
    note: 'Preview only',
    createdBy: 'Admin UAT',
    createdAt: '2026-08-18T10:00:00.000Z',
    changedAt: '2026-08-18T10:00:00.000Z',
  }],
}

// A. Timeline
assert.equal(getEmployeeBranchAtDate(employeeAfter, '2026-08-16'), 'tram-spa')
assert.equal(getEmployeeBranchAtDate(employeeAfter, '2026-08-17'), 'tram-spa')
assert.equal(getEmployeeBranchAtDate(employeeAfter, '2026-08-18'), 'soc-trang')
assert.equal(getEmployeeBranchAtDate(employeeAfter, '2026-08-20'), 'soc-trang')

const segments = getEmployeeBranchSegments(employeeAfter)
assert.equal(segments.length, 2)
assert.deepEqual(segments[0], { branchId: 'tram-spa', fromDate: '2026-06-01', toDate: '2026-08-17' })
assert.deepEqual(segments[1], { branchId: 'soc-trang', fromDate: '2026-08-18', toDate: null })

const rows = buildWorkAssignmentHistoryRows(employeeAfter, { getBranchName: (id) => id })
assert.equal(rows[0].status, 'current')
assert.equal(rows[0].branchId, 'soc-trang')
assert.equal(rows[1].status, 'ended')
assert.equal(rows[1].toDate, '2026-08-17')

// Validation
assert.equal(validateProposedTransfer(employeeBefore, 'tram-spa', '2026-08-18').ok, false)
assert.equal(validateProposedTransfer(employeeBefore, 'soc-trang', '2026-08-18').ok, true)
assert.ok(validateProposedTransfer(employeeBefore, 'soc-trang', '2026-07-01').warnings.length > 0)
assert.equal(validateProposedTransfer(employeeAfter, 'bac-lieu', '2026-08-10').ok, false)

// B. Payroll mid-cycle — same employeeId, two record branches
const invoices = [
  {
    id: 'inv-uat-1',
    date: '2026-08-16',
    branchId: 'tram-spa',
    employeeId: UAT_ID,
    tips: 100000,
    services: [{ price: 500000, commission: 50000 }],
  },
  {
    id: 'inv-uat-2',
    date: '2026-08-17',
    branchId: 'tram-spa',
    employeeId: UAT_ID,
    tips: 50000,
    services: [{ price: 300000, commission: 30000 }],
  },
  {
    id: 'inv-uat-3',
    date: '2026-08-18',
    branchId: 'soc-trang',
    employeeId: UAT_ID,
    tips: 80000,
    services: [{ price: 400000, commission: 40000 }],
  },
  {
    id: 'inv-uat-4',
    date: '2026-08-20',
    branchId: 'soc-trang',
    employeeId: UAT_ID,
    tips: 20000,
    services: [{ price: 200000, commission: 20000 }],
  },
]

const attendance = [
  { id: 'att-1', date: '2026-08-16', branchId: 'tram-spa', employeeId: UAT_ID, penaltyAmount: 0 },
  { id: 'att-2', date: '2026-08-17', branchId: 'tram-spa', employeeId: UAT_ID, penaltyAmount: 0 },
  { id: 'att-3', date: '2026-08-18', branchId: 'soc-trang', employeeId: UAT_ID, penaltyAmount: 0 },
  { id: 'att-4', date: '2026-08-20', branchId: 'soc-trang', employeeId: UAT_ID, penaltyAmount: 0 },
]

const row = computeEmployeePayrollRow(employeeAfter, invoices, attendance, [])
assert.equal(row.employeeId, UAT_ID)
assert.ok(Array.isArray(row.branchSections))
assert.equal(row.branchSections.length, 2)

const tram = row.branchSections.find((s) => s.branchId === 'tram-spa')
const soc = row.branchSections.find((s) => s.branchId === 'soc-trang')
assert.ok(tram)
assert.ok(soc)
assert.equal(tram.invoiceCount, 2)
assert.equal(soc.invoiceCount, 2)
assert.equal(tram.fromDate, '2026-08-16')
assert.equal(tram.toDate, '2026-08-17')
assert.equal(soc.fromDate, '2026-08-18')
assert.equal(soc.toDate, '2026-08-20')
assert.equal(row.tips, tram.tips + soc.tips)
assert.equal(row.commission, tram.commission + soc.commission)
assert.equal(row.ticketRevenue, tram.ticketRevenue + soc.ticketRevenue)

// C. Không đổi employeeId / không duplicate
assert.equal(employeeAfter.id, employeeBefore.id)
assert.equal(employeeAfter.name, UAT_NAME)

console.log(JSON.stringify({
  pass: true,
  employeeId: UAT_ID,
  segments,
  historyRows: rows.map((r) => ({
    fromDate: r.fromDate,
    toDate: r.toDate,
    branchId: r.branchId,
    status: r.statusLabel,
  })),
  payroll: {
    tips: row.tips,
    commission: row.commission,
    ticketRevenue: row.ticketRevenue,
    sections: row.branchSections.map((s) => ({
      branchId: s.branchId,
      fromDate: s.fromDate,
      toDate: s.toDate,
      invoiceCount: s.invoiceCount,
      tips: s.tips,
      commission: s.commission,
    })),
  },
}, null, 2))
console.log('PASS — UAT mid-cycle transfer logic')
