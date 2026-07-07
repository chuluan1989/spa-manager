import { useMemo, useState } from 'react'
import {
  getAuditActionLabel,
  loadEmployeeAuditLogs,
} from '../../utils/employeeAuditLog'
import { loadEmployees } from '../../utils/employeeStorage'

function formatDateTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SettingsAuditLogTab() {
  const employees = useMemo(() => loadEmployees(), [])
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const logs = useMemo(() => {
    const all = loadEmployeeAuditLogs({ limit: 500 })
    return all.filter((entry) => {
      if (employeeFilter && entry.employeeId !== employeeFilter) return false
      if (actionFilter && entry.action !== actionFilter) return false
      return true
    })
  }, [employeeFilter, actionFilter])

  const actionOptions = useMemo(() => {
    const set = new Set(logs.map((entry) => entry.action))
    return [...set].sort()
  }, [logs])

  return (
    <div className="settings__panel">
      <h3 className="settings__section-title">Nhật ký thao tác nhân viên</h3>
      <p className="settings__hint">
        Ghi nhận đổi trạng thái, chuyển chi nhánh, lưu trữ, cập nhật hồ sơ và xóa vĩnh viễn.
      </p>

      <div className="settings__filters settings__filters--inline">
        <div className="settings__filter-field">
          <span>Nhân viên</span>
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name || emp.id}</option>
            ))}
          </select>
        </div>
        <div className="settings__filter-field">
          <span>Loại thao tác</span>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">Tất cả</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>{getAuditActionLabel(action)}</option>
            ))}
          </select>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="settings__hint">Chưa có nhật ký thao tác.</p>
      ) : (
        <div className="settings__table-wrap">
          <table className="settings__table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Nhân viên</th>
                <th>Thao tác</th>
                <th>Chi tiết</th>
                <th>Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>{entry.employeeName || entry.employeeId}</td>
                  <td>{getAuditActionLabel(entry.action)}</td>
                  <td>{entry.details || '—'}</td>
                  <td>{entry.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
