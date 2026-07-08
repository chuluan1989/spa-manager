import { downloadCsv } from './csvExport'

export function exportCustomersCsv(customers, filters = {}) {
  const suffix = [filters.branchId, filters.segment].filter(Boolean).join('_') || 'all'
  downloadCsv(`khach-hang-${suffix}`, [
    [
      'Tên khách',
      'SĐT',
      'Chi nhánh',
      'Phân loại',
      'Số lần đến',
      'Tổng chi tiêu',
      'Tips',
      'Lần cuối',
      'Ghi chú',
    ],
    ...customers.map((c) => [
      c.name,
      c.phone,
      (c.branchIds ?? []).join('; '),
      c.segmentLabel ?? c.segment ?? '',
      c.visitCount ?? 0,
      c.totalSpend ?? 0,
      c.totalTips ?? 0,
      c.lastVisitDate ?? '',
      c.note ?? '',
    ]),
  ])
}
