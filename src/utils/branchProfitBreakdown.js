import {
  BRANCH_PROFIT_BREAKDOWN_TYPES,
  FIXED_EXPENSE_TYPE_ID,
  normalizeExpenseTypeId,
} from '../constants/expenseTypes'
import { filterExpenses, sumExpenseAmount } from './expenseStorage'
import { computeFixedCostTotals } from './fixedCostStorage'

/**
 * Chi phí phát sinh = expenses trừ mặt bằng (tránh double-count với fixed costs).
 */
export function filterVariableExpenses(expenses = []) {
  return expenses.filter((exp) => normalizeExpenseTypeId(exp.expenseType) !== FIXED_EXPENSE_TYPE_ID)
}

export function sumVariableExpenses(expenses = [], filters = {}) {
  return sumExpenseAmount(filterVariableExpenses(filterExpenses(expenses, filters)))
}

/**
 * Tổng chi phí kỳ = cố định + phát sinh.
 */
export function computePeriodExpenseTotals({
  expenses = [],
  fixedCosts = [],
  filters = {},
} = {}) {
  const variableTotal = sumVariableExpenses(expenses, filters)
  const fixed = computeFixedCostTotals(fixedCosts, {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    branchId: filters.branchId,
  })
  return {
    fixedTotal: fixed.total,
    variableTotal,
    total: fixed.total + variableTotal,
    fixedByBranch: fixed.byBranch,
    monthCount: fixed.monthCount,
  }
}

function sumByType(expenses) {
  const map = new Map()
  for (const exp of expenses) {
    const typeId = normalizeExpenseTypeId(exp.expenseType) || 'khac'
    map.set(typeId, (map.get(typeId) ?? 0) + Number(exp.amount ?? 0))
  }
  return map
}

/**
 * Breakdown lợi nhuận / chi phí theo 1 chi nhánh trong kỳ.
 */
export function buildBranchProfitBreakdown({
  ticketRevenue = 0,
  tips = 0,
  totalSalary = 0,
  expenses = [],
  fixedCosts = [],
  fromDate = '',
  toDate = '',
  branchId = '',
} = {}) {
  const scopedExpenses = filterVariableExpenses(
    filterExpenses(expenses, { fromDate, toDate, branchId }),
  )
  const byType = sumByType(scopedExpenses)
  const fixed = computeFixedCostTotals(fixedCosts, { fromDate, toDate, branchId })
  const rent = fixed.byBranch.get(branchId) ?? (branchId ? 0 : fixed.total)

  const knownVariableIds = new Set(
    BRANCH_PROFIT_BREAKDOWN_TYPES
      .filter((item) => item.source === 'variable')
      .map((item) => item.id),
  )

  let otherTotal = 0
  for (const [typeId, amount] of byType.entries()) {
    if (!knownVariableIds.has(typeId)) otherTotal += amount
  }

  const lines = BRANCH_PROFIT_BREAKDOWN_TYPES.map((item) => {
    if (item.source === 'fixed') {
      return { id: item.id, label: item.label, amount: rent }
    }
    if (item.source === 'other') {
      return { id: item.id, label: item.label, amount: otherTotal }
    }
    return { id: item.id, label: item.label, amount: byType.get(item.id) ?? 0 }
  })

  const variableTotal = scopedExpenses.reduce((sum, exp) => sum + Number(exp.amount ?? 0), 0)
  const totalCosts = rent + variableTotal + Number(totalSalary ?? 0)
  const actualRevenue = Number(ticketRevenue ?? 0) + Number(tips ?? 0)
  const profit = actualRevenue - Number(totalSalary ?? 0) - rent - variableTotal

  const costShareLines = lines.filter((line) => line.amount > 0)

  return {
    ticketRevenue: Number(ticketRevenue ?? 0),
    tips: Number(tips ?? 0),
    actualRevenue,
    totalSalary: Number(totalSalary ?? 0),
    rent,
    variableTotal,
    lines,
    costShareLines,
    totalCosts,
    totalExpenses: rent + variableTotal,
    profit,
  }
}
