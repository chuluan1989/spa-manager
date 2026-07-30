import { getBranchById, getSupportBranchIds, isSupportBranchEnabled } from './branchStorage'
import { getEmployeeById, isSupportEligibleEmployee } from './employeeStorage'

/** NV thuộc nhóm hỗ trợ liên chi nhánh được chọn "Chi nhánh phục vụ khách". */
export function canSelectServingBranch(employeeId) {
  return isSupportEligibleEmployee(employeeId)
}

/** Danh sách chi nhánh phục vụ: chỉ các CN bật hỗ trợ (Sóc Trăng / Trạm / Sống Khoẻ). */
export function getServingBranchOptions(employeeId) {
  if (!canSelectServingBranch(employeeId)) return []
  return getSupportBranchIds()
    .map((id) => getBranchById(id))
    .filter((branch) => branch?.id)
}

/**
 * NV được tạo HĐ tại chi nhánh phục vụ khi:
 * - đúng chi nhánh gốc của NV, hoặc
 * - cả NV và CN phục vụ thuộc nhóm hỗ trợ liên chi nhánh.
 */
export function canEmployeeServeAtBranch(employeeId, servingBranchId) {
  const employee = getEmployeeById(employeeId)
  if (!employee?.id || !servingBranchId) return false
  if (employee.branchId === servingBranchId) return true
  return isSupportEligibleEmployee(employeeId) && isSupportBranchEnabled(servingBranchId)
}

/** HĐ hỗ trợ liên CN: có homeBranchId và khác branchId (CN phục vụ). */
export function isCrossBranchSupportInvoice(invoice) {
  const serving = invoice?.branchId ?? ''
  const home = invoice?.homeBranchId ?? ''
  return Boolean(home && serving && home !== serving)
}
