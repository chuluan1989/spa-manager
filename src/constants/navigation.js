export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan', icon: 'dashboard', description: 'Dashboard toàn hệ thống' },
  { id: 'reports', label: 'Báo cáo', icon: 'report', description: 'Doanh thu • Lương • Thống kê' },
  { id: 'revenue', label: 'Doanh thu', icon: 'revenue', description: 'Theo dõi doanh thu chi nhánh' },
  { id: 'invoices', label: 'Hóa đơn', icon: 'invoice', description: 'Quản lý hóa đơn khách' },
  { id: 'admin-employees', label: 'Nhân viên', icon: 'employee', description: 'Nhân sự & hồ sơ' },
  { id: 'expenses', label: 'Chi phí', icon: 'expense', description: 'Quản lý chi phí' },
  { id: 'admin-services', label: 'Dịch vụ', icon: 'service', description: 'Bảng giá & dịch vụ' },
  { id: 'settings', label: 'Cài đặt', icon: 'settings', description: 'Hệ thống & phân quyền' },
  { id: 'employees', label: 'Nhân viên', icon: 'employee', description: 'Nhân sự & hồ sơ' },
  { id: 'legacy-sync', label: 'Đồng bộ', icon: 'cloud-sync', description: 'Đồng bộ dữ liệu cloud' },
  { id: 'profile', label: 'Hồ sơ', icon: 'profile', description: 'Thông tin cá nhân' },
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
