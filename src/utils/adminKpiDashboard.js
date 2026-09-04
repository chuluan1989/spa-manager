import { KPI_SCOPE_BRANCH_IDS, KPI_STATUS } from '../constants/kpiPolicy'
import { computeEmployeeKpi } from './employeeKpiEngine'
import {
  EMPLOYEE_KPI_CARD_DEFS,
  buildKpiCardModel,
  formatKpiPercent,
  formatTargetPercent,
  resolveDisplayTarget,
  summarizeOverallKpis,
} from './employeeKpiView'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'

function avg(nums) {
  const list = nums.filter((n) => n != null && Number.isFinite(n))
  if (!list.length) return null
  return list.reduce((a, b) => a + b, 0) / list.length
}

export function buildAdminEmployeeKpiRow(model, { homeBranchId = '', homeBranchName = '', employeeName = '' } = {}) {
  const summary = summarizeOverallKpis(model?.overall)
  const cards = Object.fromEntries(summary.cards.map((c) => [c.key, c]))
  const counts = model?.overall?.counts || {}
  let rowStatus = 'NOT_MET'
  if (summary.noPolicy) rowStatus = 'NO_POLICY'
  else if (summary.allMet) rowStatus = 'MET'
  else if (summary.cards.some((c) => c.status === KPI_STATUS.INSUFFICIENT_DATA) && counts.main === 0) {
    rowStatus = 'INSUFFICIENT_DATA'
  } else if (counts.totalInvoices === 0) {
    rowStatus = 'INSUFFICIENT_DATA'
  }

  return {
    employeeId: model.employeeId,
    employeeName: employeeName || model.employeeId,
    homeBranchId,
    homeBranchName: homeBranchName || getBranchName(homeBranchId) || homeBranchId || '—',
    servingBranchIds: (model.servingBranchSegments || []).map((s) => s.servingBranchId),
    servingBranchNames: (model.servingBranchSegments || []).map(
      (s) => getBranchName(s.servingBranchId) || s.servingBranchId,
    ),
    counts,
    cards,
    met: summary.met,
    total: summary.total,
    scoreLabel: summary.noPolicy ? '—' : `Đạt ${summary.met}/${summary.total} KPI`,
    headline: summary.headline,
    rowStatus,
    rowStatusLabel:
      rowStatus === 'MET' ? `Đạt ${summary.met}/${summary.total} KPI`
        : rowStatus === 'INSUFFICIENT_DATA' ? 'Chưa đủ dữ liệu'
          : rowStatus === 'NO_POLICY' ? 'Chưa có chính sách KPI kỳ này'
            : `Đạt ${summary.met}/${summary.total} KPI`,
    model,
    totalKpiMissing: model?.penalty?.totalMissing ?? 0,
    kpiPenalty: model?.penalty?.kpiPenalty ?? 0,
    kpiPenaltyApplied: Boolean(model?.penalty?.applied),
  }
}

/**
 * Build admin dashboard from live invoices + versioned policies.
 * Attribution employeeId; home branch from employee master.
 */
export function buildAdminKpiDashboard(invoices = [], {
  fromDate = '',
  toDate = '',
  policies = [],
  employees = [],
} = {}) {
  const empIndex = new Map((employees || []).map((e) => [e.id, e]))
  const byEmployee = new Map()

  for (const inv of invoices) {
    const date = String(inv.date || '').slice(0, 10)
    if (fromDate && date < fromDate) continue
    if (toDate && date > toDate) continue
    const branchId = inv.branchId || inv.branch_id || ''
    if (!KPI_SCOPE_BRANCH_IDS.includes(branchId)) continue
    const employeeId = inv.employeeId || inv.employee_id || ''
    if (!employeeId) continue
    if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, [])
    byEmployee.get(employeeId).push(inv)
  }

  const rows = [...byEmployee.entries()].map(([employeeId, list]) => {
    const emp = empIndex.get(employeeId) || getEmployeeById(employeeId) || {}
    const model = computeEmployeeKpi(list, {
      employeeId,
      fromDate,
      toDate,
      policies,
      homeBranchId: emp.branchId || '',
      employee: emp,
    })
    return buildAdminEmployeeKpiRow(model, {
      homeBranchId: emp.branchId || '',
      homeBranchName: getBranchName(emp.branchId || '') || emp.branchName || '',
      employeeName: emp.name || list[0]?.employeeName || employeeId,
    })
  }).sort((a, b) => a.homeBranchName.localeCompare(b.homeBranchName) || a.employeeName.localeCompare(b.employeeName))

  const branches = KPI_SCOPE_BRANCH_IDS.map((branchId) => {
    // Roster CN = employee.branchId hiện tại (không dùng invoice serving)
    const branchRows = rows.filter((r) => r.homeBranchId === branchId)
    const metAll = branchRows.filter((r) => r.rowStatus === 'MET')
    return {
      branchId,
      branchName: getBranchName(branchId) || branchId,
      employeeCount: branchRows.length,
      employeesMetAll: metAll.length,
      metRate: branchRows.length ? metAll.length / branchRows.length : null,
      avgRates: {
        addon: avg(branchRows.map((r) => r.cards.addon?.rate)),
        advanced: avg(branchRows.map((r) => r.cards.advanced?.rate)),
        combo: avg(branchRows.map((r) => r.cards.combo?.rate)),
        requested: avg(branchRows.map((r) => r.cards.requested?.rate)),
        duration90: avg(branchRows.map((r) => r.cards.duration90?.rate)),
      },
      note: 'avgRates chỉ tham khảo — pass/fail theo engine segment, không average target',
    }
  }).filter((b) => b.employeeCount > 0 || true)

  const systemCounts = rows.reduce((acc, r) => ({
    main: acc.main + (r.counts.main || 0),
    addon: acc.addon + (r.counts.addon || 0),
    advanced: acc.advanced + (r.counts.advanced || 0),
    combo: acc.combo + (r.counts.combo || 0),
    duration90: acc.duration90 + (r.counts.duration90 || 0),
    totalInvoices: acc.totalInvoices + (r.counts.totalInvoices || 0),
    requestedInvoices: acc.requestedInvoices + (r.counts.requestedInvoices || 0),
  }), { main: 0, addon: 0, advanced: 0, combo: 0, duration90: 0, totalInvoices: 0, requestedInvoices: 0 })

  return {
    fromDate,
    toDate,
    rows,
    branches,
    system: {
      employeeCount: rows.length,
      employeesMetAll: rows.filter((r) => r.rowStatus === 'MET').length,
      employeesNotMet: rows.filter((r) => r.rowStatus === 'NOT_MET').length,
      employeesInsufficient: rows.filter((r) => r.rowStatus === 'INSUFFICIENT_DATA').length,
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
    },
  }
}

/**
 * Lọc bảng Admin KPI.
 * branchId mặc định = home (employee.branchId hiện tại).
 * Không dùng invoice.branchId / serving để xác định NV thuộc CN.
 * homeOrServing: 'home' | 'serving' | 'either' — giữ serving/either cho audit cũ.
 */
export function filterAdminKpiRows(rows = [], {
  branchId = '',
  employeeId = '',
  status = '',
  kpiKey = '',
  homeOrServing = 'home',
} = {}) {
  return rows.filter((row) => {
    if (employeeId && row.employeeId !== employeeId) return false
    if (status && row.rowStatus !== status) return false
    if (branchId) {
      const homeMatch = row.homeBranchId === branchId
      const serveMatch = row.servingBranchIds.includes(branchId)
      if (homeOrServing === 'home' && !homeMatch) return false
      if (homeOrServing === 'serving' && !serveMatch) return false
      if (homeOrServing === 'either' && !homeMatch && !serveMatch) return false
    }
    if (kpiKey) {
      const card = row.cards[kpiKey]
      if (!card || card.status === KPI_STATUS.MET) return false
    }
    return true
  })
}

/** Hiển thị ô KPI: actual / mẫu số = % + mục tiêu + Đạt|Còn thiếu — lấy từ card engine. */
export function formatAdminKpiMetricCell(card) {
  if (!card) {
    return {
      ratioLine: '—',
      targetLine: '',
      hintLine: '—',
      tone: 'neutral',
    }
  }
  const actual = card.actual
  const denominator = card.denominator
  const hasRatio = Number.isFinite(actual) && Number.isFinite(denominator)
  const ratioLine = hasRatio
    ? `${actual} / ${denominator} = ${card.rateLabel}`
    : (card.rateLabel || '—')
  const targetLine = card.target != null && Number.isFinite(card.target)
    ? `Mục tiêu ≥ ${card.targetLabel}`
    : (card.status === KPI_STATUS.NO_POLICY ? 'Chưa có chính sách KPI' : '')
  let hintLine = '—'
  let tone = 'neutral'
  if (card.status === KPI_STATUS.MET) {
    hintLine = 'Đạt'
    tone = 'met'
  } else if (card.status === KPI_STATUS.NOT_MET) {
    hintLine = card.missing == null ? 'Chưa đạt' : `Còn thiếu ${card.missing}`
    tone = 'miss'
  } else if (card.status === KPI_STATUS.NO_POLICY) {
    hintLine = 'Chưa có chính sách KPI'
    tone = 'neutral'
  } else if (card.status === KPI_STATUS.INSUFFICIENT_DATA) {
    hintLine = 'Chưa đủ dữ liệu'
    tone = 'neutral'
  } else {
    hintLine = card.missingText || card.statusLabel || '—'
  }
  return { ratioLine, targetLine, hintLine, tone }
}

export function percentInputToDecimal(value) {
  const n = Number(String(value).replace('%', '').trim())
  if (!Number.isFinite(n)) return NaN
  if (n > 1) return n / 100
  return n
}

export function decimalToPercentInput(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const pct = n <= 1 ? n * 100 : n
  return String(Math.round(pct * 10) / 10).replace(/\.0$/, '')
}

export function formatAdminKpiCell(card) {
  if (!card) return { rate: '—', status: '—', missing: '—' }
  return {
    rate: card.rateLabel,
    status: card.statusLabel,
    missing: card.missing == null ? '—' : String(card.missing),
    target: card.targetLabel,
    actual: `${card.actual}/${card.denominator}`,
  }
}

export { EMPLOYEE_KPI_CARD_DEFS, formatKpiPercent, formatTargetPercent, resolveDisplayTarget, buildKpiCardModel }
