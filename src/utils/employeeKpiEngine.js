import {
  KPI_GROUPS,
  KPI_PENALTY_EFFECTIVE_FROM,
  KPI_PENALTY_KEYS,
  KPI_PENALTY_PER_MISSING,
  KPI_STATUS,
  isKpiExcludedBranch,
  isKpiScopeBranch,
} from '../constants/kpiPolicy'
import { classifyKpiServiceLine, isKpiMain90Line } from './kpiServiceClassifier'

const EPS = 1e-9

function parseOptionalTarget(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function invoiceDate(invoice) {
  return String(invoice?.date || '').slice(0, 10)
}

function invoiceBranchId(invoice) {
  return invoice?.branchId || invoice?.branch_id || ''
}

function invoiceEmployeeId(invoice) {
  return invoice?.employeeId || invoice?.employee_id || ''
}

function isCustomerRequested(invoice) {
  return Boolean(invoice?.customerRequested ?? invoice?.customer_requested)
}

function invoiceServices(invoice) {
  if (Array.isArray(invoice?.services) && invoice.services.length) return invoice.services
  if (Array.isArray(invoice?.serviceIds)) {
    return invoice.serviceIds.map((id) => ({ serviceId: id, id }))
  }
  return []
}

export function dateInPolicyRange(date, policy) {
  const d = String(date || '').slice(0, 10)
  const from = String(policy?.effectiveFrom || policy?.effective_from || '').slice(0, 10)
  const to = policy?.effectiveTo ?? policy?.effective_to
  if (!d || !from) return false
  if (d < from) return false
  if (to == null || to === '') return true
  return d <= String(to).slice(0, 10)
}

export function resolveKpiPolicy(branchId, date, policies = []) {
  if (isKpiExcludedBranch(branchId)) {
    return {
      applicable: false,
      status: KPI_STATUS.NOT_APPLICABLE,
      source: 'excluded',
      branchId,
      targets: null,
      policy: null,
    }
  }
  if (!isKpiScopeBranch(branchId)) {
    return {
      applicable: false,
      status: KPI_STATUS.NOT_APPLICABLE,
      source: 'out-of-scope',
      branchId,
      targets: null,
      policy: null,
    }
  }
  const matches = (policies || []).filter(
    (p) => (p.branchId || p.branch_id) === branchId && dateInPolicyRange(date, p),
  )
  matches.sort((a, b) => String(b.effectiveFrom || b.effective_from).localeCompare(String(a.effectiveFrom || a.effective_from)))
  const policy = matches[0] || null
  if (policy) {
    return {
      applicable: true,
      status: 'APPLICABLE',
      source: 'versioned',
      branchId,
      policyId: policy.id,
      effectiveFrom: policy.effectiveFrom || policy.effective_from,
      effectiveTo: policy.effectiveTo ?? policy.effective_to ?? null,
      targets: {
        addon: Number(policy.addonTarget ?? policy.addon_target),
        advanced: Number(policy.advancedTarget ?? policy.advanced_target),
        combo: Number(policy.comboTarget ?? policy.combo_target),
        requested: Number(policy.requestedTarget ?? policy.requested_target),
        duration90: parseOptionalTarget(policy.duration90Target ?? policy.duration90_target),
      },
      policy,
    }
  }
  // Không giả DEFAULT 70/10/30/20 — raw counts vẫn đếm, status = NO_POLICY.
  return {
    applicable: true,
    status: KPI_STATUS.NO_POLICY,
    source: 'none',
    branchId,
    policyId: `none:${branchId}`,
    effectiveFrom: null,
    effectiveTo: null,
    targets: null,
    policy: null,
  }
}

export function missingServiceLines(actual, main, target) {
  if (!(main > 0)) return null
  const t = Number(target)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.ceil(main * t - actual - EPS))
}

/**
 * Số HĐ requested tối thiểu cần thêm (cùng tăng N và R) để (R+x)/(N+x) >= t.
 * t = 1: nếu R < N thì không thể (trả Infinity bị cấm) → missing = null, status handled separately.
 */
export function missingRequestedInvoices(requested, total, target) {
  const N = Number(total) || 0
  const R = Number(requested) || 0
  const t = Number(target)
  if (!(N > 0)) return null
  if (!Number.isFinite(t) || t < 0) return null
  if (t >= 1) {
    return R >= N ? 0 : null
  }
  return Math.max(0, Math.ceil((t * N - R) / (1 - t) - EPS))
}

export function bruteForceRequestedMissing(requested, total, target) {
  const N = Number(total) || 0
  const R = Number(requested) || 0
  const t = Number(target)
  if (!(N > 0) || !Number.isFinite(t) || t < 0) return null
  if (t >= 1) return R >= N ? 0 : null
  for (let x = 0; x <= N * 20 + 5; x += 1) {
    if ((R + x) / (N + x) + EPS >= t) return x
  }
  return null
}

function emptyCounts() {
  return {
    main: 0,
    addon: 0,
    advanced: 0,
    combo: 0,
    duration90: 0,
    unmapped: 0,
    totalInvoices: 0,
    requestedInvoices: 0,
  }
}

function addCounts(a, b) {
  return {
    main: a.main + b.main,
    addon: a.addon + b.addon,
    advanced: a.advanced + b.advanced,
    combo: a.combo + b.combo,
    duration90: a.duration90 + b.duration90,
    unmapped: a.unmapped + b.unmapped,
    totalInvoices: a.totalInvoices + b.totalInvoices,
    requestedInvoices: a.requestedInvoices + b.requestedInvoices,
  }
}

function evaluateRatioKpi({ actual, main, target, kind }) {
  if (!(main > 0)) {
    return {
      kind,
      actual,
      main,
      rate: null,
      target,
      status: KPI_STATUS.INSUFFICIENT_DATA,
      missing: null,
    }
  }
  const rate = actual / main
  const missing = missingServiceLines(actual, main, target)
  return {
    kind,
    actual,
    main,
    rate,
    target,
    status: missing === 0 ? KPI_STATUS.MET : KPI_STATUS.NOT_MET,
    missing,
  }
}

function evaluateRequestedKpi({ requested, total, target }) {
  if (!(total > 0)) {
    return {
      kind: 'requested',
      actual: requested,
      total,
      rate: null,
      target,
      status: KPI_STATUS.INSUFFICIENT_DATA,
      missing: null,
    }
  }
  const t = Number(target)
  if (t >= 1) {
    const met = requested >= total
    return {
      kind: 'requested',
      actual: requested,
      total,
      rate: requested / total,
      target: t,
      status: met ? KPI_STATUS.MET : KPI_STATUS.NOT_MET,
      missing: met ? 0 : null,
      note: met ? '' : 'target=1 cannot be closed by adding mixed invoices; missing is undefined (no Infinity)',
    }
  }
  const rate = requested / total
  const missing = missingRequestedInvoices(requested, total, t)
  return {
    kind: 'requested',
    actual: requested,
    total,
    rate,
    target: t,
    status: missing === 0 ? KPI_STATUS.MET : KPI_STATUS.NOT_MET,
    missing,
  }
}

function classifyInvoiceLines(invoice) {
  const counts = emptyCounts()
  counts.totalInvoices = 1
  if (isCustomerRequested(invoice)) counts.requestedInvoices = 1
  const lines = []
  for (const line of invoiceServices(invoice)) {
    const classified = classifyKpiServiceLine(line)
    lines.push(classified)
    if (classified.group === KPI_GROUPS.MAIN) {
      counts.main += 1
      if (isKpiMain90Line(line, classified)) counts.duration90 += 1
    }
    else if (classified.group === KPI_GROUPS.ADDON) counts.addon += 1
    else if (classified.group === KPI_GROUPS.ADVANCED) counts.advanced += 1
    else if (classified.group === KPI_GROUPS.COMBO) counts.combo += 1
    else counts.unmapped += 1
  }
  return { counts, lines }
}

function noPolicyKpi({ actual, main, total, kind }) {
  const isRequested = kind === 'requested'
  const base = isRequested ? total : main
  return {
    kind,
    actual,
    main: isRequested ? undefined : main,
    total: isRequested ? total : undefined,
    rate: base > 0 ? actual / base : null,
    target: null,
    targets: [],
    mixedTargets: false,
    status: KPI_STATUS.NO_POLICY,
    missing: null,
    note: 'Chưa có chính sách KPI kỳ này',
  }
}

function notApplicableKpi({ actual, main, kind }) {
  return {
    kind,
    actual,
    main,
    rate: main > 0 ? actual / main : null,
    target: null,
    targets: [],
    mixedTargets: false,
    status: KPI_STATUS.NOT_APPLICABLE,
    missing: null,
    note: 'KPI không thuộc policy kỳ này',
  }
}

function evaluateSegment(counts, targets) {
  if (!targets) {
    return {
      addon: noPolicyKpi({ actual: counts.addon, main: counts.main, kind: 'addon' }),
      advanced: noPolicyKpi({ actual: counts.advanced, main: counts.main, kind: 'advanced' }),
      combo: noPolicyKpi({ actual: counts.combo, main: counts.main, kind: 'combo' }),
      requested: noPolicyKpi({
        actual: counts.requestedInvoices,
        total: counts.totalInvoices,
        kind: 'requested',
      }),
      duration90: notApplicableKpi({ actual: counts.duration90, main: counts.main, kind: 'duration90' }),
    }
  }
  const duration90Target = parseOptionalTarget(targets.duration90)
  return {
    addon: evaluateRatioKpi({ actual: counts.addon, main: counts.main, target: targets.addon, kind: 'addon' }),
    advanced: evaluateRatioKpi({ actual: counts.advanced, main: counts.main, target: targets.advanced, kind: 'advanced' }),
    combo: evaluateRatioKpi({ actual: counts.combo, main: counts.main, target: targets.combo, kind: 'combo' }),
    requested: evaluateRequestedKpi({
      requested: counts.requestedInvoices,
      total: counts.totalInvoices,
      target: targets.requested,
    }),
    duration90: duration90Target == null
      ? notApplicableKpi({ actual: counts.duration90, main: counts.main, kind: 'duration90' })
      : evaluateRatioKpi({
        actual: counts.duration90,
        main: counts.main,
        target: duration90Target,
        kind: 'duration90',
      }),
  }
}

function uniqueTargets(segments, key) {
  return [...new Set(
    segments
      .filter((s) => s.targets && s.targets[key] != null && Number.isFinite(Number(s.targets[key])))
      .map((s) => s.targets[key]),
  )]
}

function aggregateKpiAcrossSegments(segments, kpiKey, countsKey) {
  const applicable = segments.filter((s) => s.kpis[kpiKey].status !== KPI_STATUS.NOT_APPLICABLE)
  if (applicable.length === 0) {
    const totalActual = segments.reduce((sum, s) => {
      if (kpiKey === 'requested') return sum + s.counts.requestedInvoices
      return sum + (s.counts[countsKey] || 0)
    }, 0)
    const totalBase = segments.reduce((sum, s) => {
      if (kpiKey === 'requested') return sum + s.counts.totalInvoices
      return sum + s.counts.main
    }, 0)
    const noInvoices = segments.length === 0
    return {
      kind: kpiKey,
      actual: totalActual,
      main: kpiKey === 'requested' ? undefined : totalBase,
      total: kpiKey === 'requested' ? totalBase : undefined,
      rate: totalBase > 0 ? totalActual / totalBase : null,
      targets: [],
      mixedTargets: false,
      status: noInvoices ? KPI_STATUS.INSUFFICIENT_DATA : KPI_STATUS.NOT_APPLICABLE,
      missing: null,
      aggregateAlgorithm: 'employee-blended',
      note: noInvoices ? '' : 'KPI không thuộc policy kỳ này',
    }
  }
  const totalActual = applicable.reduce((sum, s) => {
    if (kpiKey === 'requested') return sum + s.counts.requestedInvoices
    return sum + s.counts[countsKey]
  }, 0)
  const totalBase = applicable.reduce((sum, s) => {
    if (kpiKey === 'requested') return sum + s.counts.totalInvoices
    return sum + s.counts.main
  }, 0)
  const rate = totalBase > 0 ? totalActual / totalBase : null

  const withPolicy = applicable.filter((s) => s.kpis[kpiKey].status !== KPI_STATUS.NO_POLICY)
  if (applicable.length > 0 && withPolicy.length === 0) {
    return {
      kind: kpiKey,
      actual: totalActual,
      main: kpiKey === 'requested' ? undefined : totalBase,
      total: kpiKey === 'requested' ? totalBase : undefined,
      rate,
      targets: [],
      mixedTargets: false,
      status: KPI_STATUS.NO_POLICY,
      missing: null,
      aggregateAlgorithm: 'per-segment-obligation',
      note: 'Chưa có chính sách KPI kỳ này',
    }
  }

  const targets = uniqueTargets(withPolicy.length ? withPolicy : applicable, kpiKey === 'requested' ? 'requested' : kpiKey)
  const mixedTargets = targets.length > 1
  const evaluable = withPolicy.filter((s) => s.kpis[kpiKey].status !== KPI_STATUS.INSUFFICIENT_DATA)

  if (withPolicy.length === 0 || evaluable.length === 0) {
    return {
      kind: kpiKey,
      actual: totalActual,
      main: kpiKey === 'requested' ? undefined : totalBase,
      total: kpiKey === 'requested' ? totalBase : undefined,
      rate,
      targets,
      mixedTargets,
      status: KPI_STATUS.INSUFFICIENT_DATA,
      missing: null,
      aggregateAlgorithm: mixedTargets ? 'per-segment-obligation' : 'employee-blended',
    }
  }

  // Target khác nhau giữa CN: không average. Vẫn đánh giá từng segment rồi cộng missing.
  if (mixedTargets) {
    const missingSum = evaluable.reduce((sum, s) => {
      const m = s.kpis[kpiKey].missing
      return sum + (m == null ? 0 : m)
    }, 0)
    const anyNotMet = evaluable.some((s) => s.kpis[kpiKey].status === KPI_STATUS.NOT_MET)
    return {
      kind: kpiKey,
      actual: totalActual,
      main: kpiKey === 'requested' ? undefined : totalBase,
      total: kpiKey === 'requested' ? totalBase : undefined,
      rate,
      targets,
      mixedTargets: true,
      informationalBlendedTarget: null,
      status: anyNotMet ? KPI_STATUS.NOT_MET : KPI_STATUS.MET,
      missing: missingSum,
      aggregateAlgorithm: 'per-segment-obligation',
      note: 'Không lấy trung bình target %. Đánh giá từng segment rồi cộng missing; MET overall chỉ khi mọi segment có dữ liệu đều MET.',
    }
  }

  // Cùng target: gộp toàn bộ activity employeeId trong kỳ rồi tính MỘT bộ missing.
  const blendedCounts = withPolicy.reduce((acc, s) => addCounts(acc, s.counts), emptyCounts())
  const evaluated = kpiKey === 'requested'
    ? evaluateRequestedKpi({
      requested: blendedCounts.requestedInvoices,
      total: blendedCounts.totalInvoices,
      target: targets[0],
    })
    : evaluateRatioKpi({
      actual: blendedCounts[countsKey],
      main: blendedCounts.main,
      target: targets[0],
      kind: kpiKey,
    })

  return {
    ...evaluated,
    actual: totalActual,
    main: kpiKey === 'requested' ? undefined : totalBase,
    total: kpiKey === 'requested' ? totalBase : undefined,
    rate,
    targets,
    mixedTargets: false,
    informationalBlendedTarget: targets[0],
    aggregateAlgorithm: 'employee-blended',
    note: '',
  }
}

export function kpiMissingBreakdown(kpis = {}) {
  const breakdown = {}
  let totalMissing = 0
  for (const key of KPI_PENALTY_KEYS) {
    const kpi = kpis[key] || {}
    const missingCharged = kpi.missing == null ? 0 : Number(kpi.missing) || 0
    breakdown[key] = {
      actual: kpi.actual ?? 0,
      main: kpi.main,
      total: kpi.total,
      target: kpi.target ?? kpi.informationalBlendedTarget ?? null,
      status: kpi.status || null,
      missing: kpi.missing ?? null,
      missingCharged,
    }
    totalMissing += missingCharged
  }
  return { breakdown, totalMissing }
}

export function computeKpiPenaltyFromModel(model, { fromDate, toDate } = {}) {
  const periodTo = String(toDate || model?.toDate || '').slice(0, 10)
  const applied = Boolean(periodTo && periodTo >= KPI_PENALTY_EFFECTIVE_FROM)
  const { breakdown, totalMissing } = kpiMissingBreakdown(model?.overall?.kpis)
  return {
    applied,
    effectiveFrom: KPI_PENALTY_EFFECTIVE_FROM,
    unit: KPI_PENALTY_PER_MISSING,
    rawTotalMissing: totalMissing,
    totalMissing: applied ? totalMissing : 0,
    kpiPenalty: applied ? totalMissing * KPI_PENALTY_PER_MISSING : 0,
    breakdown,
  }
}

export function computeEmployeeKpiPenalty(invoices = [], options = {}) {
  const model = computeEmployeeKpi(invoices, options)
  return {
    model,
    ...computeKpiPenaltyFromModel(model, options),
  }
}

/**
 * Engine thuần: KPI = f(invoices live). Không cache aggregate.
 *
 * Attribution: invoice.employeeId only.
 * Policy: invoice.branchId (phục vụ) + invoice.date.
 */
export function computeEmployeeKpi(invoices = [], {
  employeeId,
  fromDate = '',
  toDate = '',
  policies = [],
} = {}) {
  const servingBranchMap = new Map()
  const policySegmentMap = new Map()
  let excludedGiaLaiInvoices = 0
  let excludedOutOfScopeInvoices = 0
  let skippedOtherEmployee = 0
  const unmappedLines = []
  const includedInvoices = []

  for (const invoice of invoices) {
    const date = invoiceDate(invoice)
    if (fromDate && date < fromDate) continue
    if (toDate && date > toDate) continue
    const branchId = invoiceBranchId(invoice)
    if (isKpiExcludedBranch(branchId)) {
      excludedGiaLaiInvoices += 1
      continue
    }
    if (!isKpiScopeBranch(branchId)) {
      excludedOutOfScopeInvoices += 1
      continue
    }
    if (invoiceEmployeeId(invoice) !== employeeId) {
      skippedOtherEmployee += 1
      continue
    }

    const resolved = resolveKpiPolicy(branchId, date, policies)
    const { counts, lines } = classifyInvoiceLines(invoice)
    for (const line of lines) {
      if (line.group === KPI_GROUPS.UNMAPPED) {
        unmappedLines.push({ invoiceId: invoice.id, branchId, date, ...line })
      }
    }

    includedInvoices.push({
      invoiceId: invoice.id,
      employeeId,
      branchId,
      date,
      customerRequested: isCustomerRequested(invoice),
      services: invoiceServices(invoice),
      classified: lines,
    })

    const branchKey = branchId
    if (!servingBranchMap.has(branchKey)) {
      servingBranchMap.set(branchKey, {
        servingBranchId: branchId,
        counts: emptyCounts(),
        invoiceIds: [],
      })
    }
    const branchSeg = servingBranchMap.get(branchKey)
    branchSeg.counts = addCounts(branchSeg.counts, counts)
    branchSeg.invoiceIds.push(invoice.id)

    const policyKey = `${branchId}::${resolved.policyId}`
    if (!policySegmentMap.has(policyKey)) {
      policySegmentMap.set(policyKey, {
        servingBranchId: branchId,
        policyId: resolved.policyId,
        source: resolved.source,
        effectiveFrom: resolved.effectiveFrom,
        effectiveTo: resolved.effectiveTo,
        targets: resolved.targets,
        counts: emptyCounts(),
        invoiceIds: [],
      })
    }
    const pSeg = policySegmentMap.get(policyKey)
    pSeg.counts = addCounts(pSeg.counts, counts)
    pSeg.invoiceIds.push(invoice.id)
  }

  const policySegments = [...policySegmentMap.values()].map((seg) => ({
    ...seg,
    kpis: evaluateSegment(seg.counts, seg.targets),
  }))

  const servingBranchSegments = [...servingBranchMap.values()].map((seg) => {
    const related = policySegments.filter((p) => p.servingBranchId === seg.servingBranchId)
    const mixed = uniqueTargets(related, 'addon').length > 1
      || uniqueTargets(related, 'advanced').length > 1
      || uniqueTargets(related, 'combo').length > 1
      || uniqueTargets(related, 'requested').length > 1
      || uniqueTargets(related, 'duration90').length > 1
    const kpis = mixed
      ? {
          addon: aggregateKpiAcrossSegments(related, 'addon', 'addon'),
          advanced: aggregateKpiAcrossSegments(related, 'advanced', 'advanced'),
          combo: aggregateKpiAcrossSegments(related, 'combo', 'combo'),
          requested: aggregateKpiAcrossSegments(related, 'requested', 'requestedInvoices'),
          duration90: aggregateKpiAcrossSegments(related, 'duration90', 'duration90'),
        }
      : evaluateSegment(seg.counts, related[0]?.targets ?? null)
    return {
      ...seg,
      mixedPolicyTargets: mixed,
      kpis,
    }
  })

  const overallCounts = policySegments.reduce((acc, seg) => addCounts(acc, seg.counts), emptyCounts())
  const overallKpis = {
    addon: aggregateKpiAcrossSegments(policySegments, 'addon', 'addon'),
    advanced: aggregateKpiAcrossSegments(policySegments, 'advanced', 'advanced'),
    combo: aggregateKpiAcrossSegments(policySegments, 'combo', 'combo'),
    requested: aggregateKpiAcrossSegments(policySegments, 'requested', 'requestedInvoices'),
    duration90: aggregateKpiAcrossSegments(policySegments, 'duration90', 'duration90'),
  }
  const overall = {
    counts: overallCounts,
    kpis: overallKpis,
    aggregateAlgorithm: Object.values(overallKpis).some((kpi) => kpi?.mixedTargets)
      ? 'mixed-targets-per-segment'
      : 'employee-blended',
  }

  const result = {
    employeeId,
    fromDate,
    toDate,
    overall,
    servingBranchSegments,
    policySegments,
    unmappedLines,
    includedInvoices,
    excludedGiaLaiInvoices,
    excludedOutOfScopeInvoices,
    skippedOtherEmployee,
  }
  return {
    ...result,
    penalty: computeKpiPenaltyFromModel(result),
  }
}

export function computeScopeKpi(invoices = [], options = {}) {
  const { fromDate = '', toDate = '', policies = [] } = options
  const byEmployee = new Map()
  const byBranch = new Map()
  let excludedGiaLaiInvoices = 0
  let excludedOutOfScopeInvoices = 0

  for (const invoice of invoices) {
    const date = invoiceDate(invoice)
    if (fromDate && date < fromDate) continue
    if (toDate && date > toDate) continue
    const branchId = invoiceBranchId(invoice)
    if (isKpiExcludedBranch(branchId)) {
      excludedGiaLaiInvoices += 1
      continue
    }
    if (!isKpiScopeBranch(branchId)) {
      excludedOutOfScopeInvoices += 1
      continue
    }
    const employeeId = invoiceEmployeeId(invoice)
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, [])
    byEmployee.get(employeeId).push(invoice)
    if (!byBranch.has(branchId)) byBranch.set(branchId, [])
    byBranch.get(branchId).push(invoice)
  }

  const employees = [...byEmployee.keys()].map((employeeId) =>
    computeEmployeeKpi(byEmployee.get(employeeId), { employeeId, fromDate, toDate, policies }),
  )

  const branches = [...byBranch.entries()].map(([branchId, list]) => {
    const employeeIds = [...new Set(list.map(invoiceEmployeeId))]
    const empModels = employeeIds.map((employeeId) =>
      computeEmployeeKpi(list, { employeeId, fromDate, toDate, policies }),
    )
    const counts = empModels.reduce((acc, m) => addCounts(acc, m.overall.counts), emptyCounts())
    return {
      branchId,
      counts,
      employeeCount: empModels.length,
      employeesMet: {
        addon: empModels.filter((m) => m.overall.kpis.addon.status === KPI_STATUS.MET).length,
        advanced: empModels.filter((m) => m.overall.kpis.advanced.status === KPI_STATUS.MET).length,
        combo: empModels.filter((m) => m.overall.kpis.combo.status === KPI_STATUS.MET).length,
        requested: empModels.filter((m) => m.overall.kpis.requested.status === KPI_STATUS.MET).length,
        duration90: empModels.filter((m) => m.overall.kpis.duration90?.status === KPI_STATUS.MET).length,
      },
    }
  })

  const systemCounts = employees.reduce((acc, m) => addCounts(acc, m.overall.counts), emptyCounts())

  return {
    fromDate,
    toDate,
    system: {
      counts: systemCounts,
      rates: {
        addon: systemCounts.main ? systemCounts.addon / systemCounts.main : null,
        advanced: systemCounts.main ? systemCounts.advanced / systemCounts.main : null,
        combo: systemCounts.main ? systemCounts.combo / systemCounts.main : null,
        duration90: systemCounts.main ? systemCounts.duration90 / systemCounts.main : null,
        requested: systemCounts.totalInvoices
          ? systemCounts.requestedInvoices / systemCounts.totalInvoices
          : null,
      },
      employeesMet: {
        addon: employees.filter((m) => m.overall.kpis.addon.status === KPI_STATUS.MET).length,
        advanced: employees.filter((m) => m.overall.kpis.advanced.status === KPI_STATUS.MET).length,
        combo: employees.filter((m) => m.overall.kpis.combo.status === KPI_STATUS.MET).length,
        requested: employees.filter((m) => m.overall.kpis.requested.status === KPI_STATUS.MET).length,
        duration90: employees.filter((m) => m.overall.kpis.duration90?.status === KPI_STATUS.MET).length,
      },
      employeeCount: employees.length,
      missingTotals: {
        addon: employees.reduce((s, m) => s + (m.overall.kpis.addon.missing || 0), 0),
        advanced: employees.reduce((s, m) => s + (m.overall.kpis.advanced.missing || 0), 0),
        combo: employees.reduce((s, m) => s + (m.overall.kpis.combo.missing || 0), 0),
        requested: employees.reduce((s, m) => s + (m.overall.kpis.requested.missing || 0), 0),
        duration90: employees.reduce((s, m) => s + (m.overall.kpis.duration90?.missing || 0), 0),
      },
    },
    branches,
    employees,
    excludedGiaLaiInvoices,
    excludedOutOfScopeInvoices,
  }
}

export function validatePolicyTargets(targets = {}) {
  const keys = ['addon', 'advanced', 'combo', 'requested']
  for (const key of keys) {
    const v = Number(targets[key])
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return { ok: false, error: `${key} must be decimal in [0, 1], got ${targets[key]}` }
    }
  }
  if (targets.duration90 != null && targets.duration90 !== '') {
    const v = Number(targets.duration90)
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      return { ok: false, error: `duration90 must be decimal in [0, 1], got ${targets.duration90}` }
    }
  }
  return { ok: true }
}

export function assertNoPolicyOverlap(policies = []) {
  const byBranch = new Map()
  for (const p of policies) {
    const branchId = p.branchId || p.branch_id
    if (!byBranch.has(branchId)) byBranch.set(branchId, [])
    byBranch.get(branchId).push(p)
  }
  for (const [branchId, list] of byBranch) {
    const ranges = list.map((p) => ({
      id: p.id,
      from: String(p.effectiveFrom || p.effective_from).slice(0, 10),
      to: p.effectiveTo ?? p.effective_to ?? '9999-12-31',
    }))
    ranges.sort((a, b) => a.from.localeCompare(b.from))
    for (let i = 1; i < ranges.length; i += 1) {
      const prev = ranges[i - 1]
      const cur = ranges[i]
      if (cur.from <= prev.to) {
        return {
          ok: false,
          error: `Overlap ${branchId}: ${prev.id} [${prev.from}..${prev.to}] vs ${cur.id} [${cur.from}..${cur.to}]`,
        }
      }
    }
  }
  return { ok: true }
}

export function closePreviousPolicy(existingPolicies, nextPolicy) {
  const branchId = nextPolicy.branchId
  const nextFrom = String(nextPolicy.effectiveFrom).slice(0, 10)
  const prevDay = addDaysIso(nextFrom, -1)
  return existingPolicies.map((p) => {
    if ((p.branchId || p.branch_id) !== branchId) return p
    const open = p.effectiveTo == null || p.effective_to == null || p.effectiveTo === ''
    const from = String(p.effectiveFrom || p.effective_from).slice(0, 10)
    if (open && from < nextFrom) {
      return {
        ...p,
        effectiveTo: prevDay,
        status: 'superseded',
      }
    }
    return p
  })
}

function addDaysIso(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}
