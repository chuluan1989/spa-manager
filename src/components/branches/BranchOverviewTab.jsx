import { useMemo } from 'react'
import { getBranchById, getStatusLabel, BRANCH_STATUS } from '../../utils/branchStorage'
import { employeeBelongsToBranch, recordBelongsToBranch } from '../../utils/branchEmployeeMatch'
import { getCurrentMonthValue, getPayPeriodRange, PAY_CYCLES } from '../../utils/salaryReport'
import { formatCurrency, getInvoicePayment, getInvoiceServiceTotal } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useEmployeeHubData } from '../../hooks/useEmployeeHubData'
import { usePayrollData } from '../../hooks/usePayrollData'
import { useBranchAttendance } from './useBranchAttendance'
import BranchEmptyState from './BranchEmptyState'

export default function BranchOverviewTab({ branchId }) {
  const branch = getBranchById(branchId)
  const month = getCurrentMonthValue()
  const today = getTodayDate()
  const { fromDate, toDate } = getPayPeriodRange(month, PAY_CYCLES.FULL)

  const { employees, invoices, loading: hubLoading, error: hubError } = useEmployeeHubData({ branchId, month })
  const { report, loading: payrollLoading, error: payrollError } = usePayrollData({ month, branchId })
  const { records: attendanceRecords, loading: attendanceLoading, error: attendanceError } = useBranchAttendance({
    branchId,
    fromDate,
    toDate,
  })

  const branchInvoices = useMemo(
    () => invoices.filter((inv) => recordBelongsToBranch(inv, branchId)),
    [invoices, branchId],
  )

  const stats = useMemo(() => {
    const branchEmployees = employees.filter((emp) => employeeBelongsToBranch(emp, branchId))
    const todayInvoices = branchInvoices.filter((inv) => inv.date === today)
    const revenueToday = todayInvoices.reduce((sum, inv) => sum + getInvoicePayment(inv), 0)
    const revenueMonth = branchInvoices.reduce((sum, inv) => sum + getInvoiceServiceTotal(inv), 0)
    const payrollTotal = (report?.rows ?? []).reduce((sum, row) => sum + (row.netSalary ?? 0), 0)
    const todayAttendance = attendanceRecords.filter((row) => row.date === today).length
    return {
      employeeCount: branchEmployees.length,
      invoiceCount: branchInvoices.length,
      revenueToday,
      revenueMonth,
      payrollTotal,
      attendanceToday: todayAttendance,
      attendanceMonth: attendanceRecords.length,
    }
  }, [employees, branchInvoices, report, attendanceRecords, branchId, today])

  const loading = hubLoading || payrollLoading || attendanceLoading
  const error = hubError || payrollError || attendanceError
  const hasData = stats.employeeCount > 0
    || stats.invoiceCount > 0
    || stats.attendanceMonth > 0
    || stats.payrollTotal > 0

  if (!branch) {
    return <BranchEmptyState message={`Không tìm thấy chi nhánh (branch_id: ${branchId || '—'}).`} />
  }

  return (
    <div className="admin-branches__overview">
      {error && (
        <p className="admin-branches__hint admin-branches__hint--error">{error}</p>
      )}

      <div className="admin-branches__info-grid">
        <div><span>Tên chi nhánh</span><strong>{branch.name}</strong></div>
        <div><span>branch_id</span><strong>{branch.id}</strong></div>
        <div><span>Địa chỉ</span><strong>{branch.address || '—'}</strong></div>
        <div><span>Hotline</span><strong>{branch.hotline || '—'}</strong></div>
        <div>
          <span>Trạng thái</span>
          <strong>{branch.status === BRANCH_STATUS.LOCKED ? 'Tạm khóa' : getStatusLabel(branch.status)}</strong>
        </div>
        <div><span>Tổng nhân viên</span><strong>{loading ? '…' : stats.employeeCount}</strong></div>
        <div><span>Doanh thu hôm nay</span><strong>{loading ? '…' : formatCurrency(stats.revenueToday)}</strong></div>
        <div><span>Doanh thu tháng này</span><strong>{loading ? '…' : formatCurrency(stats.revenueMonth)}</strong></div>
        <div><span>Tổng hóa đơn (tháng)</span><strong>{loading ? '…' : stats.invoiceCount}</strong></div>
        <div><span>Tổng lương tạm tính</span><strong>{loading ? '…' : formatCurrency(stats.payrollTotal)}</strong></div>
        <div><span>Tổng chấm công hôm nay</span><strong>{loading ? '…' : stats.attendanceToday}</strong></div>
        <div><span>Chấm công tháng</span><strong>{loading ? '…' : stats.attendanceMonth}</strong></div>
      </div>

      {!loading && !error && !hasData && (
        <BranchEmptyState />
      )}
    </div>
  )
}
