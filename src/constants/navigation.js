export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'reports', label: 'Báo cáo', icon: 'report' },
  { id: 'revenue', label: 'Doanh thu', icon: 'revenue' },
  { id: 'invoices', label: 'Hóa đơn', icon: 'invoice' },
  { id: 'admin-employees', label: 'Nhân viên', icon: 'employee' },
  { id: 'expenses', label: 'Chi phí', icon: 'expense' },
  { id: 'admin-services', label: 'Dịch vụ', icon: 'service' },
  { id: 'settings', label: 'Cài đặt', icon: 'settings' },
  { id: 'employees', label: 'Nhân viên', icon: 'employee' },
  { id: 'legacy-sync', label: 'Đồng bộ dữ liệu cũ', icon: 'cloud-sync' },
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: 'profile' },
]

/** Menu ưu tiên quản trị cho Admin (Chủ hệ thống). */
export const ADMIN_NAV_ORDER = [
  'dashboard',
  'reports',
  'revenue',
  'invoices',
  'admin-employees',
  'expenses',
  'admin-services',
  'settings',
]

/** Menu quản lý chi nhánh. */
export const BRANCH_MANAGER_NAV_ORDER = [
  'dashboard',
  'reports',
  'invoices',
  'expenses',
  'employees',
  'legacy-sync',
]

/** Menu nhân viên. */
export const EMPLOYEE_NAV_ORDER = [
  'dashboard',
  'invoices',
  'reports',
  'profile',
  'legacy-sync',
]

export function pickNavItems(allItems, order) {
  const map = new Map(allItems.map((item) => [item.id, item]))
  return order.map((id) => map.get(id)).filter(Boolean)
}
