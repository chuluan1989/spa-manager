import { useEffect, useMemo, useState } from 'react'
import {
  getAttendanceStatusLabel,
  getEditableAttendanceStatusOptions,
  isVoidAttendanceStatus,
} from '../../constants/attendanceTypes'
import {
  canEditAttendance,
  getAttendanceEditor,
  isBranchManager,
} from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { fetchAttendanceEditLogs } from '../../repositories/attendanceRepository'
import {
  canEditAttendanceRecord,
  getAttendanceEditBlockReason,
  getAttendanceMonthBounds,
} from '../../utils/attendanceEditPolicy'
import { adminUpdateAttendance, adminVoidAttendance } from '../../utils/attendanceService'
import { getAttendanceSourceLabel } from '../../utils/autoAbsentAttendance'

const MANAGER_EDIT_HINT = 'Dùng khi nhân viên quên chấm công, chấm sai giờ/ngày, quên checkout, hoặc cần điều chỉnh sau khi đã xác minh thực tế.'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('vi-VN')
}

function toTimeInputValue(isoValue) {
  if (!isoValue) return ''
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) return ''
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function combineDateAndTime(dateValue, timeValue, fallbackIso = '') {
  if (!dateValue) return fallbackIso
  const time = timeValue || toTimeInputValue(fallbackIso) || '08:00'
  const parsed = new Date(`${dateValue}T${time}:00`)
  if (Number.isNaN(parsed.getTime())) return fallbackIso
  return parsed.toISOString()
}

function formatLogValue(fieldName, value) {
  if (fieldName === 'status') return getAttendanceStatusLabel(value) || value
  if (fieldName === 'date') return formatDate(value)
  if (fieldName === 'create') {
    const [dateValue, statusValue] = String(value ?? '').split('|')
    return `${formatDate(dateValue)} · ${getAttendanceStatusLabel(statusValue) || statusValue || '—'}`
  }
  if (fieldName === 'check_in' || fieldName === 'check_out') {
    return formatDateTime(value)
  }
  return value || '—'
}

function pickLatestEditSummary(logs) {
  if (!logs?.length) return null
  const latest = logs[0]
  return {
    editorName: latest.editorName || '—',
    editedAt: latest.editedAt,
    reason: latest.note?.trim() || '—',
  }
}

export default function AttendanceEditModal({ record, payrollLocks = [], onClose, onSaved }) {
  const [date, setDate] = useState(record.date ?? '')
  const [status, setStatus] = useState(record.status)
  const [reason, setReason] = useState(record.reason ?? '')
  const [note, setNote] = useState(record.note ?? '')
  const [checkInTime, setCheckInTime] = useState(() => toTimeInputValue(record.submittedAt))
  const [checkOutTime, setCheckOutTime] = useState(() => toTimeInputValue(record.updatedAt))
  const [editReason, setEditReason] = useState('')
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState('')

  const inBranchScope = canEditAttendance(record.branchId)
  const canEdit = canEditAttendanceRecord(record.branchId, record.date, { locks: payrollLocks })
  const editBlockedReason = inBranchScope
    ? getAttendanceEditBlockReason(record.branchId, record.date, { locks: payrollLocks })
    : 'Không có quyền sửa chấm công nhân viên chi nhánh khác.'
  const isVoidRecord = isVoidAttendanceStatus(record.status)
  const statusOptions = getEditableAttendanceStatusOptions()
  const lastEdit = useMemo(() => pickLatestEditSummary(logs), [logs])
  const currentMonthBounds = getAttendanceMonthBounds()

  useEffect(() => {
    let cancelled = false
    fetchAttendanceEditLogs(record.id)
      .then((rows) => {
        if (!cancelled) setLogs(rows)
      })
      .finally(() => {
        if (!cancelled) setLoadingLogs(false)
      })
    return () => {
      cancelled = true
    }
  }, [record.id])

  const validateEditReason = () => {
    if (!editReason.trim()) {
      setError('Vui lòng nhập lý do chỉnh sửa.')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!canEdit || isVoidRecord) return
    if (!validateEditReason()) return
    setSaving(true)
    setError('')
    try {
      const originalCheckIn = toTimeInputValue(record.submittedAt)
      const originalCheckOut = toTimeInputValue(record.updatedAt)
      const dateChanged = date !== record.date
      const checkInChanged = checkInTime !== originalCheckIn
      const checkOutChanged = checkOutTime !== originalCheckOut
      const nextSubmittedAt = (dateChanged || checkInChanged)
        ? combineDateAndTime(date, checkInTime, record.submittedAt)
        : record.submittedAt
      const nextUpdatedAt = (dateChanged || checkOutChanged)
        ? combineDateAndTime(date, checkOutTime, record.updatedAt || record.submittedAt)
        : (record.updatedAt || record.submittedAt)

      await adminUpdateAttendance({
        record,
        nextDate: date,
        nextStatus: status,
        nextReason: reason,
        nextNote: note,
        nextSubmittedAt,
        nextUpdatedAt,
        editNote: editReason.trim(),
        editor: getAttendanceEditor(),
      })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể cập nhật.')
    } finally {
      setSaving(false)
    }
  }

  const handleVoid = async (voidType) => {
    if (!canEdit || voiding) return
    if (!validateEditReason()) return
    const label = voidType === 'invalid' ? 'đánh dấu không hợp lệ' : 'hủy'
    const confirmed = window.confirm(
      `${voidType === 'invalid' ? 'Đánh dấu không hợp lệ' : 'Hủy'} bản ghi chấm công ngày ${formatDate(record.date)} của ${record.employeeName}? Dữ liệu vẫn được lưu để kiểm tra.`,
    )
    if (!confirmed) return

    setVoiding(voidType)
    setError('')
    try {
      await adminVoidAttendance({
        record,
        voidType,
        editNote: editReason.trim(),
        editor: getAttendanceEditor(),
      })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? `Không thể ${label} bản ghi.`)
    } finally {
      setVoiding('')
    }
  }

  return (
    <div className="attendance-edit-modal" role="dialog" aria-modal="true">
      <button type="button" className="attendance-edit-modal__backdrop" onClick={onClose} aria-label="Đóng" />
      <div className="attendance-edit-modal__panel">
        <header>
          <h3>{canEdit && !isVoidRecord ? 'Chỉnh sửa điểm danh' : 'Chi tiết điểm danh'}</h3>
          <p>{record.employeeName}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Nguồn: {getAttendanceSourceLabel(record)}
            {isVoidRecord ? ` · ${getAttendanceStatusLabel(record.status)}` : ''}
          </p>
          {canEdit && isBranchManager() && !isVoidRecord && (
            <p className="attendance-edit-modal__hint">{MANAGER_EDIT_HINT}</p>
          )}
          {!canEdit && inBranchScope && editBlockedReason && (
            <p className="attendance-edit-modal__blocked" role="alert">{editBlockedReason}</p>
          )}
          <button type="button" className="attendance-edit-modal__close" onClick={onClose}>×</button>
        </header>

        <div className="attendance-edit-modal__body">
          <label>
            <span>Ngày chấm công</span>
            <input
              type="date"
              value={date}
              min={canEdit && isBranchManager() ? currentMonthBounds.fromDate : undefined}
              max={canEdit && isBranchManager() ? currentMonthBounds.toDate : undefined}
              disabled={!canEdit || isVoidRecord}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={status} disabled={!canEdit || isVoidRecord} onChange={(e) => setStatus(e.target.value)}>
              {(isVoidRecord
                ? [{ id: record.status, label: getAttendanceStatusLabel(record.status) }]
                : statusOptions
              ).map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="attendance-edit-modal__time-row">
            <label>
              <span>Giờ vào</span>
              <input
                type="time"
                value={checkInTime}
                disabled={!canEdit || isVoidRecord}
                onChange={(e) => setCheckInTime(e.target.value)}
              />
            </label>
            <label>
              <span>Giờ ra</span>
              <input
                type="time"
                value={checkOutTime}
                disabled={!canEdit || isVoidRecord}
                onChange={(e) => setCheckOutTime(e.target.value)}
              />
            </label>
          </div>
          <label>
            <span>Lý do chấm công</span>
            <input type="text" value={reason} disabled={!canEdit || isVoidRecord} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            <span>Ghi chú</span>
            <textarea rows={3} value={note} disabled={!canEdit || isVoidRecord} onChange={(e) => setNote(e.target.value)} />
          </label>
          {canEdit && !isVoidRecord && (
            <label>
              <span>Lý do chỉnh sửa *</span>
              <textarea
                rows={2}
                value={editReason}
                disabled={!canEdit}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Bắt buộc — ghi rõ vì sao chỉnh sửa (quên chấm, sai giờ, sai ngày, quên checkout...)"
              />
            </label>
          )}
          <p className="attendance-edit-modal__penalty">
            Tiền trừ hiện tại: <strong>{formatCurrency(record.penaltyAmount)}</strong>
          </p>
          {error && <p className="attendance-edit-modal__error">{error}</p>}

          <section className="attendance-edit-modal__last-edit">
            <h4>Chỉnh sửa gần nhất</h4>
            {loadingLogs && <p>Đang tải...</p>}
            {!loadingLogs && !lastEdit && <p>Chưa có chỉnh sửa.</p>}
            {!loadingLogs && lastEdit && (
              <dl className="attendance-edit-modal__last-edit-grid">
                <div>
                  <dt>Người chỉnh</dt>
                  <dd>{lastEdit.editorName}</dd>
                </div>
                <div>
                  <dt>Thời gian chỉnh</dt>
                  <dd>{formatDateTime(lastEdit.editedAt)}</dd>
                </div>
                <div>
                  <dt>Lý do chỉnh</dt>
                  <dd>{lastEdit.reason}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="attendance-edit-modal__logs">
            <h4>Lịch sử chỉnh sửa (Audit)</h4>
            {loadingLogs && <p>Đang tải...</p>}
            {!loadingLogs && logs.length === 0 && <p>Chưa có log chỉnh sửa.</p>}
            <ul>
              {logs.map((log) => (
                <li key={log.id}>
                  <strong>{log.editorName}</strong> · {formatDateTime(log.editedAt)}
                  <div>
                    {log.fieldName}: {formatLogValue(log.fieldName, log.oldValue)}
                    {' → '}
                    {formatLogValue(log.fieldName, log.newValue)}
                  </div>
                  {log.note ? <div>Lý do: {log.note}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer>
          {canEdit && !isVoidRecord && (
            <>
              <button
                type="button"
                className="attendance-edit-modal__save"
                disabled={saving || Boolean(voiding) || !editReason.trim()}
                onClick={handleSave}
              >
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button
                type="button"
                className="attendance-edit-modal__void"
                disabled={saving || Boolean(voiding) || !editReason.trim()}
                onClick={() => handleVoid('cancelled')}
              >
                {voiding === 'cancelled' ? 'Đang hủy...' : 'Hủy bản ghi'}
              </button>
              <button
                type="button"
                className="attendance-edit-modal__void is-invalid"
                disabled={saving || Boolean(voiding) || !editReason.trim()}
                onClick={() => handleVoid('invalid')}
              >
                {voiding === 'invalid' ? 'Đang cập nhật...' : 'Không hợp lệ'}
              </button>
            </>
          )}
          <button type="button" className="attendance-edit-modal__cancel" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  )
}
