/**
 * UAT — Penalty SoT (attendance + manual), block mirror, P&L parity.
 * Run: node_modules/.bin/vite-node scripts/verify-penalty-sot-uat.mjs
 */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import './_polyfill-storage.mjs'
import { computeEmployeePayrollRow } from '../src/utils/payrollEngine.js'
import { buildPenaltyPnlItems } from '../src/utils/managementReports/branchEfficiencyPnl.js'
import {
  assertManualPenaltyNotAttendanceMirror,
  ATTENDANCE_PENALTY_READONLY_HINT,
  looksLikeAttendanceMirrorPenalty,
} from '../src/utils/payrollPenaltyPolicy.js'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { readFileSync } from 'node:fs'

const results = []
function check(id, fn) {
  try {
    fn()
    results.push({ id, pass: true })
    console.log('PASS', id)
  } catch (err) {
    results.push({ id, pass: false, error: err.message })
    console.log('FAIL', id, err.message)
  }
}

const employee = { id: 'e1', name: 'Test', branchId: 'bac-lieu', salaryRate: 0 }

check('U1_att_100k', () => {
  const row = computeEmployeePayrollRow(
    employee,
    [],
    [{ employeeId: 'e1', date: '2026-08-07', penaltyAmount: 100000, status: 'full_day_unpermitted' }],
    [],
  )
  assert.equal(row.attendancePenalty, 100000)
  assert.equal(row.manualPenalty, 0)
  assert.equal(row.penalty, 100000)
})

check('U2_block_mirror_text', () => {
  const gate = assertManualPenaltyNotAttendanceMirror({
    type: 'penalty',
    reason: 'Phạt nghỉ không phép',
    note: '',
  })
  assert.equal(gate.blocked, true)
})

check('U2b_block_off_qua_phep', () => {
  assert.equal(
    looksLikeAttendanceMirrorPenalty({
      type: 'penalty',
      reason: 'Phạt quá phép',
      note: 'Phạt off quá phép',
    }),
    true,
  )
})

check('U3_att_100_plus_manual_500', () => {
  const row = computeEmployeePayrollRow(
    employee,
    [],
    [{ employeeId: 'e1', date: '2026-08-07', penaltyAmount: 100000 }],
    [{
      employeeId: 'e1',
      type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
      amount: 500000,
      date: '2026-08-12',
      month: '2026-08',
      reason: 'Phạt lúc làm khách',
    }],
  )
  assert.equal(row.penalty, 600000)
})

check('U4_att_to_zero_manual_kept', () => {
  const before = computeEmployeePayrollRow(
    employee,
    [],
    [{ employeeId: 'e1', date: '2026-08-07', penaltyAmount: 100000 }],
    [{ employeeId: 'e1', type: 'penalty', amount: 500000, date: '2026-08-12', month: '2026-08' }],
  )
  const after = computeEmployeePayrollRow(
    employee,
    [],
    [{ employeeId: 'e1', date: '2026-08-07', penaltyAmount: 0, status: 'full_day_permitted' }],
    [{ employeeId: 'e1', type: 'penalty', amount: 500000, date: '2026-08-12', month: '2026-08' }],
  )
  assert.equal(before.penalty, 600000)
  assert.equal(after.attendancePenalty, 0)
  assert.equal(after.manualPenalty, 500000)
  assert.equal(after.penalty, 500000)
})

check('U5_manual_only_500', () => {
  const row = computeEmployeePayrollRow(
    employee,
    [],
    [],
    [{ employeeId: 'e1', type: 'penalty', amount: 500000, date: '2026-08-12', month: '2026-08' }],
  )
  assert.equal(row.penalty, 500000)
})

check('U6_pnl_equals_payroll_no_blind_dedupe', () => {
  const attendance = [
    { employeeId: 'e1', date: '2026-08-07', penaltyAmount: 100000, branchId: 'bac-lieu' },
  ]
  const adjustments = [
    {
      employeeId: 'e1',
      type: 'penalty',
      amount: 100000,
      date: '2026-08-07',
      month: '2026-08',
      branchId: 'bac-lieu',
      reason: 'mirror',
    },
  ]
  const payroll = computeEmployeePayrollRow(employee, [], attendance, adjustments)
  const pnl = buildPenaltyPnlItems({
    attendanceRecords: attendance,
    adjustments,
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
  })
  assert.equal(payroll.penalty, 200000)
  assert.equal(pnl.total, 200000)
  assert.equal(pnl.items.length, 2)
  assert.ok(pnl.duplicateWarnings.length >= 1)
})

check('U7_ui_hint_present', () => {
  const board = readFileSync('src/components/salary/PayrollEditBoardModal.jsx', 'utf8')
  assert.ok(board.includes('Phạt chấm công'))
  assert.ok(board.includes('ATTENDANCE_PENALTY_READONLY_HINT') || board.includes(ATTENDANCE_PENALTY_READONLY_HINT.slice(0, 20)))
  assert.ok(board.includes('manualPenalty'))
})

check('U8_allow_service_penalty', () => {
  const gate = assertManualPenaltyNotAttendanceMirror({
    type: 'penalty',
    reason: 'Phạt lúc làm khách',
    note: '12/8',
    category: 'service',
  })
  assert.equal(gate.blocked, false)
})

check('U9_migration_file', () => {
  const sql = readFileSync('supabase/migrations/0047_payroll_adjustment_penalty_source.sql', 'utf8')
  assert.ok(sql.includes('add column if not exists source'))
  assert.ok(sql.includes('add column if not exists category'))
})

const failed = results.filter((r) => !r.pass).length
const out = {
  at: new Date().toISOString(),
  passed: failed === 0,
  failed,
  total: results.length,
  results,
  note: 'Engine/UI policy UAT. Void Production + Final gate: docs/uat-evidence/PENALTY_SOT_FINAL_GATE.json',
}
writeFileSync('docs/uat-evidence/PENALTY_SOT_UAT.json', JSON.stringify(out, null, 2))
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${results.length - failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
