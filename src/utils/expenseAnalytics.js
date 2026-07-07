import {
  EXPENSE_CATEGORY_CARDS,
  getExpenseTypeLabel,
  normalizeExpenseTypeId,
} from '../constants/expenseTypes'
import { getBranchName as resolveBranchName } from './branchStorage'
import { getMonthStartDate, getTodayDate } from './invoiceStorage'
import { parseAmount, sumExpenseAmount } from './expenseStorage'
import { getInvoicePayment } from './invoice'

export function filterExpensesAdvanced(
  expenses,
  { fromDate, toDate, branchId, expenseType, categoryId } = {},
) {
  return expenses.filter((exp) => {
    if (fromDate && exp.date < fromDate) return false
    if (toDate && exp.date > toDate) return false
    if (branchId && exp.branchId !== branchId) return false
    if (expenseType && normalizeExpenseTypeId(exp.expenseType) !== normalizeExpenseTypeId(expenseType)) {
      return false
    }
    if (categoryId && categoryId !== 'total') {
      const card = EXPENSE_CATEGORY_CARDS.find((item) => item.id === categoryId)
      if (card?.typeIds && !card.typeIds.includes(normalizeExpenseTypeId(exp.expenseType))) {
        return false
      }
    }
    return true
  })
}

export function computeInvoiceRevenue(invoices) {
  return invoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
}

export function computeRevenueByBranch(invoices) {
  const map = new Map()
  for (const inv of invoices) {
    const key = inv.branchId || 'unknown'
    map.set(key, (map.get(key) ?? 0) + getInvoicePayment(inv))
  }
  return map
}

export function computeExpenseByType(expenses) {
  const map = new Map()
  for (const exp of expenses) {
    const typeId = normalizeExpenseTypeId(exp.expenseType)
    const current = map.get(typeId) ?? {
      typeId,
      label: getExpenseTypeLabel(typeId),
      total: 0,
      count: 0,
    }
    current.total += parseAmount(exp.amount)
    current.count += 1
    map.set(typeId, current)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function computeExpenseByDate(expenses) {
  const map = new Map()
  for (const exp of expenses) {
    const current = map.get(exp.date) ?? { date: exp.date, total: 0, count: 0 }
    current.total += parseAmount(exp.amount)
    current.count += 1
    map.set(exp.date, current)
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function computeBranchExpenseStats(expenses, invoices, branch, { today, monthStart }) {
  const branchExpenses = expenses.filter((exp) => exp.branchId === branch.id)
  const todayExpenses = branchExpenses.filter((exp) => exp.date === today)
  const monthExpenses = branchExpenses.filter(
    (exp) => exp.date >= monthStart && exp.date <= today,
  )
  const monthRevenue = invoices
    .filter((inv) => inv.branchId === branch.id && inv.date >= monthStart && inv.date <= today)
    .reduce((sum, inv) => sum + getInvoicePayment(inv), 0)

  const monthTotal = sumExpenseAmount(monthExpenses)
  const todayTotal = sumExpenseAmount(todayExpenses)
  const expenseRatio = monthRevenue > 0 ? (monthTotal / monthRevenue) * 100 : null

  return {
    branchId: branch.id,
    branchName: branch.name,
    total: sumExpenseAmount(branchExpenses),
    count: branchExpenses.length,
    todayTotal,
    monthTotal,
    monthRevenue,
    expenseRatio,
    anomalyNote: getAnomalyNote({ monthTotal, todayTotal, monthRevenue, expenseRatio }),
  }
}

export function getAnomalyNote({ monthTotal, todayTotal, monthRevenue, expenseRatio }) {
  if (expenseRatio != null && expenseRatio >= 50) {
    return 'Tỷ lệ chi phí/doanh thu tháng ≥ 50%'
  }
  if (monthRevenue > 0 && monthTotal > monthRevenue) {
    return 'Chi phí tháng vượt doanh thu tiền vé'
  }
  const avgDaily = monthTotal / Math.max(1, new Date().getDate())
  if (todayTotal > 0 && avgDaily > 0 && todayTotal >= avgDaily * 2.5) {
    return 'Chi phí hôm nay cao bất thường'
  }
  return ''
}

export function computeAdminExpenseOverview(expenses, invoices) {
  const today = getTodayDate()
  const monthStart = getMonthStartDate()
  const monthExpenses = expenses.filter((exp) => exp.date >= monthStart && exp.date <= today)
  const todayExpenses = expenses.filter((exp) => exp.date === today)
  const monthRevenue = computeInvoiceRevenue(
    invoices.filter((inv) => inv.date >= monthStart && inv.date <= today),
  )
  const monthTotal = sumExpenseAmount(monthExpenses)
  const revenueByBranch = computeRevenueByBranch(
    invoices.filter((inv) => inv.date >= monthStart && inv.date <= today),
  )

  const byBranchMap = new Map()
  for (const exp of monthExpenses) {
    const key = exp.branchId || 'unknown'
    const current = byBranchMap.get(key) ?? {
      branchId: exp.branchId,
      branchName: exp.branchName || resolveBranchName(exp.branchId),
      total: 0,
      count: 0,
      todayTotal: 0,
    }
    current.total += parseAmount(exp.amount)
    current.count += 1
    if (exp.date === today) current.todayTotal += parseAmount(exp.amount)
    byBranchMap.set(key, current)
  }

  const byBranch = [...byBranchMap.values()]
    .map((row) => {
      const monthRevenueBranch = revenueByBranch.get(row.branchId) ?? 0
      const expenseRatio = monthRevenueBranch > 0 ? (row.total / monthRevenueBranch) * 100 : null
      return {
        ...row,
        monthRevenue: monthRevenueBranch,
        expenseRatio,
        anomalyNote: getAnomalyNote({
          monthTotal: row.total,
          todayTotal: row.todayTotal,
          monthRevenue: monthRevenueBranch,
          expenseRatio,
        }),
      }
    })
    .sort((a, b) => b.total - a.total)

  const byType = computeExpenseByType(monthExpenses)
  const topBranch = byBranch[0] ?? null
  const topType = byType[0] ?? null

  return {
    today: sumExpenseAmount(todayExpenses),
    month: monthTotal,
    total: sumExpenseAmount(expenses),
    monthRevenue,
    expenseRatio: monthRevenue > 0 ? (monthTotal / monthRevenue) * 100 : null,
    profitEstimate: monthRevenue - monthTotal,
    byBranch,
    byType,
    topBranch,
    topType,
    count: expenses.length,
  }
}

export function computeCategoryCardTotals(expenses, categoryId) {
  const card = EXPENSE_CATEGORY_CARDS.find((item) => item.id === categoryId)
  if (!card) return 0
  if (categoryId === 'total') return sumExpenseAmount(expenses)
  return sumExpenseAmount(
    expenses.filter((exp) => card.typeIds?.includes(normalizeExpenseTypeId(exp.expenseType))),
  )
}

export function computeAllCategoryCards(expenses) {
  return EXPENSE_CATEGORY_CARDS.map((card) => ({
    ...card,
    total: computeCategoryCardTotals(expenses, card.id),
  }))
}
