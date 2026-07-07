import { loadInvoices } from './invoiceStorage'
import { computeSalaryReport, PAY_CYCLES } from './salaryReport'

const EMPTY_STATS = {
  invoiceCount: 0,
  serviceCount: 0,
  revenue: 0,
  tips: 0,
  commission: 0,
  totalSalary: 0,
}

/**
 * Tổng hợp doanh thu/tour/tips/hoa hồng/lương trọn đời của một nhân viên
 * (tính trên toàn bộ hóa đơn từ trước tới nay, không giới hạn theo kỳ
 * lương). Dùng cho tab "Thông tin vận hành" trong hồ sơ nhân viên.
 */
export function getEmployeeLifetimeStats(employeeId) {
  if (!employeeId) return { ...EMPTY_STATS }

  const invoices = loadInvoices()
  const report = computeSalaryReport(invoices, {
    month: '',
    cycle: PAY_CYCLES.FULL,
    branchId: '',
    employeeId,
  })

  const summary = report.employees[0]?.summary
  if (!summary) return { ...EMPTY_STATS }

  return {
    invoiceCount: summary.invoiceCount,
    serviceCount: summary.serviceCount,
    revenue: summary.revenue,
    tips: summary.tips,
    commission: summary.serviceCommission,
    totalSalary: summary.totalSalary,
  }
}
