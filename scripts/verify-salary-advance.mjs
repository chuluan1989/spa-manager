/**
 * Verify Salary Advance integration (expense ↔ payroll, no double-count).
 * Run: npm run verify:salary-advance
 */

import './_polyfill-storage.mjs'
import assert from 'node:assert/strict'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../src/constants/salaryAdvanceTypes.js'
import { PAY_CYCLES, getPayPeriodRange } from '../src/utils/salaryReport.js'
import {
  resolvePayrollPeriodFromAdvanceDate,
  resolveAdvanceTargetWithLock,
  getNextPayPeriod,
} from '../src/utils/salaryAdvance/salaryAdvancePeriod.js'
import {
  isSalaryAdvanceExpense,
  computeGrossBeforeDeduction,
} from '../src/utils/salaryAdvance/salaryAdvanceService.js'
import {
  filterVariableExpenses,
  isSalaryAdvanceExpenseRecord,
} from '../src/utils/branchProfitBreakdown.js'
import { computeNetSalary } from '../src/utils/payrollEngine.js'

{
  const p1 = resolvePayrollPeriodFromAdvanceDate('2026-07-10')
  assert.equal(p1.cycle, PAY_CYCLES.PERIOD_1)
  assert.equal(p1.month, '2026-07')
  const range1 = getPayPeriodRange('2026-07', PAY_CYCLES.PERIOD_1)
  assert.equal(p1.fromDate, range1.fromDate)

  const p2 = resolvePayrollPeriodFromAdvanceDate('2026-07-22')
  assert.equal(p2.cycle, PAY_CYCLES.PERIOD_2)
  assert.equal(p2.month, '2026-07')

  const next = getNextPayPeriod('2026-07', PAY_CYCLES.PERIOD_1)
  assert.equal(next.cycle, PAY_CYCLES.PERIOD_2)
  assert.equal(next.month, '2026-07')
}

{
  const locks = [{ month: '2026-07', branchId: 'soc-trang', isLocked: true }]
  const blocked = resolveAdvanceTargetWithLock('2026-07-10', 'soc-trang', locks)
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.locked, true)

  const shifted = resolveAdvanceTargetWithLock('2026-07-10', 'soc-trang', locks, { forceNextPeriod: true })
  assert.equal(shifted.blocked, false)
  assert.ok(shifted.shifted)
}

{
  const parts = {
    baseSalary: 3_000_000,
    commission: 1_000_000,
    tips: 200_000,
    bonus: 100_000,
    reduction: 0,
    penalty: 50_000,
    advance: 500_000,
    otherAdjustment: 20_000,
  }
  const gross = computeGrossBeforeDeduction(parts)
  assert.equal(gross, 4_250_000)
  assert.equal(computeNetSalary(parts), gross - parts.advance + parts.otherAdjustment)
}

{
  const expenses = [
    { expenseType: SALARY_ADVANCE_EXPENSE_TYPE, amount: 500_000, payrollAdjustmentId: 'adj1' },
    { expenseType: 'dien', amount: 100_000 },
    { expenseType: 'mat-bang', amount: 10_000_000 },
  ]
  const profitExpenses = filterVariableExpenses(expenses)
  assert.equal(profitExpenses.length, 1)
  assert.equal(profitExpenses[0].expenseType, 'dien')
  assert.equal(isSalaryAdvanceExpenseRecord(expenses[0]), true)
  assert.equal(isSalaryAdvanceExpense(expenses[0]), true)
}

console.log('verify:salary-advance PASS')
