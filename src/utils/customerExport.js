import { downloadCsv } from './csvExport'

export function exportCustomersCsv(customers, filters = {}) {
  const suffix = [filters.branchId, filters.segment].filter(Boolean).join('_') || 'all'
  downloadCsv(`khach-hang-${suffix}`, [
    [
      'Tên khách',
      'SĐT',
      'Chi nhánh',
      'Nhân viên phục vụ gần nhất',
      'Ngày đến gần nhất',
      'Số lần đến',
      'Tổng doanh thu',
      'Tổng Tips',
      'Phân loại',
      'Lịch sử dịch vụ',
      'Ghi chú',
    ],
    ...customers.map((c) => [
      c.name,
      c.phone,
      (c.branchIds ?? []).join('; '),
      c.latestEmployeeName ?? '',
      c.lastVisitDate ?? '',
      c.visitCount ?? 0,
      c.totalSpend ?? 0,
      c.totalTips ?? 0,
      c.segmentLabel ?? c.segment ?? '',
      (c.serviceStats ?? []).map((s) => s.name ?? '').filter(Boolean).join('; '),
      c.note ?? '',
    ]),
  ])
}
