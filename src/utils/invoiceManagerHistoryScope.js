import { resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { getEmployeeById } from './employeeStorage'
import { resolveInvoiceHomeBranchId } from './crossBranchSupport'

/**
 * HĐ thuộc phạm vi xem lịch sử của Quản lý chi nhánh:
 * NV chính hoặc NV hỗ trợ có chi nhánh gốc = chi nhánh quản lý.
 * Không lọc theo chi nhánh phục vụ (HĐ hỗ trợ liên CN vẫn xem được).
 */
export function invoiceBelongsToManagerHomeBranch(invoice, managerBranchId) {
  const branch = resolveCanonicalBranchId(managerBranchId)
  if (!branch) return false

  if (resolveInvoiceHomeBranchId(invoice) === branch) return true

  const supportId = invoice?.supportEmployeeId
  if (!supportId) return false
  const support = getEmployeeById(supportId)
  return resolveCanonicalBranchId(support?.branchId) === branch
}

export function filterInvoicesForManagerHistory(invoices, managerBranchId) {
  return (invoices ?? []).filter((invoice) =>
    invoiceBelongsToManagerHomeBranch(invoice, managerBranchId),
  )
}

/**
 * Phạm vi fetch trang Hóa đơn.
 * Quản lý: không gửi branchId phục vụ (sẽ mất HĐ làm tại CN khác).
 * Nhân viên: theo employeeId, không theo chi nhánh phục vụ.
 */
export function buildInvoicePageFetchScope({
  fromDate = '',
  toDate = '',
  branchId = '',
  employeeId = '',
  isEmployeeUser = false,
  isBranchManagerUser = false,
  currentEmployeeId = '',
} = {}) {
  const dates = {
    fromDate: fromDate || '',
    toDate: toDate || '',
  }

  if (isEmployeeUser) {
    return { ...dates, employeeId: currentEmployeeId || '', branchId: '' }
  }

  if (isBranchManagerUser) {
    return { ...dates, employeeId: employeeId || '', branchId: '' }
  }

  return {
    ...dates,
    employeeId: employeeId || '',
    branchId: branchId || '',
  }
}
