/**
 * Báo cáo Hiệu quả chi nhánh — engine P&L (B1).
 *
 * LN = DT dịch vụ − CP vận hành − % HĐ thực trả − Thưởng + Phạt NV
 * Không gồm: lương CB, tips, ứng, khấu trừ khác, thực lãnh, expense loại lương.
 */
import { FIXED_EXPENSE_TYPE_ID, normalizeExpenseTypeId } from '../../constants/expenseTypes'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../../constants/salaryAdvanceTypes'
import { PAYROLL_ADJUSTMENT_TYPES } from '../../constants/payrollTypes'
import { SALARY_ROLES, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../../constants/salary'
import { resolveCanonicalBranchId } from '../../constants/canonicalBranches'
import { getInvoiceServiceCommission, getInvoiceServiceTotal } from '../invoice'
import { computeFixedCostTotals } from '../fixedCostStorage'

export const UNKNOWN_BRANCH_ID = '__unknown_branch__'
export const UNKNOWN_BRANCH_LABEL = 'Chưa xác định chi nhánh'

export const BRANCH_EFFICIENCY_PNL_FORMULA =
  'Lợi nhuận = Doanh thu dịch vụ − Chi phí vận hành − % hóa đơn thực trả − Thưởng + Phạt nhân viên'

function inDateRange(date, fromDate, toDate) {
  const d = String(date ?? '').slice(0, 10)
  if (!d) return false
  if (fromDate && d < fromDate) return false
  if (toDate && d > toDate) return false
  return true
}

function resolveRecordBranchKey(branchId) {
  const raw = String(branchId ?? '').trim()
  if (!raw) return UNKNOWN_BRANCH_ID
  const canonical = resolveCanonicalBranchId(raw)
  return canonical || UNKNOWN_BRANCH_ID
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundMoney(value) {
  return Math.round(num(value))
}

function scaleCommissionForRole(baseAmount, role) {
  if (role === SALARY_ROLES.SUPPORT) {
    return Math.round(num(baseAmount) * SUPPORT_EMPLOYEE_COMMISSION_RATE)
  }
  return roundMoney(baseAmount)
}

/** Chi phí vận hành P&L — loại ứng, lương, mặt bằng tay, linked adjustment. */
export function isPnlOperatingExpense(expense) {
  if (!expense) return false
  const typeId = normalizeExpenseTypeId(expense.expenseType)
  if (typeId === FIXED_EXPENSE_TYPE_ID) return false
  if (typeId === SALARY_ADVANCE_EXPENSE_TYPE) return false
  if (typeId === 'luong') return false
  if (expense.payrollAdjustmentId) return false
  return true
}

/**
 * % HĐ thực trả trên 1 HĐ — cùng quy tắc payrollEngine (chính 100%, hỗ trợ 50%).
 * @returns {Array<{ employeeId: string, role: string, baseCommission: number, rateApplied: number, amountPaid: number, invoiceId: string }>}
 */
export function allocateInvoiceCommissionPaid(invoice) {
  const base = roundMoney(getInvoiceServiceCommission(invoice))
  const lines = []
  const invoiceId = invoice?.id || ''

  const primaryId = invoice?.employeeId || ''
  if (primaryId) {
    lines.push({
      employeeId: primaryId,
      role: SALARY_ROLES.PRIMARY,
      baseCommission: base,
      rateApplied: 1,
      amountPaid: scaleCommissionForRole(base, SALARY_ROLES.PRIMARY),
      invoiceId,
    })
  }

  const supportId = invoice?.supportEmployeeId || ''
  if (supportId && supportId !== primaryId) {
    lines.push({
      employeeId: supportId,
      role: SALARY_ROLES.SUPPORT,
      baseCommission: base,
      rateApplied: SUPPORT_EMPLOYEE_COMMISSION_RATE,
      amountPaid: scaleCommissionForRole(base, SALARY_ROLES.SUPPORT),
      invoiceId,
    })
  }

  return lines
}

function penaltyDedupeKey(employeeId, date, amount) {
  return `${employeeId || ''}|${String(date || '').slice(0, 10)}|${roundMoney(amount)}`
}

/**
 * Phạt P&L — phương án A: attendance + adjustment, dedupe employeeId+date+amount.
 * Ưu tiên giữ attendance; adjustment trùng → bỏ qua + cảnh báo.
 */
export function buildPenaltyPnlItems({ attendanceRecords = [], adjustments = [], fromDate = '', toDate = '' } = {}) {
  const attendanceItems = []
  for (const row of attendanceRecords) {
    const amount = roundMoney(row.penaltyAmount)
    if (amount <= 0) continue
    if (!inDateRange(row.date, fromDate, toDate)) continue
    attendanceItems.push({
      source: 'attendance',
      id: row.id || '',
      employeeId: row.employeeId || '',
      employeeName: row.employeeName || '',
      branchId: row.branchId || '',
      date: String(row.date || '').slice(0, 10),
      amount,
      reason: row.status || row.reason || '',
      duplicateSuspect: false,
      excludedAsDuplicate: false,
    })
  }

  const attendanceKeys = new Set(
    attendanceItems.map((item) => penaltyDedupeKey(item.employeeId, item.date, item.amount)),
  )

  const adjustmentItems = []
  const duplicateWarnings = []
  for (const row of adjustments) {
    if (row.type !== PAYROLL_ADJUSTMENT_TYPES.PENALTY) continue
    const amount = roundMoney(row.amount)
    if (amount <= 0) continue
    if (!inDateRange(row.date, fromDate, toDate)) continue
    const key = penaltyDedupeKey(row.employeeId, row.date, amount)
    const isDup = attendanceKeys.has(key)
    const item = {
      source: 'adjustment',
      id: row.id || '',
      employeeId: row.employeeId || '',
      employeeName: row.employeeName || '',
      branchId: row.branchId || '',
      date: String(row.date || '').slice(0, 10),
      amount,
      reason: row.reason || row.note || '',
      duplicateSuspect: isDup,
      excludedAsDuplicate: isDup,
    }
    if (isDup) {
      duplicateWarnings.push({
        key,
        employeeId: item.employeeId,
        date: item.date,
        amount: item.amount,
        attendanceMatched: true,
        adjustmentId: item.id,
        label: 'Nghi trùng phạt',
      })
      // Đánh dấu luôn trên attendance item tương ứng
      for (const att of attendanceItems) {
        if (penaltyDedupeKey(att.employeeId, att.date, att.amount) === key) {
          att.duplicateSuspect = true
        }
      }
    } else {
      adjustmentItems.push(item)
    }
  }

  const included = [
    ...attendanceItems,
    ...adjustmentItems.filter((item) => !item.excludedAsDuplicate),
  ]

  return {
    items: included,
    allItems: [...attendanceItems, ...adjustmentItems],
    duplicateWarnings,
    total: included.reduce((sum, item) => sum + item.amount, 0),
  }
}

function emptyBucket(branchId, branchName, isUnknown) {
  return {
    branchId,
    branchName,
    isUnknown: Boolean(isUnknown),
    revenue: 0,
    operatingCost: 0,
    operatingCostFixed: 0,
    operatingCostVariable: 0,
    invoiceCommission: 0,
    bonus: 0,
    penalty: 0,
    profit: 0,
    marginPercent: 0,
    missingBranch: {
      invoiceCount: 0,
      invoiceAmount: 0,
      expenseCount: 0,
      expenseAmount: 0,
      adjustmentCount: 0,
      adjustmentAmount: 0,
      attendanceCount: 0,
      attendanceAmount: 0,
    },
    duplicatePenaltyCount: 0,
    details: {
      revenueLines: [],
      expenseLines: [],
      commissionLines: [],
      bonusLines: [],
      penaltyLines: [],
      duplicatePenaltyWarnings: [],
    },
  }
}

function finalizeBucket(bucket) {
  bucket.operatingCost = roundMoney(bucket.operatingCostFixed + bucket.operatingCostVariable)
  bucket.revenue = roundMoney(bucket.revenue)
  bucket.invoiceCommission = roundMoney(bucket.invoiceCommission)
  bucket.bonus = roundMoney(bucket.bonus)
  bucket.penalty = roundMoney(bucket.penalty)
  bucket.profit = roundMoney(
    bucket.revenue
    - bucket.operatingCost
    - bucket.invoiceCommission
    - bucket.bonus
    + bucket.penalty,
  )
  bucket.marginPercent = bucket.revenue > 0
    ? Math.round((bucket.profit / bucket.revenue) * 10000) / 100
    : 0
  return bucket
}

function sumBuckets(buckets) {
  const total = emptyBucket('__system__', 'Tổng hệ thống', false)
  for (const row of buckets) {
    total.revenue += row.revenue
    total.operatingCostFixed += row.operatingCostFixed
    total.operatingCostVariable += row.operatingCostVariable
    total.invoiceCommission += row.invoiceCommission
    total.bonus += row.bonus
    total.penalty += row.penalty
    total.duplicatePenaltyCount += row.duplicatePenaltyCount
    total.missingBranch.invoiceCount += row.missingBranch.invoiceCount
    total.missingBranch.invoiceAmount += row.missingBranch.invoiceAmount
    total.missingBranch.expenseCount += row.missingBranch.expenseCount
    total.missingBranch.expenseAmount += row.missingBranch.expenseAmount
    total.missingBranch.adjustmentCount += row.missingBranch.adjustmentCount
    total.missingBranch.adjustmentAmount += row.missingBranch.adjustmentAmount
    total.missingBranch.attendanceCount += row.missingBranch.attendanceCount
    total.missingBranch.attendanceAmount += row.missingBranch.attendanceAmount
  }
  return finalizeBucket(total)
}

/**
 * @param {object} params
 * @param {string} [params.fromDate]
 * @param {string} [params.toDate]
 * @param {string} [params.branchId] — lọc 1 CN (không gồm unknown trừ khi branchId === UNKNOWN_BRANCH_ID)
 * @param {Array} params.invoices
 * @param {Array} params.expenses
 * @param {Array} params.fixedCosts
 * @param {Array} params.adjustments
 * @param {Array} params.attendanceRecords
 * @param {(id: string) => string} [params.getBranchName]
 */
export function buildBranchEfficiencyPnl({
  fromDate = '',
  toDate = '',
  branchId = '',
  invoices = [],
  expenses = [],
  fixedCosts = [],
  adjustments = [],
  attendanceRecords = [],
  getBranchName = (id) => id,
} = {}) {
  const buckets = new Map()

  function ensureBucket(rawBranchId) {
    const key = resolveRecordBranchKey(rawBranchId)
    if (!buckets.has(key)) {
      const isUnknown = key === UNKNOWN_BRANCH_ID
      buckets.set(key, emptyBucket(
        key,
        isUnknown ? UNKNOWN_BRANCH_LABEL : (getBranchName(key) || key),
        isUnknown,
      ))
    }
    return buckets.get(key)
  }

  // --- Doanh thu + % HĐ ---
  for (const invoice of invoices) {
    if (!inDateRange(invoice.date, fromDate, toDate)) continue
    const key = resolveRecordBranchKey(invoice.branchId)
    const bucket = ensureBucket(invoice.branchId)
    const revenue = roundMoney(getInvoiceServiceTotal(invoice))
    bucket.revenue += revenue
    bucket.details.revenueLines.push({
      invoiceId: invoice.id || '',
      date: String(invoice.date || '').slice(0, 10),
      branchId: invoice.branchId || '',
      servingBranchId: invoice.branchId || '',
      employeeId: invoice.employeeId || '',
      supportEmployeeId: invoice.supportEmployeeId || '',
      services: invoice.services || invoice.serviceIds || [],
      revenue,
      tipsExcluded: num(invoice.tips),
    })
    if (key === UNKNOWN_BRANCH_ID) {
      bucket.missingBranch.invoiceCount += 1
      bucket.missingBranch.invoiceAmount += revenue
    }

    const commissionLines = allocateInvoiceCommissionPaid(invoice)
    for (const line of commissionLines) {
      bucket.invoiceCommission += line.amountPaid
      bucket.details.commissionLines.push({
        ...line,
        date: String(invoice.date || '').slice(0, 10),
        branchId: invoice.branchId || '',
        invoiceRevenue: revenue,
      })
    }
  }

  // --- Chi phí vận hành biến động ---
  for (const expense of expenses) {
    if (!inDateRange(expense.date, fromDate, toDate)) continue
    if (!isPnlOperatingExpense(expense)) continue
    const key = resolveRecordBranchKey(expense.branchId)
    const bucket = ensureBucket(expense.branchId)
    const amount = roundMoney(expense.amount)
    bucket.operatingCostVariable += amount
    bucket.details.expenseLines.push({
      id: expense.id || '',
      date: String(expense.date || '').slice(0, 10),
      branchId: expense.branchId || '',
      expenseType: normalizeExpenseTypeId(expense.expenseType),
      expenseTypeLabel: expense.expenseTypeLabel || expense.expenseType || '',
      content: expense.content || '',
      amount,
      enteredBy: expense.enteredBy || expense.paidBy || '',
      source: 'expense',
    })
    if (key === UNKNOWN_BRANCH_ID) {
      bucket.missingBranch.expenseCount += 1
      bucket.missingBranch.expenseAmount += amount
    }
  }

  // --- Mặt bằng cố định ---
  const fixed = computeFixedCostTotals(fixedCosts, { fromDate, toDate, branchId: '' })
  for (const [fixedBranchId, amount] of fixed.byBranch.entries()) {
    const bucket = ensureBucket(fixedBranchId)
    const rent = roundMoney(amount)
    if (rent <= 0) continue
    bucket.operatingCostFixed += rent
    bucket.details.expenseLines.push({
      id: `fixed-${fixedBranchId}`,
      date: fromDate || toDate || '',
      branchId: fixedBranchId,
      expenseType: FIXED_EXPENSE_TYPE_ID,
      expenseTypeLabel: 'Mặt bằng',
      content: `Chi phí mặt bằng × ${fixed.monthCount} tháng`,
      amount: rent,
      enteredBy: 'system',
      source: 'fixed_cost',
      monthCount: fixed.monthCount,
    })
  }

  // --- Thưởng ---
  for (const row of adjustments) {
    if (row.type !== PAYROLL_ADJUSTMENT_TYPES.BONUS) continue
    if (!inDateRange(row.date, fromDate, toDate)) continue
    const key = resolveRecordBranchKey(row.branchId)
    const bucket = ensureBucket(row.branchId)
    const amount = roundMoney(row.amount)
    if (amount === 0) continue
    bucket.bonus += amount
    bucket.details.bonusLines.push({
      id: row.id || '',
      employeeId: row.employeeId || '',
      employeeName: row.employeeName || '',
      branchId: row.branchId || '',
      date: String(row.date || '').slice(0, 10),
      amount,
      reason: row.reason || row.note || '',
    })
    if (key === UNKNOWN_BRANCH_ID) {
      bucket.missingBranch.adjustmentCount += 1
      bucket.missingBranch.adjustmentAmount += amount
    }
  }

  // --- Phạt ---
  const penaltyPool = buildPenaltyPnlItems({
    attendanceRecords,
    adjustments,
    fromDate,
    toDate,
  })
  for (const item of penaltyPool.items) {
    const key = resolveRecordBranchKey(item.branchId)
    const bucket = ensureBucket(item.branchId)
    bucket.penalty += item.amount
    bucket.details.penaltyLines.push(item)
    if (item.duplicateSuspect) bucket.duplicatePenaltyCount += 1
    if (key === UNKNOWN_BRANCH_ID) {
      bucket.missingBranch.attendanceCount += item.source === 'attendance' ? 1 : 0
      bucket.missingBranch.adjustmentCount += item.source === 'adjustment' ? 1 : 0
      bucket.missingBranch.attendanceAmount += item.source === 'attendance' ? item.amount : 0
      bucket.missingBranch.adjustmentAmount += item.source === 'adjustment' ? item.amount : 0
    }
  }
  for (const warning of penaltyPool.duplicateWarnings) {
    // Gắn warning vào bucket attendance (đã include)
    const match = penaltyPool.items.find(
      (item) => item.source === 'attendance'
        && penaltyDedupeKey(item.employeeId, item.date, item.amount) === warning.key,
    )
    const bucket = ensureBucket(match?.branchId || '')
    bucket.details.duplicatePenaltyWarnings.push(warning)
  }

  let rows = [...buckets.values()].map(finalizeBucket)

  if (branchId) {
    const filterKey = resolveRecordBranchKey(branchId)
    rows = rows.filter((row) => row.branchId === filterKey)
  }

  rows.sort((a, b) => {
    if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1
    return String(a.branchName).localeCompare(String(b.branchName), 'vi')
  })

  const systemTotal = sumBuckets(rows)

  return {
    formula: BRANCH_EFFICIENCY_PNL_FORMULA,
    fromDate,
    toDate,
    rows,
    systemTotal,
    unknownBranchId: UNKNOWN_BRANCH_ID,
    unknownBranchLabel: UNKNOWN_BRANCH_LABEL,
    supportCommissionRate: SUPPORT_EMPLOYEE_COMMISSION_RATE,
  }
}

/** Tính LN từ các thành phần đã cộng (helper UAT). */
export function computeBranchEfficiencyProfit({
  revenue = 0,
  operatingCost = 0,
  invoiceCommission = 0,
  bonus = 0,
  penalty = 0,
} = {}) {
  return roundMoney(revenue - operatingCost - invoiceCommission - bonus + penalty)
}
