/**
 * Verify employee self-attendance edit-request flow (no schema change).
 * Run: npx vite-node scripts/verify-attendance-edit-requests.mjs
 */
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'

function createStorage() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

const {
  upsertAttendanceEditRequest,
  loadAttendanceEditRequestsLocal,
  listPendingRequestsForBranch,
  listUnseenReviewResults,
  ATTENDANCE_EDIT_REQUEST_STATUS,
  normalizeAttendanceEditRequest,
} = await import('../src/utils/attendanceEditRequestStorage.js')

// Seed request history — never deleted
await upsertAttendanceEditRequest({
  id: 'aer-1',
  type: 'update',
  attendanceId: 'att-1',
  employeeId: 'emp-1',
  employeeName: 'NV A',
  branchId: 'soc-trang',
  date: '2026-07-18',
  oldStatus: 'on_time',
  oldReason: '',
  oldNote: '',
  newStatus: 'late_2h_unpermitted',
  newReason: 'Kẹt xe',
  newNote: '',
  status: ATTENDANCE_EDIT_REQUEST_STATUS.PENDING,
  requestedAt: '2026-07-18T01:00:00.000Z',
  requestedBy: 'emp-1',
  requestedByName: 'NV A',
  employeeNotified: false,
})

await upsertAttendanceEditRequest({
  id: 'aer-2',
  type: 'update',
  attendanceId: 'att-2',
  employeeId: 'emp-2',
  employeeName: 'NV B',
  branchId: 'phu-loi',
  date: '2026-07-18',
  oldStatus: 'on_time',
  newStatus: 'early_2h_unpermitted',
  newReason: 'Việc gia đình',
  status: ATTENDANCE_EDIT_REQUEST_STATUS.PENDING,
  requestedAt: '2026-07-18T02:00:00.000Z',
  requestedBy: 'emp-2',
  requestedByName: 'NV B',
  employeeNotified: false,
})

let all = loadAttendanceEditRequestsLocal()
assert.equal(all.length, 2, 'history keeps both requests')

const branchPending = listPendingRequestsForBranch(all, 'soc-trang')
assert.equal(branchPending.length, 1, 'manager only sees own branch pending')
assert.equal(branchPending[0].employeeId, 'emp-1')

const allPending = listPendingRequestsForBranch(all, '', { allBranches: true })
assert.equal(allPending.length, 2, 'admin sees all pending')

// Approve path updates status but keeps record (history)
await upsertAttendanceEditRequest({
  ...all.find((item) => item.id === 'aer-1'),
  status: ATTENDANCE_EDIT_REQUEST_STATUS.APPROVED,
  reviewedAt: '2026-07-18T03:00:00.000Z',
  reviewedBy: 'manager',
  reviewedByName: 'QL CN1',
  employeeNotified: false,
})

all = loadAttendanceEditRequestsLocal()
assert.equal(all.length, 2, 'approved request still in history')
assert.equal(all.find((item) => item.id === 'aer-1').status, 'approved')
assert.equal(all.find((item) => item.id === 'aer-1').oldStatus, 'on_time')
assert.equal(all.find((item) => item.id === 'aer-1').newStatus, 'late_2h_unpermitted')

const unseen = listUnseenReviewResults(all, 'emp-1')
assert.equal(unseen.length, 1, 'employee sees approve notice')
assert.equal(unseen[0].status, 'approved')

const normalized = normalizeAttendanceEditRequest({
  id: 'x',
  type: 'create',
  employeeId: 'emp-1',
  branchId: 'soc-trang',
  date: '2026-07-19',
  newStatus: 'on_time',
  status: 'pending',
})
assert.equal(normalized.type, 'create')

// Ownership helpers in service module (session gated)
sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'employee',
  branch: 'soc-trang',
  employeeId: 'emp-1',
  employeeName: 'NV A',
}))

localStorage.setItem('spa-manager-employees', JSON.stringify([
  {
    id: 'emp-1',
    name: 'NV A',
    branchId: 'soc-trang',
    status: 'active',
    phone: '0901234567',
    cccd: '001234567890',
  },
]))

const { submitAttendanceEditRequest } = await import('../src/utils/attendanceEditRequestService.js')

let blocked = false
try {
  await submitAttendanceEditRequest({
    record: {
      id: 'att-other',
      employeeId: 'emp-2',
      branchId: 'soc-trang',
      date: '2026-07-18',
      status: 'on_time',
      reason: '',
      note: '',
    },
    newStatus: 'late_2h_unpermitted',
    newReason: 'hack',
  })
} catch (error) {
  blocked = /người khác|chính mình/i.test(error?.message ?? '')
}
assert.equal(blocked, true, 'employee cannot edit another employee record')

console.log('PASS — attendance edit request storage/history/ownership')
