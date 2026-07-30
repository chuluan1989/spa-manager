import { resolveCanonicalBranchId, getCanonicalBranchName } from '../constants/canonicalBranches'
import { getBranchById } from './branchStorage'
import { getEmployeeById, isEmployeeActive } from './employeeStorage'

/**
 * Nhóm hỗ trợ liên chi nhánh — cố định theo nghiệp vụ (không phụ thuộc flag supportEnabled trên DB).
 * Tránh Production tắt support_enabled → ẩn dropdown "Chi nhánh phục vụ khách".
 */
export const CROSS_BRANCH_SUPPORT_IDS = Object.freeze([
  'soc-trang',
  'tram-spa',
  'song-khoe-spa',
])

export function isCrossBranchSupportBranchId(branchId) {
  const id = resolveCanonicalBranchId(branchId)
  return CROSS_BRANCH_SUPPORT_IDS.includes(id)
}

function resolveEmployeeHomeBranchId(employeeId, sessionBranchId = '') {
  const employee = getEmployeeById(employeeId)
  if (employee?.branchId) return resolveCanonicalBranchId(employee.branchId)
  return resolveCanonicalBranchId(sessionBranchId)
}

/** NV thuộc nhóm hỗ trợ liên chi nhánh được chọn "Chi nhánh phục vụ khách". */
export function canSelectServingBranch(employeeId, sessionBranchId = '') {
  const employee = getEmployeeById(employeeId)
  if (employee) {
    if (!isEmployeeActive(employee)) return false
    return isCrossBranchSupportBranchId(employee.branchId)
  }
  // Employees chưa hydrate — fallback theo chi nhánh session đăng nhập.
  return isCrossBranchSupportBranchId(sessionBranchId)
}

/** Danh sách đúng 3 CN hỗ trợ (kèm tên hiển thị). */
export function getServingBranchOptions(employeeId, sessionBranchId = '') {
  if (!canSelectServingBranch(employeeId, sessionBranchId)) return []
  return CROSS_BRANCH_SUPPORT_IDS.map((id) => {
    const branch = getBranchById(id)
    return {
      id,
      name: branch?.name || getCanonicalBranchName(id) || id,
    }
  })
}

/**
 * NV được tạo HĐ tại chi nhánh phục vụ khi:
 * - đúng chi nhánh gốc của NV, hoặc
 * - cả NV và CN phục vụ thuộc nhóm 3 CN hỗ trợ.
 */
export function canEmployeeServeAtBranch(employeeId, servingBranchId, sessionBranchId = '') {
  const serving = resolveCanonicalBranchId(servingBranchId)
  if (!serving) return false
  const home = resolveEmployeeHomeBranchId(employeeId, sessionBranchId)
  if (!home) return false
  if (home === serving) return true
  return isCrossBranchSupportBranchId(home) && isCrossBranchSupportBranchId(serving)
}

/** HĐ hỗ trợ liên CN: có homeBranchId và khác branchId (CN phục vụ). */
export function isCrossBranchSupportInvoice(invoice) {
  const serving = resolveCanonicalBranchId(invoice?.branchId ?? '')
  const home = resolveCanonicalBranchId(invoice?.homeBranchId ?? '')
  return Boolean(home && serving && home !== serving)
}
