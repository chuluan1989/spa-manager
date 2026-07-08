import { loadEmployees } from './employeeStorage'
import { loadExpenses } from './expenseStorage'
import { loadInvoices } from './invoiceStorage'
import { loadBranchCatalogsMap } from './serviceCatalogV2Storage'
import { loadBranchPricingMap } from './branchPricingStorage'
import { loadCommissionPolicyMap } from './commissionPolicyStorage'

export const BRANCH_DELETE_BLOCKED_MESSAGE =
  'Chi nhánh đã phát sinh dữ liệu. Không thể xóa — chỉ có thể khóa chi nhánh.'

function branchHasEmployees(branchId, employees = loadEmployees()) {
  return employees.some((employee) => employee.branchId === branchId)
}

function branchHasInvoices(branchId, invoices = loadInvoices()) {
  return invoices.some((invoice) => invoice.branchId === branchId)
}

function branchHasExpenses(branchId, expenses = loadExpenses()) {
  return expenses.some((expense) => expense.branchId === branchId)
}

function branchHasCatalog(branchId) {
  const catalogs = loadBranchCatalogsMap()
  const catalog = catalogs[branchId]
  if (!catalog) return false
  return (catalog.categories?.length ?? 0) > 0
    || (catalog.services?.length ?? 0) > 0
    || (catalog.durations?.length ?? 0) > 0
}

function branchHasPricing(branchId) {
  const pricing = loadBranchPricingMap()
  const entry = pricing[branchId]
  if (!entry) return false
  return Object.keys(entry).length > 0
}

function branchHasCommissionPolicy(branchId) {
  const policies = loadCommissionPolicyMap()
  return Boolean(policies[branchId])
}

/** Kiểm tra có thể xóa chi nhánh — chỉ khi chưa phát sinh dữ liệu. */
export function canDeleteBranch(branchId) {
  if (!branchId) {
    return { allowed: false, reason: 'Không tìm thấy chi nhánh.' }
  }

  const reasons = []
  if (branchHasEmployees(branchId)) reasons.push('nhân viên')
  if (branchHasInvoices(branchId)) reasons.push('hóa đơn')
  if (branchHasExpenses(branchId)) reasons.push('chi phí')
  if (branchHasCatalog(branchId)) reasons.push('bảng dịch vụ')
  if (branchHasPricing(branchId)) reasons.push('bảng giá')
  if (branchHasCommissionPolicy(branchId)) reasons.push('chính sách hoa hồng')

  if (reasons.length > 0) {
    return {
      allowed: false,
      reason: `${BRANCH_DELETE_BLOCKED_MESSAGE} (đã có: ${reasons.join(', ')}).`,
    }
  }

  return { allowed: true, reason: '' }
}
