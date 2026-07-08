import { CANONICAL_BRANCHES } from './canonicalBranches'

/** Ánh xạ chi nhánh vận hành → nhãn CN hiển thị trên module Lương (ERP). */
export const BRANCH_PAYROLL_DISPLAY = Object.fromEntries(
  CANONICAL_BRANCHES.map((branch) => [
    branch.id,
    { code: branch.cnCode, title: branch.cnTitle, sortOrder: branch.sortOrder },
  ]),
)

const FALLBACK_SORT_ORDER = 99

export function getPayrollBranchDisplayTitle(branchId, fallbackName = '') {
  const entry = BRANCH_PAYROLL_DISPLAY[branchId]
  if (entry?.title) return entry.title
  return fallbackName || branchId || '—'
}

export function getPayrollBranchSortOrder(branchId) {
  return BRANCH_PAYROLL_DISPLAY[branchId]?.sortOrder ?? FALLBACK_SORT_ORDER
}

export function sortBranchesForPayroll(branches) {
  return [...branches].sort((a, b) => {
    const orderDiff = getPayrollBranchSortOrder(a.id) - getPayrollBranchSortOrder(b.id)
    if (orderDiff !== 0) return orderDiff
    return (a.name ?? '').localeCompare(b.name ?? '', 'vi')
  })
}
