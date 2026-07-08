import { getStatusLabel } from './employeeStorage'
import { getBranchName } from './branchStorage'
import { downloadCsv } from './csvExport'

export function exportEmployeeListCsv(employees, statsMap = {}, month = '') {
  downloadCsv(`nhan-vien-${month || 'all'}`, [
    [
      'Họ tên',
      'Chi nhánh',
      'SĐT',
      'Chức vụ',
      'Trạng thái',
      'Doanh thu tháng',
      'Tips tháng',
      'Hoa hồng tháng',
      'Lương tháng',
    ],
    ...employees.map((emp) => {
      const stats = statsMap[emp.id] ?? {}
      return [
        emp.name,
        getBranchName(emp.branchId),
        emp.phone ?? '',
        emp.position ?? '',
        getStatusLabel(emp.status),
        stats.revenue ?? 0,
        stats.tips ?? 0,
        stats.commission ?? 0,
        stats.netSalary ?? stats.totalPay ?? 0,
      ]
    }),
  ])
}
