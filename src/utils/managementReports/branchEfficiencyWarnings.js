/**
 * Banner cảnh báo dữ liệu — B4. Không chặn báo cáo.
 */
import { FIXED_EXPENSE_TYPE_ID, normalizeExpenseTypeId } from '../../constants/expenseTypes'
import { isPnlOperatingExpense, UNKNOWN_BRANCH_ID } from './branchEfficiencyPnl'

function inRange(date, fromDate, toDate) {
  const d = String(date ?? '').slice(0, 10)
  if (!d) return false
  if (fromDate && d < fromDate) return false
  if (toDate && d > toDate) return false
  return true
}

function missingBranch(id) {
  return !String(id ?? '').trim()
}

/**
 * @returns {{ items: Array<{ id: string, severity: 'warn'|'info', title: string, detail: string, count: number }>, hasWarnings: boolean }}
 */
export function buildBranchEfficiencyWarnings({
  report = null,
  invoices = [],
  expenses = [],
  adjustments = [],
  fromDate = '',
  toDate = '',
} = {}) {
  const items = []

  const unknownRow = report?.rows?.find((r) => r.branchId === UNKNOWN_BRANCH_ID || r.isUnknown)
  if (unknownRow) {
    items.push({
      id: 'unknown-branch',
      severity: 'warn',
      title: 'Unknown branch',
      detail: `Có dòng “Chưa xác định chi nhánh” (DT ${Number(unknownRow.revenue || 0).toLocaleString('vi-VN')} ₫). Vẫn nằm trong Tổng hệ thống.`,
      count: 1,
    })
  }

  const invoiceMissing = (invoices || []).filter(
    (inv) => inRange(inv.date, fromDate, toDate) && missingBranch(inv.branchId),
  )
  if (invoiceMissing.length > 0) {
    items.push({
      id: 'invoice-missing-branch',
      severity: 'warn',
      title: 'Invoice thiếu branchId',
      detail: `${invoiceMissing.length} hóa đơn trong kỳ thiếu chi nhánh phục vụ.`,
      count: invoiceMissing.length,
    })
  }

  const adjMissing = (adjustments || []).filter(
    (row) => inRange(row.date, fromDate, toDate) && missingBranch(row.branchId),
  )
  if (adjMissing.length > 0) {
    items.push({
      id: 'adjustment-missing-branch',
      severity: 'warn',
      title: 'Payroll adjustment thiếu branchId',
      detail: `${adjMissing.length} điều chỉnh lương trong kỳ thiếu chi nhánh.`,
      count: adjMissing.length,
    })
  }

  const penaltySuspect = (report?.rows || []).reduce(
    (sum, row) => sum + (row.details?.duplicatePenaltyWarnings?.length || 0),
    0,
  )
  if (penaltySuspect > 0) {
    items.push({
      id: 'duplicate-penalty',
      severity: 'warn',
      title: 'Phạt nghi trùng',
      detail: `${penaltySuspect} cặp phạt attendance/adjustment trùng employeeId + ngày + số tiền (đã dedupe, chỉ cảnh báo).`,
      count: penaltySuspect,
    })
  }

  // Expense nghi trùng: cùng CN + ngày + số tiền + loại (trong CP hợp lệ), hoặc mặt bằng tay bị loại khi đã có fixed
  const opEx = (expenses || []).filter(
    (e) => inRange(e.date, fromDate, toDate) && isPnlOperatingExpense(e),
  )
  const groups = new Map()
  for (const e of opEx) {
    const key = [
      String(e.branchId || '').trim(),
      String(e.date || '').slice(0, 10),
      Math.round(Number(e.amount) || 0),
      normalizeExpenseTypeId(e.expenseType),
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  let expenseDupGroups = 0
  let expenseDupRows = 0
  for (const list of groups.values()) {
    if (list.length >= 2) {
      expenseDupGroups += 1
      expenseDupRows += list.length
    }
  }

  const manualRentExcluded = (expenses || []).filter((e) => {
    if (!inRange(e.date, fromDate, toDate)) return false
    return normalizeExpenseTypeId(e.expenseType) === FIXED_EXPENSE_TYPE_ID
  })

  if (expenseDupGroups > 0 || manualRentExcluded.length > 0) {
    const parts = []
    if (expenseDupGroups > 0) {
      parts.push(`${expenseDupGroups} nhóm chi phí trùng khóa CN/ngày/số tiền/loại (${expenseDupRows} dòng)`)
    }
    if (manualRentExcluded.length > 0) {
      parts.push(`${manualRentExcluded.length} mặt bằng nhập tay đã loại (tránh trùng fixed cost)`)
    }
    items.push({
      id: 'expense-suspect-duplicate',
      severity: 'warn',
      title: 'Expense nghi trùng',
      detail: `${parts.join('; ')}.`,
      count: expenseDupGroups + manualRentExcluded.length,
    })
  }

  return {
    items,
    hasWarnings: items.length > 0,
  }
}
