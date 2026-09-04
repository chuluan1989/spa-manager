/**
 * KPI penalty per pay-cycle — fixture only. Không ghi Production.
 *
 *   npx vite-node scripts/check-kpi-penalty-period.mjs
 */
import './_polyfill-storage.mjs'
import { KPI_SCOPE_BRANCH_IDS, SEP2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'
import { computeEmployeePayrollRow, computeNetSalary } from '../src/utils/payrollEngine.js'
import {
  computeEmployeeKpi,
  computeKpiPenaltyFromModel,
  missingServiceLines,
} from '../src/utils/employeeKpiEngine.js'

function line(serviceId) {
  return { serviceId, serviceName: serviceId }
}

function inv(partial) {
  return {
    id: partial.id,
    date: partial.date || '2026-09-05',
    branchId: partial.branchId || 'soc-trang',
    employeeId: partial.employeeId || 'emp-a',
    supportEmployeeId: partial.supportEmployeeId || '',
    customerRequested: Boolean(partial.customerRequested),
    services: partial.services,
  }
}

const sepPolicies = KPI_SCOPE_BRANCH_IDS.map((branchId) => ({
  id: `sep-${branchId}`,
  branchId,
  effectiveFrom: '2026-09-01',
  addonTarget: SEP2026_KPI_TARGETS.addon,
  advancedTarget: SEP2026_KPI_TARGETS.advanced,
  comboTarget: SEP2026_KPI_TARGETS.combo,
  requestedTarget: SEP2026_KPI_TARGETS.requested,
  duration90Target: SEP2026_KPI_TARGETS.duration90,
}))

function kpisOf(invoices, extra = {}) {
  return computeEmployeeKpi(invoices, {
    employeeId: extra.employeeId || 'emp-a',
    homeBranchId: extra.homeBranchId || '',
    fromDate: extra.fromDate || '2026-09-01',
    toDate: extra.toDate || '2026-09-15',
    policies: extra.policies || sepPolicies,
  })
}

const results = []
function check(name, pass, detail = {}) {
  results.push({ name, pass: Boolean(pass), detail })
  if (!pass) console.error(`FAIL ${name}`, detail)
  else console.log(`PASS ${name}`)
}

{
  const invoices = [
    ...Array.from({ length: 7 }, (_, i) => inv({
      id: `m${i}`,
      services: [line('body-60'), line('goi-sach')],
    })),
    ...Array.from({ length: 3 }, (_, i) => inv({
      id: `c${i}`,
      services: [line('body-90'), line('combo-1')],
    })),
  ]
  const model = kpisOf(invoices)
  const kpis = model.overall.kpis
  const penalty = computeKpiPenaltyFromModel(model)
  const beforeRequested = (kpis.addon.missing || 0)
    + (kpis.advanced.missing || 0)
    + (kpis.combo.missing || 0)
    + (kpis.duration90.missing || 0)
  check(
    'Kỳ 1 fixture: MAIN=10 Addon=7 CS=0 Combo=3 Body90=3 → thiếu 3 / 150k trước khách YC',
    model.overall.counts.main === 10
      && model.overall.counts.addon === 7
      && model.overall.counts.advanced === 0
      && model.overall.counts.combo === 3
      && model.overall.counts.duration90 === 3
      && kpis.addon.missing === 1
      && kpis.advanced.missing === 2
      && kpis.combo.missing === 0
      && kpis.duration90.missing === 0
      && beforeRequested === 3
      && penalty.kpiPenalty === 150_000 + (kpis.requested.missing || 0) * 50_000
      && missingServiceLines(7, 10, 0.8) === 1
      && missingServiceLines(0, 10, 0.2) === 2,
    {
      counts: model.overall.counts,
      missing: {
        addon: kpis.addon.missing,
        advanced: kpis.advanced.missing,
        combo: kpis.combo.missing,
        duration90: kpis.duration90.missing,
        requested: kpis.requested.missing,
      },
      beforeRequested,
      penalty: penalty.kpiPenalty,
    },
  )
}

{
  const invoices = [
    ...Array.from({ length: 6 }, (_, i) => inv({
      id: `home-${i}`,
      branchId: 'soc-trang',
      services: [line('body-60')],
    })),
    ...Array.from({ length: 4 }, (_, i) => inv({
      id: `tour-${i}`,
      branchId: 'tram-spa',
      services: [line('body-60')],
    })),
  ]
  const model = kpisOf(invoices)
  const perHome = kpisOf(invoices.filter((row) => row.branchId === 'soc-trang'))
  const perTour = kpisOf(invoices.filter((row) => row.branchId === 'tram-spa'))
  const summedMissing = (perHome.overall.kpis.advanced.missing || 0) + (perTour.overall.kpis.advanced.missing || 0)
  check(
    'Cross-branch: MAIN nhà 6 + hỗ trợ 4 = MAIN 10, tính missing một lần',
    model.overall.counts.main === 10
      && model.servingBranchSegments.length === 2
      && model.overall.aggregateAlgorithm === 'employee-blended'
      && model.overall.kpis.advanced.missing === 2
      && summedMissing === 3,
    {
      main: model.overall.counts.main,
      blendedCsMissing: model.overall.kpis.advanced.missing,
      summedPerBranchCsMissing: summedMissing,
      algorithm: model.overall.aggregateAlgorithm,
    },
  )
}

{
  const period1 = [
    ...Array.from({ length: 10 }, (_, i) => inv({
      id: `p1-${i}`,
      date: '2026-09-05',
      services: [line('body-60'), line('goi-sach'), line('goi-sach')],
    })),
  ]
  const period2 = [
    ...Array.from({ length: 10 }, (_, i) => inv({
      id: `p2-${i}`,
      date: '2026-09-20',
      services: [line('body-60')],
    })),
    ...Array.from({ length: 6 }, (_, i) => inv({
      id: `p2-add-${i}`,
      date: '2026-09-20',
      services: [line('goi-sach')],
    })),
  ]
  const k1 = kpisOf(period1, { fromDate: '2026-09-01', toDate: '2026-09-15' })
  const k2 = kpisOf([...period1, ...period2], { fromDate: '2026-09-16', toDate: '2026-09-30' })
  const p2Penalty = computeKpiPenaltyFromModel(k2)
  check(
    'Period isolation: Kỳ 1 dư Addon không bù Kỳ 2 thiếu 2 → phạt 100k Addon',
    k1.overall.kpis.addon.missing === 0
      && k1.overall.counts.addon - Math.ceil(10 * 0.8) >= 5
      && k2.overall.counts.addon === 6
      && k2.overall.kpis.addon.missing === 2
      && p2Penalty.kpiPenalty >= 100_000,
    {
      p1Addon: k1.overall.counts.addon,
      p1AddonMissing: k1.overall.kpis.addon.missing,
      p2Addon: k2.overall.counts.addon,
      p2AddonMissing: k2.overall.kpis.addon.missing,
      p2Penalty: p2Penalty.kpiPenalty,
    },
  )
}

{
  const invoices = [
    inv({
      id: 'support-only',
      employeeId: 'emp-primary',
      supportEmployeeId: 'emp-a',
      services: [line('body-60'), line('goi-sach')],
    }),
  ]
  const asSupport = kpisOf(invoices, { employeeId: 'emp-a' })
  check(
    'Support employee không vào KPI',
    asSupport.overall.counts.totalInvoices === 0 && asSupport.skippedOtherEmployee === 1,
    asSupport.overall.counts,
  )
}

{
  const invoices = Array.from({ length: 10 }, (_, i) => inv({
    id: `aug-${i}`,
    date: '2026-08-10',
    services: [line('body-60')],
  }))
  const model = kpisOf(invoices, { fromDate: '2026-08-01', toDate: '2026-08-15' })
  const penalty = computeKpiPenaltyFromModel(model, { fromDate: '2026-08-01', toDate: '2026-08-15' })
  check(
    'Trước 01/09/2026 không phạt KPI',
    penalty.applied === false && penalty.kpiPenalty === 0,
    penalty,
  )
}

{
  const employee = { id: 'emp-a', name: 'A', branchId: 'soc-trang', salaryRate: '0' }
  const invoices = [
    ...Array.from({ length: 7 }, (_, i) => inv({
      id: `pay-${i}`,
      services: [line('body-60'), line('goi-sach')],
    })),
    ...Array.from({ length: 3 }, (_, i) => inv({
      id: `pay-c-${i}`,
      services: [line('body-90'), line('combo-1')],
    })),
  ]
  const row = computeEmployeePayrollRow(employee, invoices, [], [], {
    kpiPolicies: sepPolicies,
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    month: '2026-09',
    cycle: 'period1',
  })
  const expected = computeNetSalary({
    baseSalary: 0,
    commission: 0,
    tips: 0,
    bonus: 0,
    kpi: 0,
    kpiPenalty: row.kpiPenalty,
    reduction: 0,
    penalty: 0,
    advance: 0,
  })
  check(
    'payrollRow trừ kpiPenalty một lần, không tạo adjustment',
    row.kpiPenalty > 0
      && row.netSalary === expected
      && row.kpi === 0
      && row.penalty === 0,
    { kpiPenalty: row.kpiPenalty, net: row.netSalary, missing: row.kpiMissing },
  )
}

{
  const tramHome = { employeeId: 'emp-tram', homeBranchId: 'tram-spa' }
  const stHome = { employeeId: 'emp-st', homeBranchId: 'soc-trang' }
  const skHome = { employeeId: 'emp-sk', homeBranchId: 'song-khoe-spa' }

  const caseA = kpisOf([
    inv({
      id: 'a-thai',
      employeeId: 'emp-tram',
      branchId: 'tram-spa',
      services: [line('body-60'), line('massage-thai')],
    }),
  ], tramHome)
  check(
    'CASE A: NV Trạm + Massage Thái => Advanced +1',
    caseA.overall.counts.advanced === 1 && caseA.overall.counts.main === 1,
    caseA.overall.counts,
  )

  const caseB = kpisOf([
    inv({
      id: 'b-cs',
      employeeId: 'emp-tram',
      branchId: 'soc-trang',
      services: [line('body-60'), line('chuyen-sau')],
    }),
  ], tramHome)
  check(
    'CASE B: NV Trạm tour ST + Chuyên sâu => Advanced +1',
    caseB.overall.counts.advanced === 1 && caseB.overall.counts.main === 1,
    caseB.overall.counts,
  )

  const caseC = kpisOf([
    inv({
      id: 'c-thai',
      employeeId: 'emp-st',
      branchId: 'tram-spa',
      services: [line('body-60'), line('massage-thai')],
    }),
  ], stHome)
  check(
    'CASE C: NV ST tour Trạm + Massage Thái => Advanced +1',
    caseC.overall.counts.advanced === 1 && caseC.overall.counts.main === 1,
    caseC.overall.counts,
  )

  const caseD = kpisOf([
    inv({
      id: 'd-thai',
      employeeId: 'emp-sk',
      branchId: 'tram-spa',
      services: [line('body-60'), line('massage-thai')],
    }),
  ], skHome)
  check(
    'CASE D: NV Sống Khoẻ tour Trạm + Massage Thái => Advanced +1',
    caseD.overall.counts.advanced === 1 && caseD.overall.counts.main === 1,
    caseD.overall.counts,
  )

  const caseE = kpisOf([
    inv({
      id: 'e-cs',
      employeeId: 'emp-tram',
      branchId: 'song-khoe-spa',
      services: [line('body-60'), line('chuyen-sau')],
    }),
  ], tramHome)
  check(
    'CASE E: NV Trạm tour Sống Khoẻ + Chuyên sâu => Advanced +1',
    caseE.overall.counts.advanced === 1 && caseE.overall.counts.main === 1,
    caseE.overall.counts,
  )

  const caseF = kpisOf([
    inv({
      id: 'f-alias',
      employeeId: 'emp-tram',
      branchId: 'tram-spa',
      services: [{ serviceId: 'massage-thai', serviceName: 'Chuyên sâu' }],
    }),
  ], tramHome)
  check(
    'CASE F: Một service line không double-count (id Thái + tên Chuyên sâu => +1)',
    caseF.overall.counts.advanced === 1 && caseF.includedInvoices[0].classified.length === 1,
    { counts: caseF.overall.counts, classified: caseF.includedInvoices[0].classified },
  )

  const caseG = kpisOf([
    inv({
      id: 'g-home',
      employeeId: 'emp-tram',
      branchId: 'tram-spa',
      services: [line('body-60')],
    }),
    inv({
      id: 'g-tour',
      employeeId: 'emp-tram',
      branchId: 'soc-trang',
      services: [line('body-60')],
    }),
  ], tramHome)
  const perHome = kpisOf([
    inv({
      id: 'g-home',
      employeeId: 'emp-tram',
      branchId: 'tram-spa',
      services: [line('body-60')],
    }),
  ], tramHome)
  const perTour = kpisOf([
    inv({
      id: 'g-tour',
      employeeId: 'emp-tram',
      branchId: 'soc-trang',
      services: [line('body-60')],
    }),
  ], tramHome)
  const summed = (perHome.overall.kpis.advanced.missing || 0) + (perTour.overall.kpis.advanced.missing || 0)
  check(
    'CASE G: Cross-branch gộp employeeId trước khi missing',
    caseG.overall.counts.main === 2
      && caseG.servingBranchSegments.length === 2
      && caseG.overall.kpis.advanced.missing === 1
      && summed === 2,
    {
      blended: caseG.overall.kpis.advanced.missing,
      summed,
      algorithm: caseG.overall.aggregateAlgorithm,
    },
  )

  const outerHomes = [
    { id: 'emp-tv', home: 'tra-vinh' },
    { id: 'emp-bl', home: 'bac-lieu' },
    { id: 'emp-vl', home: 'vinh-long' },
  ]
  const outerOk = outerHomes.every(({ id, home }) => {
    const thai = kpisOf([
      inv({
        id: `${id}-thai`,
        employeeId: id,
        branchId: home,
        services: [line('body-60'), line('massage-thai')],
      }),
    ], { employeeId: id, homeBranchId: home })
    const cs = kpisOf([
      inv({
        id: `${id}-cs`,
        employeeId: id,
        branchId: home,
        services: [line('body-60'), line('chuyen-sau')],
      }),
    ], { employeeId: id, homeBranchId: home })
    return thai.overall.counts.advanced === 0 && cs.overall.counts.advanced === 1
  })
  check(
    'CASE H: Trà Vinh / Bạc Liêu / Vĩnh Long giữ Chuyên sâu, không map Massage Thái',
    outerOk,
    { outerHomes },
  )
}

const failed = results.filter((row) => !row.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
