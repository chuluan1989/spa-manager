import { useEffect, useState } from 'react'
import { ATTENDANCE_STATUS_OPTIONS, getAttendanceStatusLabel } from '../../constants/attendanceTypes'
import { canEditAttendance, getCurrentUserEmployeeId, getCurrentUserName, isAdmin } from '../../constants/auth'
import { formatCurrency } from '../../utils/invoice'
import { fetchAttendanceEditLogs } from '../../repositories/attendanceRepository'
import { adminUpdateAttendance } from '../../utils/attendanceService'
import { getAttendanceSourceLabel, isSystemAutoAbsentRecord } from '../../utils/autoAbsentAttendance'

function formatDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export default function AttendanceEditModal({ record, onClose, onSaved }) {
  const [status, setStatus] = useState(record.status)
  const [reason, setReason] = useState(record.reason ?? '')
  const [note, setNote] = useState(record.note ?? '')
  const [editReason, setEditReason] = useState('')
  const [logs, setLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const canEdit = canEditAttendance(record.branchId)
  const isSystemRecord = isSystemAutoAbsentRecord(record)

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

  const handleSave = async () => {
    if (!canEdit) return
    if (isSystemRecord && !editReason.trim()) {
      setError('Bắt buộc nhập lý do chỉnh sửa đối với bản ghi hệ thống tự động.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await adminUpdateAttendance({
        record,
        nextStatus: status,
        nextReason: reason,
        nextNote: note,
        editNote: editReason.trim() || note,
        editor: {
          editorId: isAdmin() ? 'admin' : getCurrentUserEmployeeId(),
          editorName: getCurrentUserName(),
        },
      })
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err?.message ?? 'Không thể cập nhật.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="attendance-edit-modal" role="dialog" aria-modal="true">
      <button type="button" className="attendance-edit-modal__backdrop" onClick={onClose} aria-label="Đóng" />
      <div className="attendance-edit-modal__panel">
        <header>
          <h3>Chỉnh sửa điểm danh</h3>
          <p>{record.employeeName} · {formatDate(record.date)}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Nguồn: {getAttendanceSourceLabel(record)}
          </p>
          <button type="button" className="attendance-edit-modal__close" onClick={onClose}>×</button>
        </header>

        <div className="attendance-edit-modal__body">
          <label>
            <span>Trạng thái</span>
            <select value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value)}>
              {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Lý do</span>
            <input type="text" value={reason} disabled={!canEdit} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            <span>Ghi chú</span>
            <textarea rows={3} value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} />
          </label>
          {isSystemRecord && (
            <label>
              <span>Lý do chỉnh sửa bản ghi hệ thống *</span>
              <textarea
                rows={2}
                value={editReason}
                disabled={!canEdit}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Bắt buộc — ghi rõ vì sao sửa bản ghi tự động"
              />
            </label>
          )}
          <p className="attendance-edit-modal__penalty">
            Tiền trừ hiện tại: <strong>{formatCurrency(record.penaltyAmount)}</strong>
          </p>
          {error && <p className="attendance-edit-modal__error">{error}</p>}

          <section className="attendance-edit-modal__logs">
            <h4>Lịch sử chỉnh sửa</h4>
            {loadingLogs && <p>Đang tải...</p>}
            {!loadingLogs && logs.length === 0 && <p>Chưa có log chỉnh sửa.</p>}
            <ul>
              {logs.map((log) => (
                <li key={log.id}>
                  <strong>{log.editorName}</strong> · {new Date(log.editedAt).toLocaleString('vi-VN')}
                  <div>{log.fieldName}: {getAttendanceStatusLabel(log.oldValue) || log.oldValue} → {getAttendanceStatusLabel(log.newValue) || log.newValue}</div>
                  {log.note ? <div>Ghi chú: {log.note}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer>
          {canEdit && (
            <button type="button" className="attendance-edit-modal__save" disabled={saving} onClick={handleSave}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          )}
          <button type="button" className="attendance-edit-modal__cancel" onClick={onClose}>Đóng</button>
        </footer>
      </div>
    </div>
  )
}
