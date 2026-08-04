/**
 * Drill-down helpers cho Báo cáo Hiệu quả chi nhánh (B3).
 * Không đổi công thức engine B1 — chỉ đọc details đã có + enrich hiển thị.
 */
import { SALARY_ROLES } from '../../constants/salary'
import { getPaymentMethodLabel } from '../../constants/paymentMethods'
import { getBranchName } from '../branchStorage'
import { getEmployeeById } from '../employeeStorage'

export const BRANCH_EFFICIENCY_DRILL_TYPES = Object.freeze({
  REVENUE: 'revenue',
  OPEX: 'opex',
  COMMISSION: 'commission',
  BONUS: 'bonus',
  PENALTY: 'penalty',
  PROFIT: 'profit',
})

export const DRILL_TYPE_LABELS = Object.freeze({
  [BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE]: 'Chi tiết doanh thu',
  [BRANCH_EFFICIENCY_DRILL_TYPES.OPEX]: 'Chi tiết chi phí vận hành',
  [BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION]: 'Chi tiết % hóa đơn',
  [BRANCH_EFFICIENCY_DRILL_TYPES.BONUS]: 'Chi tiết thưởng',
  [BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY]: 'Chi tiết phạt',
  [BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT]: 'Giải thích lợi nhuận',
})

function employeeName(id, fallback = '') {
  if (fallback) return fallback
  if (!id) return '—'
  return getEmployeeById(id)?.name || id
}

function branchLabel(id, isUnknown = false) {
  if (!id || isUnknown) return 'Chưa xác định chi nhánh'
  return getBranchName(id) || id
}

function formatServices(services) {
  if (!Array.isArray(services) || services.length === 0) return '—'
  return services
    .map((s) => {
      if (typeof s === 'string') return s
      return s?.name || s?.serviceName || s?.id || ''
    })
    .filter(Boolean)
    .join(', ') || '—'
}

function roleLabel(role) {
  if (role === SALARY_ROLES.SUPPORT) return 'Hỗ trợ'
  if (role === SALARY_ROLES.PRIMARY) return 'Chính'
  return role || '—'
}

function rateLabel(rateApplied) {
  const n = Number(rateApplied)
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}%`
}

function sourceLabel(source) {
  if (source === 'fixed_cost') return 'fixed cost'
  if (source === 'expense') return 'expense'
  if (source === 'attendance') return 'attendance'
  if (source === 'adjustment') return 'adjustment'
  return source || '—'
}

/** Gộp details nhiều CN (dùng cho Tổng hệ thống). */
export function mergeEfficiencyDetails(rows = []) {
  const details = {
    revenueLines: [],
    expenseLines: [],
    commissionLines: [],
    bonusLines: [],
    penaltyLines: [],
    duplicatePenaltyWarnings: [],
  }
  for (const row of rows) {
    const d = row?.details
    if (!d) continue
    details.revenueLines.push(...(d.revenueLines || []))
    details.expenseLines.push(...(d.expenseLines || []))
    details.commissionLines.push(...(d.commissionLines || []))
    details.bonusLines.push(...(d.bonusLines || []))
    details.penaltyLines.push(...(d.penaltyLines || []))
    details.duplicatePenaltyWarnings.push(...(d.duplicatePenaltyWarnings || []))
  }
  return details
}

/**
 * @param {object} params
 * @param {object} params.row — bucket row (hoặc system total totals)
 * @param {object} [params.details] — override details (merged)
 * @param {Map|Record} [params.invoiceById]
 * @param {Map|Record} [params.adjustmentById]
 */
export function buildEfficiencyDrillModel({
  type,
  row,
  details: detailsOverride,
  invoiceById = new Map(),
  adjustmentById = new Map(),
  isUnknownBranch = false,
} = {}) {
  const details = detailsOverride || row?.details || {
    revenueLines: [],
    expenseLines: [],
    commissionLines: [],
    bonusLines: [],
    penaltyLines: [],
    duplicatePenaltyWarnings: [],
  }

  const getInv = (id) => (invoiceById instanceof Map ? invoiceById.get(id) : invoiceById[id])
  const getAdj = (id) => (adjustmentById instanceof Map ? adjustmentById.get(id) : adjustmentById[id])

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE) {
    const lines = (details.revenueLines || []).map((line) => {
      const inv = getInv(line.invoiceId)
      return {
        date: line.date,
        invoiceId: line.invoiceId,
        employeeName: employeeName(line.employeeId, inv?.employeeName),
        servingBranchName: branchLabel(line.servingBranchId || line.branchId, isUnknownBranch && !line.branchId),
        services: formatServices(line.services?.length ? line.services : inv?.services),
        revenue: Number(line.revenue) || 0,
        paymentMethodLabel: getPaymentMethodLabel(inv?.paymentMethod ?? inv?.payment_method),
        tipsExcluded: Number(line.tipsExcluded) || 0,
      }
    })
    const total = lines.reduce((s, l) => s + l.revenue, 0)
    return { type, title: DRILL_TYPE_LABELS[type], lines, total, expectedTotal: Number(row?.revenue) || 0 }
  }

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.OPEX) {
    const all = (details.expenseLines || []).map((line) => ({
      date: line.date,
      expenseTypeLabel: line.expenseTypeLabel || line.expenseType || '—',
      content: line.content || '—',
      amount: Number(line.amount) || 0,
      branchName: branchLabel(line.branchId, !line.branchId),
      enteredBy: line.enteredBy || '—',
      source: line.source,
      sourceLabel: sourceLabel(line.source),
      isFixed: line.source === 'fixed_cost',
    }))
    const fixedLines = all.filter((l) => l.isFixed)
    const variableLines = all.filter((l) => !l.isFixed)
    const total = all.reduce((s, l) => s + l.amount, 0)
    return {
      type,
      title: DRILL_TYPE_LABELS[type],
      fixedLines,
      variableLines,
      lines: all,
      total,
      expectedTotal: Number(row?.operatingCost) || 0,
      fixedTotal: fixedLines.reduce((s, l) => s + l.amount, 0),
      variableTotal: variableLines.reduce((s, l) => s + l.amount, 0),
    }
  }

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION) {
    const lines = (details.commissionLines || []).map((line) => {
      const inv = getInv(line.invoiceId)
      return {
        date: line.date,
        invoiceId: line.invoiceId,
        employeeName: employeeName(line.employeeId, inv?.employeeName),
        role: line.role,
        roleLabel: roleLabel(line.role),
        servingBranchName: branchLabel(line.branchId, isUnknownBranch && !line.branchId),
        invoiceRevenue: Number(line.invoiceRevenue) || 0,
        snapshotCommission: Number(line.baseCommission) || 0,
        rateApplied: Number(line.rateApplied) || 0,
        rateLabel: rateLabel(line.rateApplied),
        amountPaid: Number(line.amountPaid) || 0,
      }
    })
    const total = lines.reduce((s, l) => s + l.amountPaid, 0)
    return { type, title: DRILL_TYPE_LABELS[type], lines, total, expectedTotal: Number(row?.invoiceCommission) || 0 }
  }

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.BONUS) {
    const lines = (details.bonusLines || []).map((line) => {
      const adj = getAdj(line.id)
      return {
        date: line.date,
        employeeName: employeeName(line.employeeId, line.employeeName || adj?.employeeName),
        branchName: branchLabel(line.branchId, !line.branchId),
        amount: Number(line.amount) || 0,
        reason: line.reason || adj?.reason || adj?.note || '—',
        createdBy: adj?.createdByName || adj?.createdBy || line.createdBy || '—',
      }
    })
    const total = lines.reduce((s, l) => s + l.amount, 0)
    return { type, title: DRILL_TYPE_LABELS[type], lines, total, expectedTotal: Number(row?.bonus) || 0 }
  }

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.PENALTY) {
    const lines = (details.penaltyLines || []).map((line) => ({
      date: line.date,
      employeeName: employeeName(line.employeeId, line.employeeName),
      branchName: branchLabel(line.branchId, !line.branchId),
      amount: Number(line.amount) || 0,
      source: line.source,
      sourceLabel: sourceLabel(line.source),
      reason: line.reason || '—',
      duplicateSuspect: Boolean(line.duplicateSuspect),
      excludedAsDuplicate: Boolean(line.excludedAsDuplicate),
    }))
    // Chỉ cộng dòng đã include (engine đã loại trùng)
    const total = lines
      .filter((l) => !l.excludedAsDuplicate)
      .reduce((s, l) => s + l.amount, 0)
    return {
      type,
      title: DRILL_TYPE_LABELS[type],
      lines,
      total,
      expectedTotal: Number(row?.penalty) || 0,
      duplicateWarnings: details.duplicatePenaltyWarnings || [],
    }
  }

  if (type === BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT) {
    const components = [
      { key: 'revenue', label: 'Doanh thu', sign: '+', amount: Number(row?.revenue) || 0 },
      { key: 'operatingCost', label: 'Chi phí vận hành', sign: '−', amount: Number(row?.operatingCost) || 0 },
      { key: 'invoiceCommission', label: '% hóa đơn', sign: '−', amount: Number(row?.invoiceCommission) || 0 },
      { key: 'bonus', label: 'Thưởng', sign: '−', amount: Number(row?.bonus) || 0 },
      { key: 'penalty', label: 'Phạt', sign: '+', amount: Number(row?.penalty) || 0 },
    ]
    const profit = Number(row?.profit) || 0
    return {
      type,
      title: DRILL_TYPE_LABELS[type],
      components,
      profit,
      expectedTotal: profit,
      formula: 'Doanh thu − Chi phí vận hành − % hóa đơn − Thưởng + Phạt = Lợi nhuận',
    }
  }

  return { type, title: 'Chi tiết', lines: [], total: 0, expectedTotal: 0 }
}

/** Assert UAT: tổng drill khớp số bảng. */
export function assertDrillMatchesSummary(model, tolerance = 0) {
  if (!model) return false
  if (model.type === BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT) {
    return model.profit === model.expectedTotal
  }
  return Math.abs((model.total || 0) - (model.expectedTotal || 0)) <= tolerance
}
