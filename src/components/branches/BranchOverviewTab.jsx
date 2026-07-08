import { useMemo } from 'react'
import { getBranchById } from '../../utils/branchStorage'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'
import { formatCurrency } from '../../utils/invoice'
import { useEmployeeHubData } from '../../hooks/useEmployeeHubData'
import { usePayrollData } from '../../hooks/usePayrollData'
import { useAttendanceData } from '../../hooks/useAttendanceData'
import { getInvoiceServiceTotal } from '../../utils/invoice'

export default function BranchOverviewTab({ branchId }) {
  const branch = getBranchById(branchId)
  const month = getCurrentMonthValue()
  const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

  const { employees, invoices, loading: hubLoading } = useEmployeeHubData({ branchId, month })
  const { report, loading: payrollLoading } = usePayrollData({ month, branchId })
  const { records: attendanceRecords, loading: attendanceLoading } = useAttendanceData({ branchId, fromDate, toDate })

  const stats = useMemo(() => {
    const branchEmployees = employees.filter((emp) => emp.branchId === branchId)
    const activeEmployees = branchEmployees.filter((emp) => emp.status === 'active')
    const revenue = invoices.reduce((sum, inv) => sum + getInvoiceServiceTotal(inv), 0)
    const payrollTotal = (report?.rows ?? []).reduce((sum, row) => sum + (row.netSalary ?? 0), 0)
    return {
      employeeCount: branchEmployees.length,
      activeCount: activeEmployees.length,
      invoiceCount: invoices.length,
      revenue,
      payrollTotal,
      attendanceCount: attendanceRecords.length,
    }
  }, [employees, invoices, report, attendanceRecords, branchId])

  const loading = hubLoading || payrollLoading || attendanceLoading

  if (!branch) return null

  return (
    <div className="admin-branches__info-grid">
      <div><span>Chi nhánh</span><strong>{branch.name}</strong></div>
      <div><span>branch_id</span><strong>{branch.id}</strong></div>
      <div><span>Nhân viên</span><strong>{loading ? '…' : `${stats.activeCount} / ${stats.employeeCount}`}</strong></div>
      <div><span>Hóa đơn tháng</span><strong>{loading ? '…' : stats.invoiceCount}</strong></div>
      <div><span>Doanh thu tháng</span><strong>{loading ? '…' : formatCurrency(stats.revenue)}</strong></div>
      <div><span>Lương tháng (TN)</span><strong>{loading ? '…' : formatCurrency(stats.payrollTotal)}</strong></div>
      <div><span>Chấm công tháng</span><strong>{loading ? '…' : stats.attendanceCount}</strong></div>
      <div><span>Trạng thái</span><strong>{branch.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}</strong></div>
      <div><span>Địa chỉ</span><strong>{branch.address || '—'}</strong></div>
      <div><span>Hotline</span><strong>{branch.hotline || '—'}</strong></div>
    </div>
  )
}
