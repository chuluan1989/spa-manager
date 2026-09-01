/**
 * UAT — Ứng lương / Phạt khác: cộng từng phát sinh, không SET tổng.
 * Không ghi DB. Không dùng localStorage làm SoT.
 *
 *   node_modules/.bin/vite-node scripts/verify-payroll-board-line-items-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { computeEmployeePayrollRow } from '../src/utils/payrollEngine.js'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { objectToSnakeRow } from '../src/repositories/caseUtils.js'
import { sanitizePayrollAdjustmentRecord } from '../src/repositories/payrollRepository.js'
import {
  applyPayrollLineOperations,
  formatPayrollLineDate,
  isVoidedPayrollAdjustment,
  listPeriodAdjustments,
  sumAdjustmentAmounts,
} from '../src/utils/payrollBoardLines.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
mkdirSync(OUT_DIR, { recursive: true })

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
const period = { employeeId: 'e1', fromDate: '2026-08-01', toDate: '2026-08-15' }

function row(type, id, date, amount, extra = {}) {
  return {
    id,
    employeeId: 'e1',
    type,
    date,
    month: '2026-08',
    amount,
    reason: extra.reason || '',
    createdByName: extra.createdByName || 'Admin',
    createdAt: extra.createdAt || `${date}T00:00:00.000Z`,
  }
}

check('UAT_2_advances_sum', () => {
  const lines = [
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'a2', '2026-08-12', 2_000_000),
  ]
  const payroll = computeEmployeePayrollRow(employee, [], [], lines)
  assert.equal(sumAdjustmentAmounts(lines), 3_000_000)
  assert.equal(payroll.advance, 3_000_000)
})

check('UAT_add_advance_keeps_existing', () => {
  const existing = [
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'a2', '2026-08-12', 2_000_000),
  ]
  const after = applyPayrollLineOperations(existing, [{
    action: 'add',
    record: row('advance', 'a3', '2026-08-15', 5_000_000),
  }])
  assert.equal(sumAdjustmentAmounts(after), 8_000_000)
  assert.equal(after.length, 3)
  const payroll = computeEmployeePayrollRow(employee, [], [], after)
  assert.equal(payroll.advance, 8_000_000)
  assert.notEqual(payroll.advance, 5_000_000)
})

check('UAT_3_advances_sum', () => {
  const lines = [
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'a2', '2026-08-12', 2_000_000),
    row('advance', 'a3', '2026-08-15', 500_000),
  ]
  assert.equal(computeEmployeePayrollRow(employee, [], [], lines).advance, 3_500_000)
})

check('UAT_multiple_penalties_sum', () => {
  const lines = [
    row('penalty', 'p1', '2026-08-06', 100_000, { reason: 'Phạt lúc làm khách' }),
    row('penalty', 'p2', '2026-08-12', 500_000, { reason: 'Phạt thái độ' }),
  ]
  const payroll = computeEmployeePayrollRow(employee, [], [], lines)
  assert.equal(payroll.manualPenalty, 600_000)
  assert.equal(payroll.penalty, 600_000)
  assert.equal(payroll.attendancePenalty, 0)
})

check('UAT_edit_one_line_updates_total', () => {
  const existing = [
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'a2', '2026-08-12', 2_000_000),
  ]
  const after = applyPayrollLineOperations(existing, [{
    action: 'edit',
    id: 'a1',
    updates: { amount: 1_500_000 },
  }])
  assert.equal(sumAdjustmentAmounts(after), 3_500_000)
  assert.equal(after.find((r) => r.id === 'a2').amount, 2_000_000)
})

check('UAT_void_one_line_decreases_total', () => {
  const existing = [
    row('penalty', 'p1', '2026-08-06', 100_000),
    row('penalty', 'p2', '2026-08-12', 500_000),
  ]
  const after = applyPayrollLineOperations(existing, [{ action: 'void', id: 'p1' }])
  assert.equal(sumAdjustmentAmounts(after), 500_000)
  assert.equal(after.length, 2)
  assert.equal(isVoidedPayrollAdjustment(after.find((r) => r.id === 'p1')), true)
  assert.equal(computeEmployeePayrollRow(employee, [], [], after).manualPenalty, 500_000)
})

check('UAT_delete_does_not_duplicate', () => {
  const existing = [
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'a2', '2026-08-12', 2_000_000),
  ]
  const after = applyPayrollLineOperations(existing, [{ action: 'delete', id: 'a1' }])
  assert.equal(after.length, 1)
  assert.equal(sumAdjustmentAmounts(after), 2_000_000)
})

check('UAT_attendance_penalty_not_mixed', () => {
  const attendance = [{ employeeId: 'e1', date: '2026-08-07', penaltyAmount: 200_000 }]
  const manual = [row('penalty', 'p1', '2026-08-12', 500_000, { reason: 'Phạt lúc làm khách' })]
  const payroll = computeEmployeePayrollRow(employee, [], attendance, manual)
  assert.equal(payroll.attendancePenalty, 200_000)
  assert.equal(payroll.manualPenalty, 500_000)
  assert.equal(payroll.penalty, 700_000)
})

check('UAT_period_list_date_format', () => {
  const lines = [
    row('advance', 'a2', '2026-08-12', 2_000_000),
    row('advance', 'a1', '2026-08-05', 1_000_000),
    row('advance', 'out', '2026-08-20', 9_000_000),
  ]
  const listed = listPeriodAdjustments(lines, { ...period, type: 'advance' })
  assert.equal(listed.map((r) => r.id).join(','), 'a1,a2')
  assert.equal(formatPayrollLineDate(listed[0].date), '05/08')
  assert.equal(formatPayrollLineDate(listed[1].date), '12/08')
})

check('UAT_no_allow_signed_penalty_in_db_row', () => {
  const snake = objectToSnakeRow(sanitizePayrollAdjustmentRecord({
    id: 'payadj-1',
    date: '2026-08-05',
    month: '2026-08',
    type: PAYROLL_ADJUSTMENT_TYPES.PENALTY,
    amount: 0,
    reason: 'void',
    allowSignedPenalty: true,
    foo: 'nope',
  }))
  assert.equal('allow_signed_penalty' in snake, false)
  assert.equal('allowSignedPenalty' in snake, false)
  assert.equal(snake.amount, 0)
  assert.equal(snake.type, 'penalty')
  const leaked = objectToSnakeRow({
    id: 'payadj-1',
    type: 'penalty',
    amount: 1,
    allowSignedPenalty: true,
  })
  const sanitized = objectToSnakeRow(sanitizePayrollAdjustmentRecord({
    id: 'payadj-1',
    type: 'penalty',
    amount: 1,
    allowSignedPenalty: true,
  }))
  assert.equal('allow_signed_penalty' in leaked, true)
  assert.equal('allow_signed_penalty' in sanitized, false)
})

check('UAT_service_does_not_set_advance_penalty_totals', () => {
  const service = readFileSync(path.join(ROOT, 'src/utils/payrollService.js'), 'utf8')
  assert.ok(service.includes('ignored_line_item_type'))
  assert.ok(service.includes('addPayrollBoardLine'))
  assert.ok(service.includes('voidPayrollBoardLine'))
  assert.equal(service.includes('allowSignedPenalty: type === PAYROLL_ADJUSTMENT_TYPES.PENALTY'), false)
})

check('UAT_modal_has_add_buttons_not_set_inputs', () => {
  const modal = readFileSync(path.join(ROOT, 'src/components/salary/PayrollEditBoardModal.jsx'), 'utf8')
  const section = readFileSync(path.join(ROOT, 'src/components/salary/PayrollBoardLineSection.jsx'), 'utf8')
  assert.ok(modal.includes('+ Thêm ứng lương'))
  assert.ok(modal.includes('+ Thêm phạt'))
  assert.ok(section.includes('Hủy khoản'))
  assert.ok(modal.includes('SET_FIELDS'))
  assert.ok(!modal.includes('edit-input-penalty'))
  assert.ok(!modal.includes('edit-input-advance'))
})

const failed = results.filter((r) => !r.pass).length
const out = {
  at: new Date().toISOString(),
  passed: failed === 0,
  failed,
  total: results.length,
  results,
  note: 'Offline line-item SoT. Không ghi Production. Không commit/deploy khi FAIL.',
}
writeFileSync(path.join(OUT_DIR, 'PAYROLL_BOARD_LINE_ITEMS_UAT.json'), JSON.stringify(out, null, 2))
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} ${results.length - failed}/${results.length}`)
process.exit(failed === 0 ? 0 : 1)
