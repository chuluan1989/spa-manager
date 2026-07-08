import { useMemo } from 'react'
import { getBranchById } from '../../utils/branchStorage'
import { loadEmployees } from '../../utils/employeeStorage'
import { loadInvoices } from '../../utils/invoiceStorage'
import { filterSalaryInvoices, getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'

export default function BranchOverviewTab({ branchId }) {
  const branch = getBranchById(branchId)
  const month = getCurrentMonthValue()
  const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

  const stats = useMemo(() => {
    const employees = loadEmployees().filter((emp) => emp.branchId === branchId)
    const activeEmployees = employees.filter((emp) => emp.status === 'active')
    const invoices = filterSalaryInvoices(loadInvoices(), { fromDate, toDate, branchId })
    const revenue = invoices.reduce((sum, inv) => sum + (inv.payment ?? inv.total ?? 0), 0)
    return {
      employeeCount: employees.length,
      activeCount: activeEmployees.length,
      invoiceCount: invoices.length,
      revenue,
    }
  }, [branchId, fromDate, toDate])

  if (!branch) return null

  return (
    <div className="admin-branches__info-grid">
      <div><span>Chi nhánh</span><strong>{branch.name}</strong></div>
      <div><span>branch_id</span><strong>{branch.id}</strong></div>
      <div><span>Nhân viên</span><strong>{stats.activeCount} / {stats.employeeCount}</strong></div>
      <div><span>Hóa đơn tháng</span><strong>{stats.invoiceCount}</strong></div>
      <div><span>Doanh thu tháng</span><strong>{formatCurrency(stats.revenue)}</strong></div>
      <div><span>Trạng thái</span><strong>{branch.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}</strong></div>
      <div><span>Địa chỉ</span><strong>{branch.address || '—'}</strong></div>
      <div><span>Hotline</span><strong>{branch.hotline || '—'}</strong></div>
    </div>
  )
}
