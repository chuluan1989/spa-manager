import { getAttendancePermitLabel, getAttendanceStatusLabel } from '../constants/attendanceTypes'
import { getBranchName } from './branchStorage'
import { downloadCsv } from './csvExport'

function formatDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('vi-VN')
}

export function exportAttendanceCsv(records, filters = {}) {
  const suffix = [filters.fromDate, filters.toDate, filters.branchId].filter(Boolean).join('_') || 'all'
  downloadCsv(`cham-cong-${suffix}`, [
    [
      'Ngày',
      'Chi nhánh',
      'branch_id',
      'Nhân viên',
      'employee_id',
      'Trạng thái',
      'Có phép/Không phép',
      'Lý do',
      'Ghi chú',
      'Tiền phạt',
      'Người tạo',
      'Người cập nhật',
      'Thời gian tạo',
      'Thời gian cập nhật',
    ],
    ...records.map((row) => [
      row.date,
      row.branchName || getBranchName(row.branchId),
      row.branchId,
      row.employeeName,
      row.employeeId,
      getAttendanceStatusLabel(row.status),
      getAttendancePermitLabel(row.status),
      row.reason ?? '',
      row.note ?? '',
      row.penaltyAmount ?? 0,
      row.createdBy || row.submittedBy || '',
      row.submittedBy || '',
      formatDateTime(row.submittedAt),
      formatDateTime(row.updatedAt),
    ]),
  ])
}
