/**
 * B1 UAT — fixture / in-memory only. Không ghi Production.
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/verify-employee-kpi-b1-uat.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS, KPI_STATUS } from '../src/constants/kpiPolicy.js'
import {
  ALL_KPI_SERVICE_TOKENS,
  auditKpiCatalogRows,
  classifyKpiServiceLine,
} from '../src/utils/kpiServiceClassifier.js'
import {
  bruteForceRequestedMissing,
  computeEmployeeKpi,
  computeScopeKpi,
  missingRequestedInvoices,
  missingServiceLines,
  resolveKpiPolicy,
} from '../src/utils/employeeKpiEngine.js'
import { appendKpiPolicyVersion } from '../src/utils/kpiPolicyStorage.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/EMPLOYEE_KPI_B1_UAT.json')

const results = []
function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  if (!pass) console.error(`FAIL ${id} ${name}`, detail)
  else console.log(`PASS ${id} ${name}`)
}

function inv(partial) {
  return {
    id: partial.id,
    date: partial.date || '2026-08-10',
    branchId: partial.branchId || 'soc-trang',
    employeeId: partial.employeeId || 'emp-lyly',
    supportEmployeeId: partial.supportEmployeeId || '',
    customerRequested: Boolean(partial.customerRequested),
    services: partial.services,
  }
}

function line(serviceId, serviceName = '') {
  return { serviceId, serviceName }
}

function kpisOf(invoices, extra = {}) {
  return computeEmployeeKpi(invoices, { employeeId: extra.employeeId || 'emp-lyly', policies: extra.policies || [], ...extra })
}

const CLASS_CASES = [
  [1, 'Body → MAIN', 'body-60', 'MAIN'],
  [2, 'CVG → MAIN', 'co-vai-gay', 'MAIN'],
  [3, 'Foot → MAIN', 'foot', 'MAIN'],
  [4, 'Combo → COMBO', 'combo-1', 'COMBO'],
  [5, 'Chuyên sâu → ADVANCED', 'chuyen-sau', 'ADVANCED'],
  [6, 'Gội → ADDON', 'goi-sach', 'ADDON'],
  [7, 'Giác hơi → ADDON', 'giac-hoi', 'ADDON'],
  [8, 'Đắp thuốc → ADDON', 'dap-thuoc', 'ADDON'],
  [9, 'Xông hơi → ADDON', 'xong-hoi', 'ADDON'],
  [10, 'Cạo mặt → ADDON', 'cao-mat', 'ADDON'],
  [11, 'Phòng đơn → ADDON', 'phong-don', 'ADDON'],
]

for (const [id, name, token, group] of CLASS_CASES) {
  const a = classifyKpiServiceLine(line(token))
  const b = classifyKpiServiceLine(line(`tram-spa-svc-${token}`))
  check(id, name, a.group === group && b.group === group && a.token === token, { a, b })
}

{
  const legacy = classifyKpiServiceLine({ serviceId: 'body', serviceName: "Body 60'" })
  const blocked = classifyKpiServiceLine({ serviceId: 'mystery-svc', serviceName: "Body 60'" })
  check('1b', 'Legacy id body + name → MAIN; id lạ không fallback name', legacy.group === 'MAIN' && legacy.token === 'body-60' && blocked.group === 'UNMAPPED', { legacy, blocked })
}

{
  const model = kpisOf([
    inv({ id: 'c12', services: [line('body-60'), line('phong-don')] }),
  ])
  check(12, 'Body + Phòng đơn = MAIN1 ADDON1', model.overall.counts.main === 1 && model.overall.counts.addon === 1, model.overall.counts)
}

{
  const model = kpisOf([
    inv({
      id: 'c13',
      services: [line('body-60'), line('goi-sach'), line('giac-hoi'), line('phong-don')],
    }),
  ])
  check(13, 'Body + Gội + Giác + Phòng đơn = MAIN1 ADDON3', model.overall.counts.main === 1 && model.overall.counts.addon === 3, model.overall.counts)
}

{
  const rows = KPI_SCOPE_BRANCH_IDS.flatMap((branchId) =>
    ALL_KPI_SERVICE_TOKENS.map((token) => ({
      branchId,
      durationId: `${branchId}-svc-${token}`,
      serviceName: token,
    })),
  )
  const audit = auditKpiCatalogRows(rows)
  check(14, '6 CN known catalog UNMAPPED=0', audit.unmappedCount === 0 && audit.total === rows.length, audit)
}

{
  const model = kpisOf([
    inv({
      id: 'gl1',
      branchId: 'gia-lai-1',
      services: [line('gl-body-60', 'Massage body'), line('phong-don')],
    }),
  ])
  const policy = resolveKpiPolicy('gia-lai-1', '2026-08-10', [])
  check(
    15,
    'Gia Lai invoice NOT_APPLICABLE / excluded',
    model.overall.counts.totalInvoices === 0
      && model.excludedGiaLaiInvoices === 1
      && policy.status === 'NOT_APPLICABLE'
      && policy.targets === null,
    { counts: model.overall.counts, policy },
  )
}

{
  const glRows = [
    { branchId: 'gia-lai-1', durationId: 'gl-body-60', serviceName: 'Massage body 60' },
    { branchId: 'gia-lai-2', durationId: 'gl-combo-1', serviceName: 'Combo 1' },
  ]
  const audit = auditKpiCatalogRows(glRows)
  check(16, 'Gia Lai catalog không warning unmapped', audit.total === 0 && audit.unmappedCount === 0, audit)
}

{
  const model = kpisOf([inv({ id: 'm0', services: [line('goi-sach')] })])
  check(
    17,
    'MAIN=0 INSUFFICIENT_DATA',
    model.overall.kpis.addon.status === KPI_STATUS.INSUFFICIENT_DATA
      && model.overall.kpis.addon.rate === null
      && model.overall.kpis.addon.missing === null,
    model.overall.kpis.addon,
  )
}

{
  const missing = missingServiceLines(5, 10, 0.7)
  check(18, 'Missing ADDON ceil(10*0.7-5)=2', missing === 2, { missing })
}

{
  const missing = missingServiceLines(0, 10, 0.1)
  check(19, 'Missing ADVANCED ceil(10*0.1-0)=1', missing === 1, { missing })
}

{
  const missing = missingServiceLines(2, 10, 0.3)
  check(20, 'Missing COMBO ceil(10*0.3-2)=1', missing === 1, { missing })
}

{
  const N = 10
  const R = 1
  const t = 0.2
  const formula = missingRequestedInvoices(R, N, t)
  const brute = bruteForceRequestedMissing(R, N, t)
  const t1 = missingRequestedInvoices(3, 10, 1)
  check(
    21,
    'Missing requested = brute-force; t=1 no Infinity',
    formula === brute && formula === 2 && t1 === null && !Number.isFinite(Infinity),
    { formula, brute, t1 },
  )
}

{
  const model = kpisOf([
    inv({ id: 'r1', customerRequested: true, services: [line('body-60')] }),
    inv({ id: 'r2', customerRequested: false, services: [line('body-60')] }),
  ])
  check(22, 'customerRequested=true đếm', model.overall.counts.requestedInvoices === 1, model.overall.counts)
  check(23, 'customerRequested=false không đếm', model.overall.counts.requestedInvoices === 1 && model.overall.counts.totalInvoices === 2, model.overall.counts)
}

{
  const policies = [{
    id: 'tram-p',
    branchId: 'tram-spa',
    effectiveFrom: '2026-01-01',
    addonTarget: 0.9,
    advancedTarget: 0.1,
    comboTarget: 0.3,
    requestedTarget: 0.2,
  }]
  const model = kpisOf([
    inv({
      id: 'xb',
      branchId: 'tram-spa',
      employeeId: 'emp-lyly',
      services: [line('body-60')],
    }),
  ], { policies })
  check(
    24,
    'Cross-branch policy serving branch Trạm',
    model.policySegments[0]?.servingBranchId === 'tram-spa'
      && model.policySegments[0]?.targets.addon === 0.9
      && model.overall.kpis.addon.target !== 0.7
      && model.policySegments[0]?.targets.addon === 0.9,
    model.policySegments,
  )
}

{
  const policies = [
    {
      id: 'st-old',
      branchId: 'soc-trang',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-08-14',
      addonTarget: 0.7,
      advancedTarget: 0.1,
      comboTarget: 0.3,
      requestedTarget: 0.2,
    },
    {
      id: 'st-new',
      branchId: 'soc-trang',
      effectiveFrom: '2026-08-15',
      addonTarget: 0.5,
      advancedTarget: 0.1,
      comboTarget: 0.3,
      requestedTarget: 0.2,
    },
  ]
  const model = kpisOf([
    inv({ id: 'd1', date: '2026-08-10', services: [line('body-60'), line('goi-sach')] }),
    inv({ id: 'd2', date: '2026-08-20', services: [line('body-60')] }),
  ], { policies })
  const ids = model.policySegments.map((s) => s.policyId).sort()
  check(
    25,
    'Policy đổi giữa tháng: đúng version theo ngày',
    ids.includes('st-old') && ids.includes('st-new') && model.policySegments.length === 2,
    model.policySegments.map((s) => ({ id: s.policyId, from: s.effectiveFrom, n: s.counts.totalInvoices })),
  )
}

{
  const policies = [
    {
      id: 'a',
      branchId: 'soc-trang',
      effectiveFrom: '2026-01-01',
      addonTarget: 0.7,
      advancedTarget: 0.1,
      comboTarget: 0.3,
      requestedTarget: 0.2,
    },
    {
      id: 'b',
      branchId: 'tram-spa',
      effectiveFrom: '2026-01-01',
      addonTarget: 0.1,
      advancedTarget: 0.1,
      comboTarget: 0.3,
      requestedTarget: 0.2,
    },
  ]
  const invoices = [
    ...Array.from({ length: 100 }, (_, i) => inv({
      id: `st-${i}`,
      branchId: 'soc-trang',
      services: [line('body-60'), line('goi-sach')],
    })),
    inv({
      id: 'tram-1',
      branchId: 'tram-spa',
      services: [line('body-60')],
    }),
  ]
  const model = kpisOf(invoices, { policies })
  const avgTarget = (0.7 + 0.1) / 2
  const blendedRate = model.overall.counts.addon / model.overall.counts.main
  const naiveMet = blendedRate >= avgTarget
  const engineMet = model.overall.kpis.addon.status === KPI_STATUS.MET
  check(
    26,
    'Multi-branch không average target sai',
    naiveMet === true && engineMet === false && model.overall.kpis.addon.mixedTargets === true && model.overall.kpis.addon.missing === 1,
    {
      blendedRate,
      avgTarget,
      naiveMet,
      engineStatus: model.overall.kpis.addon.status,
      missing: model.overall.kpis.addon.missing,
    },
  )
}

{
  const invoices = [
    inv({
      id: 'sup',
      employeeId: 'emp-primary',
      supportEmployeeId: 'emp-lyly',
      services: [line('body-60'), line('goi-sach')],
    }),
  ]
  const asSupport = kpisOf(invoices, { employeeId: 'emp-lyly' })
  const asPrimary = kpisOf(invoices, { employeeId: 'emp-primary' })
  check(
    27,
    'supportEmployee không cộng KPI',
    asSupport.overall.counts.totalInvoices === 0 && asPrimary.overall.counts.main === 1,
    { support: asSupport.overall.counts, primary: asPrimary.overall.counts },
  )
}

{
  const live = [
    inv({ id: 'mut', services: [line('body-60')] }),
  ]
  const afterCreate = kpisOf(live)
  live[0] = inv({
    id: 'mut',
    branchId: 'bac-lieu',
    employeeId: 'emp-other',
    customerRequested: true,
    services: [line('combo-1'), line('chuyen-sau')],
  })
  const afterUpdateOther = kpisOf(live)
  const afterUpdateNewEmp = kpisOf(live, { employeeId: 'emp-other' })
  live.splice(0, 1)
  const afterDelete = kpisOf(live)
  check(
    28,
    'Update invoice recompute (service/employee/branch/requested)',
    afterCreate.overall.counts.main === 1
      && afterUpdateOther.overall.counts.totalInvoices === 0
      && afterUpdateNewEmp.overall.counts.combo === 1
      && afterUpdateNewEmp.overall.counts.advanced === 1
      && afterUpdateNewEmp.overall.counts.requestedInvoices === 1
      && afterUpdateNewEmp.servingBranchSegments[0].servingBranchId === 'bac-lieu',
    { afterCreate: afterCreate.overall.counts, afterUpdateNewEmp: afterUpdateNewEmp.overall.counts },
  )
  check(
    29,
    'Delete invoice recompute giảm đúng',
    afterDelete.overall.counts.totalInvoices === 0 && afterCreate.overall.counts.totalInvoices === 1,
    afterDelete.overall.counts,
  )
}

{
  const payrollSrc = readFileSync(join(ROOT, 'src/utils/payrollEngine.js'), 'utf8')
  const commissionSrc = readFileSync(join(ROOT, 'src/utils/officialCommissionRules.js'), 'utf8')
  const engineSrc = readFileSync(join(ROOT, 'src/utils/employeeKpiEngine.js'), 'utf8')
  check(
    30,
    'Engine KPI không đụng payroll/commission',
    !engineSrc.includes('payrollEngine') && !engineSrc.includes('PAYROLL_ADJUSTMENT') && !engineSrc.includes('officialCommissionRules'),
    { payrollBytes: payrollSrc.length, commissionBytes: commissionSrc.length },
  )
}

{
  const { policies, log } = appendKpiPolicyVersion({
    existing: [],
    logs: [],
    branchId: 'soc-trang',
    effectiveFrom: '2026-08-01',
    targets: { addon: 0.7, advanced: 0.1, combo: 0.3, requested: 0.2 },
    actorId: 'admin',
    reason: 'seed',
  })
  const second = appendKpiPolicyVersion({
    existing: policies,
    logs: [log],
    branchId: 'soc-trang',
    effectiveFrom: '2026-08-15',
    targets: { addon: 0.6, advanced: 0.1, combo: 0.3, requested: 0.2 },
    actorId: 'admin',
    reason: 'mid-month',
  })
  const closed = second.policies.find((p) => p.id === policies[0].id)
  check(
    'P1',
    'Policy versioned: policy cũ kết thúc trước effective_from mới',
    closed.effectiveTo === '2026-08-14' && closed.status === 'superseded' && second.policies.length === 2,
    { closed, log: second.log },
  )
}

{
  const scope = computeScopeKpi([
    inv({ id: 's1', services: [line('body-60'), line('phong-don')] }),
  ])
  check('P2', 'Phòng đơn trong ADDON system', scope.system.counts.addon === 1, scope.system.counts)
}

mkdirSync(dirname(OUT), { recursive: true })
const failed = results.filter((r) => !r.pass)
writeFileSync(OUT, JSON.stringify({ passed: failed.length === 0, failed: failed.length, results }, null, 2))
console.log(`\n${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length} → ${OUT}`)
if (failed.length) process.exit(1)
