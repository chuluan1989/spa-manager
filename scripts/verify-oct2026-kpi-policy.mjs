/**
 * October 2026 KPI policy + penalty review — local fixtures only.
 * No Production writes, no backfill.
 *
 * Run: npx vite-node scripts/verify-oct2026-kpi-policy.mjs
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import {
  KPI_NEAR_TARGET_WARNING,
  OCT2026_KPI_TARGETS,
  SEP2026_KPI_TARGETS,
  isNearTargetKpi,
  kpiGapPercentagePoints,
} from '../src/constants/kpiPolicy.js'
import { ROLES } from '../src/constants/roles.js'
import { buildAdminKpiDashboard } from '../src/utils/adminKpiDashboard.js'
import { formatKpiPercent } from '../src/utils/employeeKpiView.js'
import {
  computeEmployeeKpi,
  resolveKpiPolicy,
} from '../src/utils/employeeKpiEngine.js'
import { computeEmployeePayrollRow, sumPayrollPeriodLeaveDays } from '../src/utils/payrollEngine.js'
import { validateKpiPenaltyReviewDecision } from '../src/utils/kpiPenaltyReview.js'
import { hashPassword } from '../src/utils/passwordHash.js'
import { PAYROLL_DETAIL_CATEGORIES, PAYROLL_DETAIL_LABELS } from '../src/constants/payrollTypes.js'
import { CLOSE_CYCLE_STATUS } from '../src/utils/payrollCycleClose/closeCycleStatus.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []

function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}`)
  if (!pass) console.error(detail)
}

function sepPolicy(branchId) {
  return {
    id: `sep-${branchId}`,
    branchId,
    effectiveFrom: '2026-09-01',
    addonTarget: SEP2026_KPI_TARGETS.addon,
    advancedTarget: SEP2026_KPI_TARGETS.advanced,
    comboTarget: SEP2026_KPI_TARGETS.combo,
    requestedTarget: SEP2026_KPI_TARGETS.requested,
    duration90Target: SEP2026_KPI_TARGETS.duration90,
  }
}

function octPolicy(branchId) {
  return {
    id: `oct-${branchId}`,
    branchId,
    effectiveFrom: '2026-10-01',
    addonTarget: OCT2026_KPI_TARGETS.addon,
    advancedTarget: OCT2026_KPI_TARGETS.advanced,
    comboTarget: OCT2026_KPI_TARGETS.combo,
    requestedTarget: OCT2026_KPI_TARGETS.requested,
    duration90Target: OCT2026_KPI_TARGETS.duration90,
  }
}

const policies = ['soc-trang', 'tram-spa', 'song-khoe-spa'].map(sepPolicy)

function line(serviceId) {
  return { serviceId }
}

function many(serviceId, count) {
  return Array.from({ length: count }, () => line(serviceId))
}

function modelFor(date, fromDate, toDate, extra = {}) {
  return computeEmployeeKpi([{
    id: `inv-${date}`,
    date,
    branchId: extra.branchId || 'soc-trang',
    employeeId: extra.employeeId || 'emp-a',
    customerRequested: false,
    services: extra.services || [line('body-60')],
  }], {
    employeeId: extra.employeeId || 'emp-a',
    homeBranchId: extra.homeBranchId || 'soc-trang',
    fromDate,
    toDate,
    policies: extra.policies || policies,
    reviews: extra.reviews || [],
  })
}

function targetsOf(model) {
  return model.policySegments[0]?.targets
}

const periods = [
  ['01', 'September Kỳ 1 old targets', '2026-09-08', '2026-09-01', '2026-09-15', SEP2026_KPI_TARGETS],
  ['02', 'September Kỳ 2 old targets', '2026-09-20', '2026-09-16', '2026-09-30', SEP2026_KPI_TARGETS],
  ['03', 'October Kỳ 1 new targets', '2026-10-08', '2026-10-01', '2026-10-15', OCT2026_KPI_TARGETS],
  ['04', 'October Kỳ 2 new targets', '2026-10-20', '2026-10-16', '2026-10-31', OCT2026_KPI_TARGETS],
]

for (const [id, name, date, fromDate, toDate, expected] of periods) {
  const model = modelFor(date, fromDate, toDate)
  const targets = targetsOf(model)
  check(id, name, targets
    && targets.addon === expected.addon
    && targets.advanced === expected.advanced
    && targets.combo === expected.combo
    && targets.requested === expected.requested
    && targets.duration90 === expected.duration90, { targets, expected })
}

const nearServices = [...many('body-60', 60), ...many('chuyen-sau', 4)]
const near = modelFor('2026-10-08', '2026-10-01', '2026-10-15', { services: nearServices })
const nearAdvanced = near.penalty.breakdown.advanced
check('05', 'Gap < 5 percentage points triggers warning', nearAdvanced.nearTarget === true
  && nearAdvanced.warningLabel === KPI_NEAR_TARGET_WARNING
  && nearAdvanced.originalMissing === 2
  && nearAdvanced.gapPercentagePoints > 0
  && nearAdvanced.gapPercentagePoints < 5
  && nearAdvanced.originalPenalty === 100000
  && near.penalty.kpiPenaltyReduction === 0, nearAdvanced)

const exactFive = modelFor('2026-10-08', '2026-10-01', '2026-10-15', {
  services: [...many('body-60', 20), line('chuyen-sau')],
})
check('06', 'Gap = 5 does not trigger warning', exactFive.penalty.breakdown.advanced.nearTarget === false
  && kpiGapPercentagePoints(0.3, 0.25) === 5
  && isNearTargetKpi({
    rate: 0.25,
    target: 0.3,
    status: 'NOT_MET',
    periodTo: '2026-10-15',
  }) === false, {
  gap: exactFive.penalty.breakdown.advanced.gapPercentagePoints,
  floatGap: kpiGapPercentagePoints(0.3, 0.25),
})

const achieved = modelFor('2026-10-08', '2026-10-01', '2026-10-15', {
  services: [...many('body-60', 10), ...many('chuyen-sau', 2)],
})
check('07', 'Achieved KPI does not trigger warning', achieved.overall.kpis.advanced.status === 'MET'
  && achieved.penalty.breakdown.advanced.nearTarget === false
  && achieved.penalty.breakdown.advanced.reviewEligible === false, achieved.penalty.breakdown.advanced)

check('05b', 'Displayed percent rounding does not decide the warning', formatKpiPercent(4 / 60) !== '10%'
  && nearAdvanced.nearTarget === true, { shown: formatKpiPercent(4 / 60), gap: nearAdvanced.gapPercentagePoints })

const reviewBase = {
  employeeId: 'emp-a',
  periodFrom: '2026-10-01',
  periodTo: '2026-10-15',
  kpiCategory: 'advanced',
  originalMissing: 2,
  gapPercentagePoints: nearAdvanced.gapPercentagePoints,
  reason: 'Gần đạt, xét giảm',
}

function withReview(approvedMissing) {
  return modelFor('2026-10-08', '2026-10-01', '2026-10-15', {
    services: nearServices,
    reviews: [{ ...reviewBase, id: 'r1', approvedMissing, updatedAt: '2026-10-09T00:00:00Z' }],
  })
}

check('08', 'No approval keeps original penalty', near.penalty.kpiPenalty === near.penalty.originalKpiPenalty
  && near.penalty.kpiPenaltyReduction === 0
  && nearAdvanced.chargeableMissing === 2
  && near.overall.kpis.advanced.actual === 4, {})

const reduced = withReview(1)
check('09', 'Admin reduces missing 2 to 1', reduced.penalty.breakdown.advanced.chargeableMissing === 1
  && reduced.penalty.breakdown.advanced.reviewStatus === 'reduced'
  && reduced.penalty.breakdown.advanced.originalPenalty === 100000
  && reduced.penalty.breakdown.advanced.approvedPenalty === 50000
  && reduced.penalty.kpiPenaltyReduction === 50000
  && reduced.overall.kpis.advanced.actual === near.overall.kpis.advanced.actual, reduced.penalty.breakdown.advanced)

const waived = withReview(0)
check('10', 'Admin waives missing 2 to 0', waived.penalty.breakdown.advanced.chargeableMissing === 0
  && waived.penalty.breakdown.advanced.reviewStatus === 'waived'
  && waived.penalty.breakdown.advanced.approvedPenalty === 0
  && waived.penalty.kpiPenaltyReduction === 100000
  && waived.overall.kpis.advanced.rate === near.overall.kpis.advanced.rate, waived.penalty.breakdown.advanced)

const managerVerdict = validateKpiPenaltyReviewDecision({
  ...reviewBase,
  approvedMissing: 1,
  actorRole: ROLES.BRANCH_MANAGER,
  actorId: 'soc-trang',
})
const employeeVerdict = validateKpiPenaltyReviewDecision({
  ...reviewBase,
  approvedMissing: 0,
  actorRole: ROLES.EMPLOYEE,
  actorId: 'emp-a',
  adminPassword: '',
})
const spoofedAdminVerdict = validateKpiPenaltyReviewDecision({
  ...reviewBase,
  approvedMissing: 1,
  actorRole: ROLES.ADMIN,
  actorId: 'admin',
})
check('11', 'Manager cannot approve without the Admin password', managerVerdict.ok === false
  && managerVerdict.errors.some((line) => line.includes('mật khẩu Admin')), managerVerdict)
check('12', 'Employee cannot approve by sending a role', employeeVerdict.ok === false
  && spoofedAdminVerdict.ok === false, { employeeVerdict, spoofedAdminVerdict })

const adminKpiEarly = readFileSync(join(ROOT, 'src/pages/AdminKpi.jsx'), 'utf8')
const credentialsSrc = readFileSync(join(ROOT, 'src/utils/credentialsStorage.js'), 'utf8')
check('13', 'Release A does not include approval writes or migration 0049', !adminKpiEarly.includes('KpiPenaltyReviewSection')
  && !adminKpiEarly.includes('fetchKpiPenaltyReviews')
  && !credentialsSrc.includes('rotateAdminApprovalPassword')
  && credentialsSrc.includes('export async function updateAdminPassword(password)')
  && !existsSync(join(ROOT, 'supabase/migrations/0049_oct2026_kpi_policy_and_penalty_reviews.sql'))
  && !existsSync(join(ROOT, 'src/components/kpi/KpiPenaltyReviewSection.jsx'))
  && !existsSync(join(ROOT, 'src/repositories/kpiPenaltyReviewRepository.js')), {})

const lockedVerdict = validateKpiPenaltyReviewDecision({
  ...reviewBase,
  approvedMissing: 1,
  adminPassword: 'proof-only',
  closeStatus: CLOSE_CYCLE_STATUS.APPROVED,
})
const payrollSrc = readFileSync(join(ROOT, 'src/utils/payrollEngine.js'), 'utf8')
check('14', 'Approved payroll stays locked and snapshots are not rewritten', lockedVerdict.ok === false
  && !payrollSrc.includes('payroll_cycle_closes')
  && !payrollSrc.includes('upsertPayrollCycleClose'), lockedVerdict)

function payrollRow(reviews = []) {
  return computeEmployeePayrollRow(
    { id: 'emp-a', name: 'A', branchId: 'soc-trang', salaryRate: '0' },
    [{
      id: 'p1',
      date: '2026-10-08',
      branchId: 'soc-trang',
      employeeId: 'emp-a',
      services: nearServices,
      tips: 0,
    }],
    [{
      id: 'att-1',
      employeeId: 'emp-a',
      date: '2026-10-03',
      status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
      penaltyAmount: 100000,
    }],
    [],
    {
      kpiPolicies: policies,
      kpiPenaltyReviews: reviews,
      fromDate: '2026-10-01',
      toDate: '2026-10-15',
      month: '2026-10',
      cycle: 'period1',
    },
  )
}

const payOriginal = payrollRow()
const payReduced = payrollRow([{ ...reviewBase, approvedMissing: 1 }])
check('15', 'No double KPI penalty deduction', payReduced.kpiPenalty === payOriginal.kpiPenalty - 50000
  && payReduced.originalKpiPenalty === payOriginal.originalKpiPenalty
  && payReduced.netSalary === payOriginal.netSalary + 50000
  && payReduced.bonus === payOriginal.bonus
  && payReduced.kpi === 0
  && payReduced.reduction === 0, {
  originalNet: payOriginal.netSalary,
  reducedNet: payReduced.netSalary,
  penalty: payReduced.penalty,
  kpiPenalty: payReduced.kpiPenalty,
})
check('16', 'No double salary credit', (payReduced.netSalary - payOriginal.netSalary) === payReduced.kpiPenaltyReduction
  && payReduced.bonus === 0
  && payReduced.kpi === 0, {
  delta: payReduced.netSalary - payOriginal.netSalary,
  reduction: payReduced.kpiPenaltyReduction,
})

const leaveRecords = [
  { employeeId: 'emp-a', date: '2026-10-02', status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED, penaltyAmount: 0 },
  { employeeId: 'emp-a', date: '2026-10-04', status: ATTENDANCE_STATUS.HALF_MORNING_PERMITTED, penaltyAmount: 0 },
  { employeeId: 'emp-a', date: '2026-09-20', status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED, penaltyAmount: 0 },
]
check('17', 'Existing leave-day values stay on the period', sumPayrollPeriodLeaveDays(leaveRecords, 'emp-a', '2026-10-01', '2026-10-15') === 1.5, {})
check('18', 'Attendance penalty calculation unchanged', payOriginal.attendancePenalty === 100000
  && payReduced.attendancePenalty === 100000
  && payOriginal.penalty === 100000
  && payReduced.penalty === 100000, {})

const tour = computeEmployeeKpi([
  {
    id: 'home',
    date: '2026-10-08',
    branchId: 'soc-trang',
    employeeId: 'emp-home',
    services: [line('body-60')],
  },
  {
    id: 'tour',
    date: '2026-10-09',
    branchId: 'tram-spa',
    employeeId: 'emp-home',
    services: [line('body-60'), line('chuyen-sau')],
  },
], {
  employeeId: 'emp-home',
  homeBranchId: 'soc-trang',
  fromDate: '2026-10-01',
  toDate: '2026-10-15',
  policies,
})
check('19', 'Cross-branch tour KPI remains included', tour.includedInvoices.some((row) => row.branchId === 'tram-spa')
  && tour.overall.counts.main === 2
  && tour.overall.counts.advanced === 1, tour.overall.counts)

const employees = [
  { id: 'emp-home', name: 'Home', branchId: 'soc-trang' },
  { id: 'emp-other', name: 'Other', branchId: 'song-khoe-spa' },
]
const adminDash = buildAdminKpiDashboard([
  { id: 't1', date: '2026-10-08', branchId: 'tram-spa', employeeId: 'emp-home', services: [line('body-60')] },
  { id: 't2', date: '2026-10-08', branchId: 'soc-trang', employeeId: 'emp-other', services: [line('body-60')] },
], {
  fromDate: '2026-10-01',
  toDate: '2026-10-15',
  policies,
  employees,
  restrictHomeBranchId: 'soc-trang',
})
check('20', 'Manager HOME branch isolation preserved', adminDash.rows.length === 1
  && adminDash.rows[0].employeeId === 'emp-home'
  && adminDash.rows[0].homeBranchId === 'soc-trang', adminDash.rows.map((row) => row.employeeId))

const adminOpen = buildAdminKpiDashboard([{
  id: 'same',
  date: '2026-10-08',
  branchId: 'soc-trang',
  employeeId: 'emp-a',
  services: nearServices,
}], {
  fromDate: '2026-10-01',
  toDate: '2026-10-15',
  policies,
  reviews: [{ ...reviewBase, approvedMissing: 1 }],
  employees: [{ id: 'emp-a', name: 'A', branchId: 'soc-trang' }],
})
check('21', 'Admin and payroll use the same approved penalty', adminOpen.rows[0].kpiPenalty === payReduced.kpiPenalty
  && adminOpen.rows[0].kpiPenaltyReduction === 50000
  && adminOpen.rows[0].originalKpiPenalty - adminOpen.rows[0].kpiPenalty === 50000
  && adminOpen.rows[0].cards.advanced.actual === 4, {
  adminPenalty: adminOpen.rows[0].kpiPenalty,
  payrollPenalty: payReduced.kpiPenalty,
})

const sepHistorical = modelFor('2026-09-08', '2026-09-01', '2026-09-15', {
  services: nearServices,
  reviews: [{ ...reviewBase, periodFrom: '2026-09-01', periodTo: '2026-09-15', approvedMissing: 0 }],
})
check('22', 'September ignores reductions and keeps old targets', targetsOf(sepHistorical).advanced === 0.2
  && sepHistorical.penalty.breakdown.advanced.nearTarget === false
  && sepHistorical.penalty.kpiPenalty === sepHistorical.penalty.originalKpiPenalty
  && sepHistorical.penalty.kpiPenaltyReduction === 0, {
  targets: targetsOf(sepHistorical),
  penalty: sepHistorical.penalty.kpiPenalty,
  reduction: sepHistorical.penalty.kpiPenaltyReduction,
})

const invoiceRepo = readFileSync(join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
check('23', 'Existing invoice upsert still preserves customer_requested', invoiceRepo.includes('customer_requested')
  && invoiceRepo.includes('upsertInvoiceRowsWithRetry')
  && !invoiceRepo.includes('delete next.customer_requested'), {})

const period2 = modelFor('2026-10-20', '2026-10-16', '2026-10-31', {
  services: nearServices,
  reviews: [{ ...reviewBase, approvedMissing: 0 }],
})
check('22b', 'October Kỳ 1 review does not carry into Kỳ 2', period2.penalty.kpiPenaltyReduction === 0
  && period2.penalty.kpiPenalty === period2.penalty.originalKpiPenalty
  && targetsOf(period2).advanced === 0.1, {})

const versioned = resolveKpiPolicy('soc-trang', '2026-10-08', [...policies, octPolicy('soc-trang')])
check('03b', 'Versioned October policy is preferred over the September row', versioned.source === 'versioned'
  && versioned.targets.advanced === 0.1
  && versioned.targets.requested === 0.1
  && versioned.targets.duration90 === 0.2, versioned)

const canonical = resolveKpiPolicy('bac-lieu', '2026-10-08', [sepPolicy('bac-lieu')])
check('03c', 'Canonical October targets apply when no October policy row exists', canonical.source === 'canonical-oct2026'
  && canonical.targets.advanced === 0.1, canonical.source)

const sepStill = resolveKpiPolicy('soc-trang', '2026-09-30', [...policies, octPolicy('soc-trang')])
check('01b', 'September date still resolves the September policy', sepStill.source === 'versioned'
  && sepStill.targets.advanced === 0.2
  && sepStill.targets.requested === 0.2, sepStill.targets)

const payrollHook = readFileSync(join(ROOT, 'src/hooks/usePayrollData.js'), 'utf8')
const adminKpi = readFileSync(join(ROOT, 'src/pages/AdminKpi.jsx'), 'utf8')
check('25', 'Supabase egress stays period-scoped', payrollHook.includes('getPayPeriodRange(month, cycle)')
  && payrollHook.includes('fromDate: invoiceRange.fromDate')
  && payrollHook.includes('toDate: invoiceRange.toDate')
  && !payrollHook.includes('fetchKpiPenaltyReviews')
  && !payrollHook.includes('kpi_penalty_reviews')
  && adminKpi.includes('employeeIds')
  && !payrollHook.includes('fetchInvoices('), {})

check('25b', 'Release A does not query the missing review table', !adminKpi.includes('kpi_penalty_reviews')
  && !payrollHook.includes('kpi_penalty_reviews'), {})

const sepBefore = modelFor('2026-09-20', '2026-09-16', '2026-09-30')
const sepAfter = modelFor('2026-09-20', '2026-09-16', '2026-09-30', {
  reviews: [{ ...reviewBase, approvedMissing: 0 }],
})
check('22c', 'A later October review does not change September KPI', sepBefore.penalty.kpiPenalty === sepAfter.penalty.kpiPenalty
  && targetsOf(sepBefore).duration90 === 0.3, {})

const nodeHash = createHash('sha256').update('spa-manager-v1proof-only').digest('hex')
const appHash = await hashPassword('proof-only')
check('26', 'Admin password hash matches SHA-256 of the existing salt', appHash === nodeHash && /^[a-f0-9]{64}$/.test(appHash), {})

const listSrc = readFileSync(join(ROOT, 'src/components/salary/PayrollEmployeeList.jsx'), 'utf8')
const payslipSrc = readFileSync(join(ROOT, 'src/components/salary/PayrollPayslipPanel.jsx'), 'utf8')
const payslipExportSrc = readFileSync(join(ROOT, 'src/utils/payslipExport.js'), 'utf8')
const branchSalarySrc = readFileSync(join(ROOT, 'src/components/branches/BranchSalaryTab.jsx'), 'utf8')
check('27', 'Salary table and payslip show original, reduction, actual penalty, and leave days', listSrc.includes("label: 'Ngày nghỉ'")
  && listSrc.includes("label: 'Phạt KPI gốc'")
  && listSrc.includes("label: 'Miễn/giảm phạt KPI'")
  && listSrc.includes("label: 'Phạt KPI thực tế'")
  && branchSalarySrc.includes('Phạt KPI thực tế')
  && payslipSrc.includes('originalKpiPenalty')
  && payslipSrc.includes('kpiPenaltyReduction')
  && payslipSrc.includes('leaveDays')
  && payslipExportSrc.includes('originalKpiPenalty')
  && payslipExportSrc.includes('kpiPenaltyReduction')
  && payslipExportSrc.includes('leaveDays')
  && PAYROLL_DETAIL_LABELS[PAYROLL_DETAIL_CATEGORIES.KPI_PENALTY] === 'Phạt KPI thực tế'
  && PAYROLL_DETAIL_LABELS.originalKpiPenalty === 'Phạt KPI gốc'
  && PAYROLL_DETAIL_LABELS.kpiPenaltyReduction === 'Miễn/giảm phạt KPI'
  && PAYROLL_DETAIL_LABELS.leaveDays === 'Ngày nghỉ', {})

check('28', 'October targets come from the app without a payroll or policy migration', canonical.targets.addon === 0.8
  && canonical.targets.combo === 0.3
  && canonical.targets.advanced === 0.1
  && canonical.targets.requested === 0.1
  && canonical.targets.duration90 === 0.2
  && !payrollSrc.includes('payroll_cycle_closes'), {})

const failed = results.filter((row) => !row.pass)
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exit(1)
