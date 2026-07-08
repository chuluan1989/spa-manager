/** Ánh xạ chi nhánh vận hành → nhãn CN hiển thị trên module Lương (ERP). */
export const BRANCH_PAYROLL_DISPLAY = {
  'tram-spa': { code: 'CN1', title: 'CN1 Cần Thơ', sortOrder: 1 },
  'soc-trang': { code: 'CN2', title: 'CN2 Sóc Trăng', sortOrder: 2 },
  'gia-lai-1': { code: 'CN3', title: 'CN3 Gia Lai', sortOrder: 3 },
  'vinh-long': { code: 'CN4', title: 'CN4 Vĩnh Long', sortOrder: 4 },
  'bac-lieu': { code: 'CN5', title: 'CN5 Bạc Liêu', sortOrder: 5 },
  'tra-vinh': { code: 'CN6', title: 'CN6 Vĩnh Long', sortOrder: 6 },
  'song-khoe-spa': { code: 'CN7', title: 'CN7 Cần Thơ', sortOrder: 7 },
  'gia-lai-3': { code: 'CN8', title: 'CN8 Gia Lai', sortOrder: 8 },
  'gia-lai-2': { code: '', title: 'Gia Lai 2', sortOrder: 9 },
}

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
