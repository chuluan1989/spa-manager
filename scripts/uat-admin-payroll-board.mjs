/**
 * Logic UAT — Admin payroll board (KPI set ±/0, net formula).
 * Run: node scripts/uat-admin-payroll-board.mjs
 */
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_TYPES,
  normalizePayrollAdjustmentAmount,
} from '../src/constants/payrollTypes.js'
import { buildPayrollFieldAuditValues } from '../src/utils/payrollFieldAudit.js'

let failed = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed += 1
}

function computeNetSalary(parts) {
  return (
    (parts.baseSalary ?? 0)
    + (parts.commission ?? 0)
    + (parts.tips ?? 0)
    + (parts.bonus ?? 0)
    + (parts.kpi ?? 0)
    - (parts.reduction ?? 0)
    - (parts.penalty ?? 0)
    - (parts.advance ?? 0)
    + (parts.otherAdjustment ?? 0)
  )
}

check(
  ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(PAYROLL_ADJUSTMENT_TYPES.KPI),
  'KPI nằm trong loại Admin sửa được',
)
check(
  normalizePayrollAdjustmentAmount(PAYROLL_ADJUSTMENT_TYPES.KPI, -50000) === -50000,
  'KPI cho phép số âm',
)
check(
  normalizePayrollAdjustmentAmount(PAYROLL_ADJUSTMENT_TYPES.KPI, 0) === 0,
  'KPI cho phép số 0',
)

const baseParts = {
  baseSalary: 5_000_000,
  commission: 100_000,
  tips: 200_000,
  bonus: 0,
  kpi: 0,
  reduction: 0,
  penalty: 0,
  advance: 0,
  otherAdjustment: 0,
}
const baseNet = computeNetSalary(baseParts)
check(baseNet === 5_300_000, 'Net gốc', String(baseNet))
check(computeNetSalary({ ...baseParts, kpi: 100_000 }) === 5_400_000, 'KPI +100k')
check(computeNetSalary({ ...baseParts, kpi: -100_000 }) === 5_200_000, 'KPI -100k')
check(computeNetSalary({ ...baseParts, kpi: 0 }) === baseNet, 'KPI = 0 trở về gốc')
check(computeNetSalary({ ...baseParts, bonus: 50_000 }) - baseNet === 50_000, 'Thưởng cộng một lần')
check(baseNet - computeNetSalary({ ...baseParts, penalty: 30_000 }) === 30_000, 'Phạt trừ một lần')
check(baseNet - computeNetSalary({ ...baseParts, advance: 20_000 }) === 20_000, 'Ứng lương trừ một lần')
check(computeNetSalary({ ...baseParts, otherAdjustment: 10_000 }) - baseNet === 10_000, 'Điều chỉnh khác dương')
check(baseNet - computeNetSalary({ ...baseParts, otherAdjustment: -10_000 }) === 10_000, 'Điều chỉnh khác âm')

const field = buildPayrollFieldAuditValues({
  employeeId: 'emp-1',
  employeeName: 'Test',
  branchId: 'soc-trang',
  month: '2026-08',
  cycle: 'period1',
  fieldChanged: 'kpi',
  oldValue: 100000,
  newValue: 0,
  difference: -100000,
})
check(field.oldValue.value === 100000, 'Audit old value')
check(field.newValue.value === 0, 'Audit new value')
check(field.newValue.difference === -100000, 'Audit difference')
check(field.newValue.payrollPeriod === '2026-08/period1', 'Audit period')
check(field.newValue.fieldChanged === 'kpi', 'Audit field')

console.log(failed === 0 ? '\nUAT LOGIC OK' : `\nUAT LOGIC FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
