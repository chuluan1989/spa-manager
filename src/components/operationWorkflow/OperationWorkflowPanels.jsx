import { useState } from 'react'
import { formatCurrency } from '../../utils/invoice'
import {
  PRIORITY_ICON,
  PRIORITY_LABEL,
} from '../../utils/operationWorkflow/operationWorkflowConstants'
import { canManageOperationWorkflow } from '../../utils/operationWorkflow/operationWorkflowAccess'
import { toggleDailyTaskComplete } from '../../utils/operationWorkflow/dailyTaskStorage'
import { saveDailyTarget } from '../../utils/operationWorkflow/dailyTargetStorage'
import { addManagerNote, NOTE_PRESETS } from '../../utils/operationWorkflow/managerNotesStorage'
import {
  formatAuditValue,
  getOperationAuditActionLabel,
} from '../../utils/operationWorkflow/operationAuditLog'
import './OperationWorkflow.css'

function money(v) {
  if (v == null || Number.isNaN(v)) return '—'
  return formatCurrency(v)
}

export function CeoActionPanel({ items, onOpenWorkflow }) {
  return (
    <section className="ow-ceo" aria-label="Cần xử lý hôm nay">
      <header className="ow-ceo__head">
        <div>
          <h3>Cần xử lý hôm nay</h3>
          <p className="ow-muted">Ưu tiên điều hành theo dữ liệu thật — không gửi notification.</p>
        </div>
        {typeof onOpenWorkflow === 'function' && (
          <button type="button" className="ow-btn" onClick={onOpenWorkflow}>Mở Công việc</button>
        )}
      </header>
      <ul className="ow-ceo__list">
        {(items ?? []).length === 0 && <li className="ow-muted">Không có việc cần xử lý nổi bật.</li>}
        {(items ?? []).map((item) => (
          <li key={item.id} className={`is-${item.priority}`}>
            <span className="ow-priority">{PRIORITY_ICON[item.priority]} {PRIORITY_LABEL[item.priority]}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function OperationAlertsStrip({ alerts }) {
  if (!alerts?.length) return null
  return (
    <section className="ow-alerts" aria-label="Cảnh báo điều hành">
      <h3>Cảnh báo hôm nay</h3>
      <div className="ow-alerts__row">
        {alerts.slice(0, 6).map((a) => (
          <article key={a.id} className={`ow-alert-card is-${a.priority}`}>
            <span>{PRIORITY_ICON[a.priority]}</span>
            <div>
              <strong>{a.title}</strong>
              <p>{a.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function DailyTaskPanel({ branchId, date, tasks, actor, onChanged, readOnly }) {
  if (!branchId) {
    return <p className="ow-muted">Chọn chi nhánh để xem Daily Task.</p>
  }
  const { catalog, completions } = tasks || { catalog: [], completions: {} }

  const onToggle = (task) => {
    if (readOnly || !canManageOperationWorkflow()) return
    toggleDailyTaskComplete({
      branchId,
      date,
      taskId: task.id,
      taskLabel: task.label,
      completedBy: actor?.id,
      completedByName: actor?.name,
    })
    onChanged?.()
  }

  return (
    <section className="ow-panel">
      <h3>Daily Task · Chi nhánh</h3>
      <ul className="ow-task-list">
        {catalog.map((task) => {
          const done = completions[task.id]
          return (
            <li key={task.id} className={done?.completed ? 'is-done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(done?.completed)}
                  disabled={readOnly || !canManageOperationWorkflow()}
                  onChange={() => onToggle(task)}
                />
                <span>{task.label}</span>
              </label>
              {done?.completed && (
                <small className="ow-muted">
                  {done.completedByName || '—'} · {new Date(done.completedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </small>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TargetQuickForm({ defaults, onSave }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    revenue: defaults?.revenue || '',
    customers: defaults?.customers || '',
    requested: defaults?.requested || '',
    tips: defaults?.tips || '',
  })

  if (!open) {
    return (
      <button type="button" className="ow-btn ow-btn--small" onClick={() => setOpen(true)}>
        {defaults ? 'Sửa' : 'Đặt'}
      </button>
    )
  }

  return (
    <div className="ow-target-form">
      <input type="number" placeholder="DT" value={form.revenue} onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value }))} />
      <input type="number" placeholder="Khách" value={form.customers} onChange={(e) => setForm((f) => ({ ...f, customers: e.target.value }))} />
      <input type="number" placeholder="YC" value={form.requested} onChange={(e) => setForm((f) => ({ ...f, requested: e.target.value }))} />
      <input type="number" placeholder="Tips" value={form.tips} onChange={(e) => setForm((f) => ({ ...f, tips: e.target.value }))} />
      <button
        type="button"
        className="ow-btn ow-btn--small ow-btn--primary"
        onClick={() => {
          onSave(form)
          setOpen(false)
        }}
      >
        Lưu
      </button>
    </div>
  )
}

export function DailyTargetPanel({ rows, date, onChanged, readOnly }) {
  const canEdit = canManageOperationWorkflow() && !readOnly

  const saveRow = (row, form) => {
    saveDailyTarget({
      employeeId: row.employeeId,
      employeeName: row.name,
      branchId: row.branchId,
      date,
      revenue: form.revenue,
      customers: form.customers,
      requested: form.requested,
      tips: form.tips,
    })
    onChanged?.()
  }

  return (
    <section className="ow-panel">
      <h3>Daily Target · Nhân viên</h3>
      <div className="ow-table-wrap">
        <table className="ow-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Tổng %</th>
              <th>Doanh thu</th>
              <th>Khách</th>
              <th>YC</th>
              <th>Tips</th>
              {canEdit && <th>KPI ngày</th>}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.employeeId}>
                <td>{row.name}</td>
                <td>
                  <span className={`ow-pct is-${row.overallTone || 'neutral'}`}>
                    {row.overallPercent == null ? '—' : `${row.overallPercent}%`}
                  </span>
                </td>
                {row.metrics.map((m) => (
                  <td key={m.key}>
                    <div className={`ow-pct is-${m.tone}`}>{m.percent == null ? '—' : `${m.percent}%`}</div>
                    <small className="ow-muted">
                      {m.key === 'customers' || m.key === 'requested'
                        ? `${m.actual}${m.target ? ` / ${m.target}` : ''}`
                        : `${money(m.actual)}${m.target ? ` / ${money(m.target)}` : ''}`}
                    </small>
                  </td>
                ))}
                {canEdit && (
                  <td>
                    <TargetQuickForm
                      defaults={row.target}
                      onSave={(form) => saveRow(row, form)}
                    />
                  </td>
                )}
              </tr>
            ))}
            {!rows?.length && (
              <tr><td colSpan={canEdit ? 7 : 6} className="ow-muted">Không có nhân viên trong phạm vi.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ManagerNotesPanel({ employees, date, actor, notes, onChanged, readOnly }) {
  const [employeeId, setEmployeeId] = useState(employees?.[0]?.id || '')
  const [text, setText] = useState('')
  const canEdit = canManageOperationWorkflow() && !readOnly

  const submit = (value) => {
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp || !value.trim()) return
    addManagerNote({
      employeeId: emp.id,
      employeeName: emp.name,
      branchId: emp.branchId,
      date,
      text: value.trim(),
      authorId: actor?.id,
      authorName: actor?.name,
    })
    setText('')
    onChanged?.()
  }

  return (
    <section className="ow-panel">
      <h3>Manager Action · Ghi chú</h3>
      {canEdit && (
        <div className="ow-note-form">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <div className="ow-note-presets">
            {NOTE_PRESETS.map((p) => (
              <button key={p} type="button" className="ow-chip" onClick={() => submit(p)}>{p}</button>
            ))}
          </div>
          <textarea
            rows={2}
            value={text}
            placeholder="Ghi nhận nhanh…"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="ow-btn ow-btn--primary" onClick={() => submit(text)}>Lưu ghi chú</button>
        </div>
      )}
      <ul className="ow-note-list">
        {(notes ?? []).map((n) => (
          <li key={n.id}>
            <strong>{n.employeeName}</strong>
            <span className="ow-muted">{n.authorName} · {new Date(n.createdAt).toLocaleString('vi-VN')}</span>
            <p>{n.text}</p>
          </li>
        ))}
        {!notes?.length && <li className="ow-muted">Chưa có ghi chú hôm nay.</li>}
      </ul>
    </section>
  )
}

export function EmployeeTimelinePanel({ events, employeeName, date }) {
  return (
    <section className="ow-panel">
      <h3>Timeline · {employeeName || 'Nhân viên'} · {date}</h3>
      <ol className="ow-timeline">
        {(events ?? []).map((ev) => (
          <li key={ev.id} className={`is-${ev.type}`}>
            <time>{ev.timeLabel}</time>
            <div>
              <strong>{ev.title}</strong>
              {ev.detail ? <p>{ev.detail}</p> : null}
            </div>
          </li>
        ))}
        {!events?.length && <li className="ow-muted">Chưa có sự kiện.</li>}
      </ol>
    </section>
  )
}

export function PerformanceHistoryPanel({ history, employeeName }) {
  return (
    <section className="ow-panel">
      <h3>Performance History · {employeeName || '—'}</h3>
      <div className="ow-table-wrap">
        <table className="ow-table">
          <thead>
            <tr>
              <th>Tháng</th>
              <th>Doanh thu</th>
              <th>Khách</th>
              <th>YC</th>
              <th>Tỷ lệ YC</th>
              <th>Tips</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((row) => (
              <tr key={row.monthKey}>
                <td>{row.monthKey}</td>
                <td>{money(row.revenue)}</td>
                <td>{row.customers}</td>
                <td>{row.requested}</td>
                <td>{row.requestedRate == null ? '—' : `${row.requestedRate}%`}</td>
                <td>{money(row.tips)}</td>
              </tr>
            ))}
            {!history?.length && (
              <tr><td colSpan={6} className="ow-muted">Chưa có lịch sử.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function AuditLogPanel({ logs }) {
  return (
    <section className="ow-panel">
      <h3>Audit Log · Thao tác điều hành</h3>
      <div className="ow-table-wrap">
        <table className="ow-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người</th>
              <th>Thao tác</th>
              <th>Đối tượng</th>
              <th>Cũ</th>
              <th>Mới</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td>{log.actorName}</td>
                <td>{getOperationAuditActionLabel(log.action)}</td>
                <td>{log.entityName || log.entityId || '—'}</td>
                <td className="ow-mono">{formatAuditValue(log.oldValue)}</td>
                <td className="ow-mono">{formatAuditValue(log.newValue)}</td>
              </tr>
            ))}
            {!logs?.length && (
              <tr><td colSpan={6} className="ow-muted">Chưa có nhật ký.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="ow-muted">
        Ghi nhận thao tác Công việc / KPI / ghi chú. Lịch sử sửa hóa đơn & chấm công giữ nguyên ở module gốc (không ghi đè engine).
      </p>
    </section>
  )
}
