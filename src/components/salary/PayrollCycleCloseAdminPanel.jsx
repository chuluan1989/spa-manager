import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
  isBranchManager,
} from '../../constants/auth'
import { getActiveBranches } from '../../constants/branches'
import { formatCurrency } from '../../utils/invoice'
import { getTodayDate } from '../../utils/invoiceStorage'
import { useDataSyncVersion } from '../../hooks/useDataSyncVersion'
import { consumePayrollCloseReviewPrefill } from '../../utils/navigationPrefill'
import {
  CLOSE_CYCLE_OPTIONS,
  CLOSE_CYCLES,
  formatCloseCycleRangeLabel,
  getDefaultCloseCycleSelection,
} from '../../utils/payrollCycleClose/payCycleCalendar'
import {
  CLOSE_CYCLE_STATUS,
  getCloseCycleStatusLabel,
  isCloseCyclePendingReview,
} from '../../utils/payrollCycleClose/closeCycleStatus'
import { fetchPayrollCycleClosesFiltered } from '../../repositories/payrollCycleCloseRepository'
import {
  approveCloseCycle,
  returnCloseCycle,
} from '../../utils/payrollCycleClose/submitCloseCycle'
import './PayrollCycleCloseAdminPanel.css'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

/**
 * Batch 3 — Admin/QL tổng hợp duyệt chốt kỳ (trong trang Lương).
 * Hooks luôn gọi trước mọi return để không phụ thuộc role.
 */
export default function PayrollCycleCloseAdminPanel() {
  const canManage = isAdmin() || isBranchManager()
  const syncVersion = useDataSyncVersion()
  const reviewPrefill = consumePayrollCloseReviewPrefill()
  const defaults = getDefaultCloseCycleSelection(getTodayDate())
  const [billingMonth, setBillingMonth] = useState(
    () => reviewPrefill?.billingMonth || defaults.billingMonth,
  )
  const [cycle, setCycle] = useState(() => reviewPrefill?.cycle || defaults.cycle)
  const [branchId, setBranchId] = useState(() => (isAdmin() ? '' : getCurrentUserBranch()))
  const [statusFilter, setStatusFilter] = useState(() => (
    reviewPrefill ? '' : ''
  ))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(() => reviewPrefill?.closeId || null)
  const [busy, setBusy] = useState(false)
  const [focusEmployeeId] = useState(() => reviewPrefill?.employeeId || '')

  const reload = useCallback(async () => {
    if (!canManage) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const scopedBranch = canSelectBranch() ? branchId : getCurrentUserBranch()
      const data = await fetchPayrollCycleClosesFiltered({
        billingMonth,
        cycle,
        branchId: scopedBranch || '',
        status: statusFilter || '',
        employeeId: focusEmployeeId || '',
      })
      setRows(data)
      if (focusEmployeeId) {
        const match = data.find((row) => row.employeeId === focusEmployeeId)
          || data.find((row) => row.id === selectedId)
        if (match) setSelectedId(match.id)
      }
    } catch (err) {
      setError(err?.message ?? 'Không tải được danh sách phiếu chốt.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [canManage, billingMonth, cycle, branchId, statusFilter, focusEmployeeId])

  useEffect(() => {
    reload()
  }, [reload, syncVersion])

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  )

  if (!canManage) return null

  const handleApprove = async (row) => {
    if (!isCloseCyclePendingReview(row.status)) {
      window.alert('Chỉ duyệt được phiếu đang chờ duyệt.')
      return
    }
    if (!window.confirm(`Duyệt phiếu của ${row.employeeName}? Snapshot sẽ bị khóa.`)) return
    setBusy(true)
    try {
      await approveCloseCycle({
        employeeId: row.employeeId,
        billingMonth: row.billingMonth,
        cycle: row.cycle,
      })
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không duyệt được.')
    } finally {
      setBusy(false)
    }
  }

  const handleReturn = async (row) => {
    if (row.status === CLOSE_CYCLE_STATUS.APPROVED) {
      window.alert('Không thể trả lại phiếu đã duyệt.')
      return
    }
    if (!isCloseCyclePendingReview(row.status)) {
      window.alert('Chỉ trả lại được phiếu đang chờ duyệt.')
      return
    }
    const reason = window.prompt(`Lý do trả lại phiếu của ${row.employeeName}:`)
    if (reason == null) return
    if (!String(reason).trim()) {
      window.alert('Bắt buộc nhập lý do trả lại.')
      return
    }
    setBusy(true)
    try {
      await returnCloseCycle({
        employeeId: row.employeeId,
        billingMonth: row.billingMonth,
        cycle: row.cycle,
        returnReason: String(reason).trim(),
      })
      await reload()
    } catch (err) {
      window.alert(err?.message ?? 'Không trả lại được.')
    } finally {
      setBusy(false)
    }
  }

  const snapshot = selected?.snapshot

  return (
    <section className="pcc-admin" aria-label="Duyệt chốt kỳ lương">
      <header className="pcc-admin__head">
        <div>
          <h3>Duyệt chốt kỳ lương</h3>
          <p>{formatCloseCycleRangeLabel(billingMonth, cycle)}</p>
        </div>
        <div className="pcc-admin__filters">
          <label>
            Tháng
            <input type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
          </label>
          <label>
            Kỳ
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {CLOSE_CYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {isAdmin() && (
            <label>
              Chi nhánh
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Tất cả</option>
                {getActiveBranches().map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Trạng thái
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value={CLOSE_CYCLE_STATUS.SUBMITTED}>Đã gửi</option>
              <option value={CLOSE_CYCLE_STATUS.RESUBMITTED}>Gửi lại</option>
              <option value={CLOSE_CYCLE_STATUS.RETURNED}>Bị trả lại</option>
              <option value={CLOSE_CYCLE_STATUS.APPROVED}>Đã duyệt</option>
            </select>
          </label>
        </div>
      </header>

      {error && <p className="pcc-admin__error">{error}</p>}
      {loading && <p className="pcc-admin__muted">Đang tải…</p>}

      <div className="pcc-admin__layout">
        <div className="pcc-admin__table-wrap">
          <table className="pcc-admin__table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Kỳ</th>
                <th>Trạng thái</th>
                <th>Tổng lương</th>
                <th>Gửi lúc</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selectedId === row.id ? 'is-selected' : ''}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td>{row.employeeName}</td>
                  <td>{row.cycle === CLOSE_CYCLES.PERIOD_1 ? 'Kỳ 1' : 'Kỳ 2'}</td>
                  <td>{getCloseCycleStatusLabel(row.status)}</td>
                  <td className="is-num">{formatCurrency(row.netSalary)}</td>
                  <td>{formatDateTime(row.resubmittedAt || row.submittedAt)}</td>
                  <td>
                    {isCloseCyclePendingReview(row.status) && (
                      <div className="pcc-admin__row-actions">
                        <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); handleApprove(row) }}>Duyệt</button>
                        <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); handleReturn(row) }}>Trả lại</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="pcc-admin__muted">Không có phiếu trong bộ lọc.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="pcc-admin__detail">
            <header>
              <h4>{selected.employeeName}</h4>
              <button type="button" onClick={() => setSelectedId(null)}>Đóng</button>
            </header>
            <p className="pcc-admin__muted">
              {selected.branchName || selected.branchId}
              {' · '}
              {formatDate(selected.fromDate)} → {formatDate(selected.toDate)}
            </p>
            <p><strong>{getCloseCycleStatusLabel(selected.status)}</strong></p>
            {(selected.returnReason || selected.rejectReason) && (
              <p className="pcc-admin__warn">
                Lý do trả lại: {selected.returnReason || selected.rejectReason}
              </p>
            )}

            <h5>Totals (snapshot)</h5>
            <ul className="pcc-admin__totals">
              <li><span>Hoa hồng</span><strong>{formatCurrency(snapshot?.totals?.commission ?? selected.commission)}</strong></li>
              <li><span>Tips</span><strong>{formatCurrency(snapshot?.totals?.tips ?? selected.tips)}</strong></li>
              <li><span>Thưởng</span><strong>{formatCurrency(snapshot?.totals?.bonus ?? selected.bonus)}</strong></li>
              <li><span>Phạt</span><strong>{formatCurrency(snapshot?.totals?.penalty ?? selected.penalty)}</strong></li>
              <li><span>Tạm ứng</span><strong>{formatCurrency(snapshot?.totals?.advance ?? selected.advance)}</strong></li>
              <li><span>Khoản trừ</span><strong>{formatCurrency(snapshot?.totals?.reduction ?? selected.reduction)}</strong></li>
              <li className="is-total"><span>Tổng</span><strong>{formatCurrency(snapshot?.totals?.netSalary ?? selected.netSalary)}</strong></li>
            </ul>

            <h5>Chấm công (snapshot)</h5>
            <div className="pcc-admin__days">
              {(snapshot?.attendance?.days || selected.attendanceSnapshot || []).map((day) => (
                <div key={day.date}>
                  <span>{formatDate(day.date)}</span>
                  <strong>{day.resultLabel || day.status || '—'}</strong>
                </div>
              ))}
            </div>

            {Array.isArray(selected.submissionHistory) && selected.submissionHistory.length > 0 && (
              <p className="pcc-admin__muted">
                Lịch sử gửi trước: {selected.submissionHistory.length} phiên bản
              </p>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}
