/**
 * Logic UAT — Admin payroll board SET totals (không cộng dồn dòng).
 * Run: node scripts/uat-admin-payroll-board.mjs
 */
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../src/constants/payrollTypes.js'
import {
  buildPayrollFieldAuditValues,
  netSalaryImpactForFieldSet,
} from '../src/utils/payrollFieldAudit.js'

let failed = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

function computeNetSalary(parts) {
  return (
    (parts.tips ?? 0)
    + (parts.commission ?? 0)
    + (parts.bonus ?? 0)
    + (parts.kpi ?? 0)
    + (parts.otherAdjustment ?? 0)
    - (parts.penalty ?? 0)
    - (parts.advance ?? 0)
    + (parts.baseSalary ?? 0)
    - (parts.reduction ?? 0)
  )
}

check(ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(PAYROLL_ADJUSTMENT_TYPES.KPI), 'KPI hạng mục Admin')
check(normalizePayrollAdjustmentAmount(PAYROLL_ADJUSTMENT_TYPES.KPI, -200000) === -200000, 'KPI âm')
check(normalizePayrollAdjustmentAmount(PAYROLL_ADJUSTMENT_TYPES.PENALTY, -200000) === 200000, 'Phạt luôn dương')

const base = {
  baseSalary: 0,
  tips: 1_000_000,
  commission: 100_000,
  bonus: 0,
  kpi: 0,
  otherAdjustment: 0,
  penalty: 600_000,
  advance: 0,
  reduction: 0,
}
const baseNet = computeNetSalary(base)

// Test 1: Phạt 600k → 200k → net +400k
const t1 = computeNetSalary({ ...base, penalty: 200_000 })
check(t1 - baseNet === 400_000, 'Test1 Phạt 600→200 net +400k', String(t1 - baseNet))
check(netSalaryImpactForFieldSet('penalty', 600_000, 200_000) === 400_000, 'Impact phạt +400k')

// Test 2: Thưởng 0 → 500k
const t2 = computeNetSalary({ ...base, bonus: 500_000 })
check(t2 - baseNet === 500_000, 'Test2 Thưởng 0→500 net +500k')

// Test 3: Ứng 1M → 700k
const withAdvance = { ...base, advance: 1_000_000 }
const t3base = computeNetSalary(withAdvance)
const t3 = computeNetSalary({ ...withAdvance, advance: 700_000 })
check(t3 - t3base === 300_000, 'Test3 Ứng 1M→700k net +300k')

// Test 4: KPI 0 → +300k
const t4 = computeNetSalary({ ...base, kpi: 300_000 })
check(t4 - baseNet === 300_000, 'Test4 KPI 0→+300 net +300k')

// Test 5: KPI +300 → -200 → net -500k
const t5a = computeNetSalary({ ...base, kpi: 300_000 })
const t5b = computeNetSalary({ ...base, kpi: -200_000 })
check(t5b - t5a === -500_000, 'Test5 KPI +300→-200 net -500k')

// Test 6: ĐC 0 → -100k
const t6 = computeNetSalary({ ...base, otherAdjustment: -100_000 })
check(t6 - baseNet === -100_000, 'Test6 ĐC 0→-100 net -100k')

const audit = buildPayrollFieldAuditValues({
  employeeId: 'e1',
  employeeName: 'Test',
  branchId: 'soc-trang',
  month: '2026-08',
  cycle: 'period1',
  fieldChanged: 'penalty',
  oldValue: 600000,
  newValue: 200000,
})
check(audit.newValue.difference === 400000, 'Audit chênh lệch tác động lương +400k')

if (failed) {
  console.error(`\nUAT LOGIC FAIL (${failed})`)
  process.exit(1)
}
console.log('\nUAT LOGIC OK')
