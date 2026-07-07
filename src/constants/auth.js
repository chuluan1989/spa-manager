import { NAV_ITEMS } from './navigation'
import { ADMIN_BRANCH, ROLES } from './roles'
import { getBranchName } from '../utils/branchStorage'
import { getEmployeeById } from '../utils/employeeStorage'
import { loadCurrentUser } from '../utils/authStorage'
import { hasPermission, PERMISSION_KEYS } from '../utils/permissionsStorage'

export { ADMIN_BRANCH, ROLES }

export function getCurrentUser() {
  return loadCurrentUser()
}

export function isLoggedIn() {
  const user = getCurrentUser()
  return Boolean(user?.role && user?.branch)
}

export function getCurrentUserRole() {
  return getCurrentUser()?.role ?? null
}

export function getCurrentUserBranch() {
  return getCurrentUser()?.branch ?? ''
}

export function getCurrentUserEmployeeId() {
  return getCurrentUser()?.employeeId ?? ''
}

export function getCurrentUserBranchName() {
  const branch = getCurrentUserBranch()
  if (branch === ADMIN_BRANCH) return 'Tất cả chi nhánh'
  return getBranchName(branch)
}

export function getCurrentUserName() {
  const user = getCurrentUser()
  if (!user) return ''
  if (user.role === ROLES.ADMIN) return 'Admin'
  if (user.role === ROLES.EMPLOYEE) {
    return user.employeeName ?? getEmployeeById(user.employeeId)?.name ?? 'Nhân viên'
  }
  return `QL ${getCurrentUserBranchName()}`
}

export function isAdmin() {
  return getCurrentUserRole() === ROLES.ADMIN
}

export function isBranchManager() {
  return getCurrentUserRole() === ROLES.BRANCH_MANAGER
}

export function isEmployee() {
  return getCurrentUserRole() === ROLES.EMPLOYEE
}

export function canSelectBranch() {
  return isAdmin()
}

export function getScopedBranchId(selectedBranchId = '') {
  if (isBranchManager() || isEmployee()) return getCurrentUserBranch()
  return selectedBranchId
}

export function getScopedEmployeeId(selectedEmployeeId = '') {
  if (isEmployee()) return getCurrentUserEmployeeId()
  return selectedEmployeeId
}

export function filterByUserBranch(items, getBranchId = (item) => item.branchId) {
  if (isAdmin()) return items
  const branchId = getCurrentUserBranch()
  if (!branchId) return []
  return items.filter((item) => getBranchId(item) === branchId)
}

export function filterByUserScope(
  items,
  getBranchId = (item) => item.branchId,
  getEmployeeId = (item) => item.employeeId,
) {
  if (isAdmin()) return items

  const branchId = getCurrentUserBranch()
  if (!branchId) return []

  let scoped = items.filter((item) => getBranchId(item) === branchId)
  if (isEmployee()) {
    const employeeId = getCurrentUserEmployeeId()
    scoped = scoped.filter((item) => getEmployeeId(item) === employeeId)
  }
  return scoped
}

export function isEmployeeInUserBranch(employee) {
  if (isAdmin()) return true
  if (!employee) return false
  return employee.branchId === getCurrentUserBranch()
}

export function canAccessEmployeesPage(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return false
  return role === ROLES.BRANCH_MANAGER || hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)
}

export function canAccessInvoicesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER || role === ROLES.EMPLOYEE
}

export function canAccessExpensesPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER
}

export function canViewEmployeeCccd(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.VIEW_CCCD, role)
}

export function canViewEmployeePersonalInfo(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canViewEmployeeNote(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Ảnh chân dung là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeAvatar(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canEditEmployeeAvatar(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Địa chỉ hiện tại là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeCurrentAddress(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Ngân hàng/số tài khoản là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeBankInfo(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Người liên hệ khẩn cấp là thông tin riêng tư — chỉ Admin được xem. */
export function canViewEmployeeEmergencyContact(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canViewEmployeePosition(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN || role === ROLES.BRANCH_MANAGER
}

export function canChangeEmployeeBranch(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

export function canAddEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)
}

export function canEditEmployee(employee = null, role = getCurrentUserRole()) {
  if (!hasPermission(PERMISSION_KEYS.MANAGE_EMPLOYEES, role)) return false
  if (role === ROLES.ADMIN) return true
  return isEmployeeInUserBranch(employee)
}

export function canDeleteEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.DELETE_EMPLOYEE, role)
}

export function canTransferEmployee(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.TRANSFER_EMPLOYEE, role)
}

export function canViewReport(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.VIEW_REPORT, role) || role === ROLES.EMPLOYEE
}

export function canViewOverviewReport(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE || hasPermission(PERMISSION_KEYS.VIEW_REPORT, role)
}

export function canAddInvoice(role = getCurrentUserRole()) {
  if (role === ROLES.EMPLOYEE) return true
  return hasPermission(PERMISSION_KEYS.ADD_INVOICE, role)
}

/**
 * Nhân viên chỉ được sửa hóa đơn do chính mình tạo (employeeId trùng
 * với tài khoản đang đăng nhập). Admin/Quản lý chi nhánh dùng quyền
 * cấu hình sẵn (không phụ thuộc invoice cụ thể) như trước.
 */
export function canEditInvoice(invoice = null, role = getCurrentUserRole()) {
  if (role === ROLES.EMPLOYEE) {
    return Boolean(invoice) && invoice.employeeId === getCurrentUserEmployeeId()
  }
  return hasPermission(PERMISSION_KEYS.EDIT_INVOICE, role)
}

export function canDeleteInvoice(role = getCurrentUserRole()) {
  return hasPermission(PERMISSION_KEYS.DELETE_INVOICE, role)
}

export function canAccessSettingsPage(role = getCurrentUserRole()) {
  return role === ROLES.ADMIN
}

/** Chỉ Nhân viên có màn "Hồ sơ cá nhân" (Admin/Quản lý sửa hồ sơ trong Cài đặt). */
export function canAccessMyProfilePage(role = getCurrentUserRole()) {
  return role === ROLES.EMPLOYEE
}

export function getVisibleNavItems(role = getCurrentUserRole()) {
  let items = NAV_ITEMS

  if (role === ROLES.EMPLOYEE) {
    items = items.filter((item) => ['dashboard', 'invoices', 'reports', 'profile'].includes(item.id))
  }

  if (role !== ROLES.EMPLOYEE) {
    items = items.filter((item) => item.id !== 'profile')
  }

  if (role !== ROLES.ADMIN && role !== ROLES.BRANCH_MANAGER && role !== ROLES.EMPLOYEE) {
    items = items.filter((item) => !['invoices', 'expenses', 'employees'].includes(item.id))
  }

  if (role === ROLES.ADMIN) {
    items = items.filter((item) => item.id !== 'employees')
  }

  if (role !== ROLES.ADMIN) {
    items = items.filter((item) => item.id !== 'settings')
  }

  return items
}

export function getRoleLabel(role = getCurrentUserRole()) {
  if (role === ROLES.ADMIN) return 'Admin'
  if (role === ROLES.BRANCH_MANAGER) return 'Quản lý chi nhánh'
  if (role === ROLES.EMPLOYEE) return 'Nhân viên'
  return '—'
}
