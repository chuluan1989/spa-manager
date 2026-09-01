/**
 * Offline UAT — Giam lương (SET theo kỳ, không phải phạt).
 *
 *   npx vite-node scripts/verify-giam-luong-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeNetSalary } from '../src/utils/payrollEngine.js'
import { netSalaryImpactForFieldSet } from '../src/utils/payrollFieldAudit.js'
import { currentTotalsFromPayrollRow } from '../src/components/salary/PayrollEditBoardModal.jsx'
import {
  ADMIN_EDITABLE_ADJUSTMENT_TYPES,
  PAYROLL_ADJUSTMENT_LABELS,
  PAYROLL_ADJUSTMENT_TYPES,
  PAYROLL_DETAIL_CATEGORIES,
  PAYROLL_DETAIL_LABELS,
} from '../src/constants/payrollTypes.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const results = []

function check(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
    console.log(`✓ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, error: String(err?.message || err) })
    console.error(`✗ ${name}: ${err?.message || err}`)
  }
}

check('Label: Giam lương, không còn Giảm lương', () => {
  assert.equal(PAYROLL_DETAIL_LABELS[PAYROLL_DETAIL_CATEGORIES.REDUCTION], 'Giam lương')
  assert.equal(PAYROLL_ADJUSTMENT_LABELS[PAYROLL_ADJUSTMENT_TYPES.REDUCTION], 'Giam lương')
  const srcFiles = [
    'src/constants/payrollTypes.js',
    'src/components/salary/PayrollEditBoardModal.jsx',
    'src/components/salary/PayrollLiveDashboard.jsx',
    'src/components/salary/PayrollTable.jsx',
    'src/components/salary/PayrollWallet.jsx',
    'src/components/salary/PayrollPayslipPanel.jsx',
    'src/components/salary/PayrollBranchBreakdown.jsx',
    'src/components/salary/PayrollEmployeeProfile.jsx',
    'src/utils/payrollService.js',
    'src/utils/payslipExport.js',
    'src/components/settings/SettingsPoliciesTab.jsx',
  ]
  for (const rel of srcFiles) {
    const text = readFileSync(path.join(ROOT, rel), 'utf8')
    assert.equal(text.includes('Giảm lương'), false, `${rel} still has Giảm lương`)
  }
})

check('Modal: có mục GIAM LƯƠNG SET, không SET phạt/ứng', () => {
  const modal = readFileSync(path.join(ROOT, 'src/components/salary/PayrollEditBoardModal.jsx'), 'utf8')
  assert.ok(modal.includes('giam-luong-heading'))
  assert.ok(modal.includes('GIAM LƯƠNG'))
  assert.ok(modal.includes('edit-input-${type}'))
  assert.ok(modal.includes('PAYROLL_ADJUSTMENT_TYPES.REDUCTION'))
  assert.ok(!modal.includes('edit-input-penalty'))
  assert.ok(!modal.includes('edit-input-advance'))
  assert.ok(modal.includes('+ Thêm ứng lương'))
  assert.ok(modal.includes('+ Thêm phạt'))
})

check('Service: SET reduction theo kỳ; bỏ qua phạt/ứng line-item', () => {
  const service = readFileSync(path.join(ROOT, 'src/utils/payrollService.js'), 'utf8')
  assert.ok(service.includes('PAYROLL_ADJUSTMENT_TYPES.REDUCTION'))
  assert.ok(service.includes('ignored_line_item_type'))
  const boardBlock = service.slice(
    service.indexOf('const boardTypes'),
    service.indexOf('const results'),
  )
  assert.ok(boardBlock.includes('REDUCTION'))
  assert.ok(!boardBlock.includes('PENALTY'))
  assert.ok(!boardBlock.includes('ADVANCE'))
})

check('UAT 500k → 300k → 0: thực nhận đúng, không đụng thưởng/KPI/phạt/ứng', () => {
  const rest = {
    baseSalary: 1_000_000,
    commission: 2_000_000,
    tips: 100_000,
    bonus: 200_000,
    kpi: 50_000,
    penalty: 80_000,
    advance: 120_000,
  }
  const net0 = computeNetSalary({ ...rest, reduction: 0 })
  const net500 = computeNetSalary({ ...rest, reduction: 500_000 })
  const net300 = computeNetSalary({ ...rest, reduction: 300_000 })
  assert.equal(net500, net0 - 500_000)
  assert.equal(net300, net0 - 300_000)
  assert.equal(computeNetSalary({ ...rest, reduction: 0 }), net0)
  assert.equal(netSalaryImpactForFieldSet('reduction', 0, 500_000), -500_000)
  assert.equal(netSalaryImpactForFieldSet('reduction', 500_000, 300_000), 200_000)
  assert.equal(netSalaryImpactForFieldSet('reduction', 300_000, 0), 300_000)
  assert.equal(rest.bonus, 200_000)
  assert.equal(rest.kpi, 50_000)
  assert.equal(rest.penalty, 80_000)
  assert.equal(rest.advance, 120_000)
})

check('Board bind: reduction lấy từ payrollRow, không nhầm phạt/ứng', () => {
  const totals = currentTotalsFromPayrollRow({
    bonus: 11,
    kpi: 22,
    penalty: 999,
    manualPenalty: 33,
    attendancePenalty: 44,
    advance: 55,
    reduction: 66,
  })
  assert.equal(totals[PAYROLL_ADJUSTMENT_TYPES.REDUCTION], 66)
  assert.equal(totals[PAYROLL_ADJUSTMENT_TYPES.PENALTY], 33)
  assert.equal(totals[PAYROLL_ADJUSTMENT_TYPES.ADVANCE], 55)
  assert.ok(ADMIN_EDITABLE_ADJUSTMENT_TYPES.includes(PAYROLL_ADJUSTMENT_TYPES.REDUCTION))
})

const failed = results.filter((r) => !r.ok)
console.log(`\nGiam lương offline UAT: ${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.error(failed)
  process.exit(1)
}
