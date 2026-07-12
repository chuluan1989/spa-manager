import { useEffect, useMemo, useState } from 'react'
import { canSelectBranch, getCurrentUserBranch, isAdmin, isBranchManager } from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import { getBranchName } from '../utils/branchStorage'
import { formatVnDate } from '../utils/ictTime'
import { loadPayroll1AdminRows, setPayroll1EmployeeOverride } from '../utils/payroll1Service'
import '../components/payroll1/payroll1.css'

export default function Payroll1AdminPage() {
  const [branchId, setBranchId] = useState(() => (canSelectBranch() ? '' : getCurrentUserBranch()))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busyId, setBusyId] = useState('')

  const branches = useMemo(() => getActiveBranches(), [])

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loadPayroll1AdminRows({ branchId })
      setRows(next)
    } catch (err) {
      setError(err?.message ?? 'Không tải được bảng tổng hợp.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [branchId])

  const showToast = (message, isError = false) => {
    setToast({ message, isError })
    window.setTimeout(() => setToast(''), 3000)
  }

  const handleOverride = async (employeeId, patch) => {
    setBusyId(employeeId)
    try {
      await setPayroll1EmployeeOverride({ employeeId, ...patch })
      showToast('Đã cập nhật trạng thái.')
      await reload()
    } catch (err) {
      showToast(err?.message ?? 'Không cập nhật được.', true)
    } finally {
      setBusyId('')
    }
  }

  if (!isAdmin() && !isBranchManager()) {
    return <p>Bạn không có quyền xem tổng hợp kỳ lương 1.</p>
  }

  return (
    <div className="payroll1-page">
      <header className="payroll1-page__head">
        <h1>Tổng hợp hoàn thiện dữ liệu kỳ lương 1</h1>
        <p>Trạng thái lấy từ Supabase — đồng bộ đa máy. Quản lý chỉ xem nhân viên chi nhánh mình.</p>
      </header>

      {canSelectBranch() && (
        <label className="payroll1-backfill" style={{ maxWidth: 320 }}>
          Chi nhánh
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Tất cả</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
      )}

      {toast && (
        <div className={`payroll1-toast${toast.isError ? ' payroll1-toast--error' : ''}`}>
          {toast.message}
        </div>
      )}
      {error && <div className="payroll1-toast payroll1-toast--error">{error}</div>}
      {loading && <p>Đang tải...</p>}

      <div className="payroll1-table-wrap">
        <table className="payroll1-table">
          <thead>
            <tr>
              <th>Chi nhánh</th>
              <th>Nhân viên</th>
              <th>Hồ sơ</th>
              <th>Thiếu chấm công</th>
              <th>Hóa đơn</th>
              <th>Khóa HĐ</th>
              <th>Cập nhật cuối</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId}>
                <td>{getBranchName(row.branchId) || row.branchName || '—'}</td>
                <td>{row.employeeName}</td>
                <td>
                  <span className={`payroll1-badge ${row.profileComplete ? 'payroll1-badge--ok' : 'payroll1-badge--warn'}`}>
                    {row.profileStatusLabel}
                  </span>
                </td>
                <td>{row.missingAttendanceCount}</td>
                <td>
                  <span className={`payroll1-badge ${row.invoiceReviewComplete ? 'payroll1-badge--ok' : 'payroll1-badge--warn'}`}>
                    {row.invoiceStatusLabel}
                  </span>
                </td>
                <td>
                  <span className={`payroll1-badge ${row.invoiceCreateLocked ? 'payroll1-badge--lock' : 'payroll1-badge--ok'}`}>
                    {row.invoiceCreateLocked ? 'Đang khóa' : 'Mở'}
                    {row.manualUnlock ? ' (thủ công)' : ''}
                    {row.adminConfirmed ? ' (Admin OK)' : ''}
                  </span>
                </td>
                <td>{row.lastUpdatedAt ? new Date(row.lastUpdatedAt).toLocaleString('vi-VN') : '—'}</td>
                <td>
                  <div className="payroll1-table__actions payroll1-admin__actions">
                    <button
                      type="button"
                      disabled={busyId === row.employeeId}
                      onClick={() => handleOverride(row.employeeId, {
                        adminConfirmed: true,
                        manualUnlock: row.manualUnlock,
                      })}
                    >
                      Xác nhận hoàn thành
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.employeeId}
                      onClick={() => handleOverride(row.employeeId, {
                        manualUnlock: true,
                        adminConfirmed: row.adminConfirmed,
                      })}
                    >
                      Mở khóa thủ công
                    </button>
                    {(row.manualUnlock || row.adminConfirmed) && (
                      <button
                        type="button"
                        disabled={busyId === row.employeeId}
                        onClick={() => handleOverride(row.employeeId, {
                          manualUnlock: false,
                          adminConfirmed: false,
                        })}
                      >
                        Hủy override
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8}>Không có nhân viên trong phạm vi.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Hạn chốt mặc định: hết ngày {formatVnDate('2026-07-15')} (ICT). Gia hạn trong Cài đặt → Kỳ lương 1.
        Sửa chấm công: dùng trang Chấm công Admin.
      </p>
    </div>
  )
}
