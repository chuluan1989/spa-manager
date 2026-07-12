import { useEffect, useMemo, useState } from 'react'
import { canSelectBranch, getCurrentUserBranch, isAdmin, isBranchManager } from '../constants/auth'
import { getActiveBranches } from '../constants/branches'
import { getBranchName } from '../utils/branchStorage'
import { formatVnDate } from '../utils/ictTime'
import { filterPayroll1AdminRows } from '../utils/payroll1Policy'
import { loadPayroll1AdminRows, setPayroll1EmployeeOverride } from '../utils/payroll1Service'
import '../components/payroll1/payroll1.css'

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'incomplete_profile', label: 'Chưa hoàn thành Hồ sơ' },
  { id: 'incomplete_attendance', label: 'Chưa hoàn thành Chấm công' },
  { id: 'incomplete_invoices', label: 'Chưa hoàn thành Hóa đơn' },
  { id: 'incomplete', label: 'Chưa xong' },
  { id: 'complete', label: 'Đã hoàn thành 100%' },
]

export default function Payroll1AdminPage() {
  const [branchId, setBranchId] = useState(() => (canSelectBranch() ? '' : getCurrentUserBranch()))
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busyId, setBusyId] = useState('')

  const branches = useMemo(() => getActiveBranches(), [])
  const visibleRows = useMemo(() => filterPayroll1AdminRows(rows, filter), [rows, filter])

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
        <p>Tiến độ tính trực tiếp từ Supabase — đồng bộ đa máy.</p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        {canSelectBranch() && (
          <label className="payroll1-backfill" style={{ maxWidth: 280, margin: 0 }}>
            Chi nhánh
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Tất cả</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="payroll1-admin-filters" role="group" aria-label="Lọc tiến độ">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'is-active' : ''}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

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
              <th>Tiến độ</th>
              <th>Còn thiếu</th>
              <th>Khóa HĐ</th>
              <th>Cập nhật cuối</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.employeeId}>
                <td>{getBranchName(row.branchId) || row.branchName || '—'}</td>
                <td>{row.employeeName}</td>
                <td>
                  <strong>{row.progressPercent ?? 0}%</strong>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {row.profileComplete ? '✓ Hồ sơ' : '○ Hồ sơ'}
                    {' · '}
                    {row.attendanceComplete ? '✓ Chấm công' : '○ Chấm công'}
                    {' · '}
                    {row.invoiceReviewComplete ? '✓ Hóa đơn' : '○ Hóa đơn'}
                  </div>
                </td>
                <td>
                  {(row.missingSummary ?? []).length > 0
                    ? (row.missingSummary ?? []).join('; ')
                    : '—'}
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
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={7}>Không có nhân viên phù hợp bộ lọc.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Hạn chốt mặc định: hết ngày {formatVnDate('2026-07-15')} (ICT). Gia hạn trong Cài đặt → Kỳ lương 1.
      </p>
    </div>
  )
}
