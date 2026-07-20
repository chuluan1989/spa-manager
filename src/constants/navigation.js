export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan', icon: 'dashboard', description: 'Dashboard toàn hệ thống' },
  { id: 'ops-center', label: 'Điều hành', icon: 'dashboard', description: 'Trung tâm vận hành Admin' },
  { id: 'reports', label: 'Báo cáo', icon: 'report', description: 'Doanh thu • Lương • Thống kê' },
  { id: 'invoices', label: 'Hóa đơn', icon: 'invoice', description: 'Quản lý hóa đơn khách' },
  { id: 'customers', label: 'Khách hàng', icon: 'customer', description: 'CRM quản lý khách hàng' },
  { id: 'admin-employees', label: 'Nhân viên', icon: 'employee', description: 'Nhân sự & hồ sơ' },
  { id: 'admin-branches', label: 'Chi nhánh', icon: 'branch', description: 'Quản lý chi nhánh & nhân sự CN' },
  { id: 'salary', label: 'Lương', icon: 'salary', description: 'HRM lương & phiếu lương' },
  { id: 'expenses', label: 'Chi phí', icon: 'expense', description: 'Quản lý chi phí' },
  { id: 'admin-services', label: 'Dịch vụ', icon: 'service', description: 'Bảng giá & dịch vụ' },
  { id: 'attendance', label: 'Chấm công', icon: 'attendance', description: 'Điểm danh nhân viên' },
  { id: 'payroll1-check', label: 'Kỳ lương 1', icon: 'invoice', description: 'Hoàn thiện dữ liệu kỳ lương 1' },
  { id: 'payroll1-admin', label: 'KL1 tổng hợp', icon: 'report', description: 'Tổng hợp hoàn thiện kỳ lương 1' },
  { id: 'settings', label: 'Cài đặt', icon: 'settings', description: 'Hệ thống & phân quyền' },
  { id: 'revenue', label: 'Doanh thu', icon: 'revenue', description: 'Theo dõi doanh thu chi nhánh' },
  { id: 'employees', label: 'Nhân viên', icon: 'employee', description: 'Nhân sự & hồ sơ' },
  { id: 'legacy-sync', label: 'Đồng bộ', icon: 'cloud-sync', description: 'Đồng bộ dữ liệu cloud' },
  { id: 'profile', label: 'Hồ sơ', icon: 'profile', description: 'Thông tin cá nhân' },
]

/** Menu Admin — thứ tự ERP chuẩn. */
export const ADMIN_NAV_ORDER = [
  'dashboard',
  'ops-center',
  'reports',
  'invoices',
  'customers',
  'admin-branches',
  'admin-employees',
  'salary',
  'expenses',
  'admin-services',
  'attendance',
  'payroll1-admin',
  'settings',
]

/** Menu quản lý chi nhánh. */
export const BRANCH_MANAGER_NAV_ORDER = [
  'dashboard',
  'reports',
  'invoices',
  'customers',
  'employees',
  'salary',
  'expenses',
  'admin-services',
  'attendance',
  'payroll1-admin',
  'legacy-sync',
]

/** Menu nhân viên. */
export const EMPLOYEE_NAV_ORDER = [
  'dashboard',
  'reports',
  'invoices',
  'customers',
  'attendance',
  'salary',
  'profile',
  'legacy-sync',
]

export function pickNavItems(allItems, order) {
  const map = new Map(allItems.map((item) => [item.id, item]))
  return order.map((id) => map.get(id)).filter(Boolean)
}
