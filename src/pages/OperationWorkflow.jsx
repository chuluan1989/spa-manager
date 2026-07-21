import { useMemo, useState } from 'react'
import { canSelectBranch, isEmployee } from '../constants/auth'
import { loadBranches } from '../constants/branches'
import { useOperationWorkflowData } from '../hooks/useOperationWorkflowData'
import { canManageOperationWorkflow } from '../utils/operationWorkflow/operationWorkflowAccess'
import {
  AuditLogPanel,
  DailyTargetPanel,
  DailyTaskPanel,
  EmployeeTimelinePanel,
  ManagerNotesPanel,
  PerformanceHistoryPanel,
} from '../components/operationWorkflow/OperationWorkflowPanels'
import '../components/operationWorkflow/OperationWorkflow.css'

const TABS = [
  { id: 'tasks', label: 'Daily Task' },
  { id: 'targets', label: 'Daily Target' },
  { id: 'notes', label: 'Manager Action' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'history', label: 'Performance History' },
  { id: 'audit', label: 'Audit Log' },
]

export default function OperationWorkflow() {
  const [tab, setTab] = useState(isEmployee() ? 'timeline' : 'tasks')
  const [branchId, setBranchId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [timelineDate, setTimelineDate] = useState('')

  const data = useOperationWorkflowData({
    selectedBranchId: branchId,
    selectedEmployeeId: employeeId,
    timelineDate,
  })

  const branches = useMemo(() => loadBranches().filter((b) => b?.id), [])
  const readOnly = isEmployee() || !canManageOperationWorkflow()
  const focusName = data.focusEmployee?.name
    || data.employees.find((e) => e.id === data.focusEmployeeId)?.name
    || '—'

  return (
    <div className="erp-page ow-page">
      <header className="ow-page__header">
        <div>
          <h1>Công việc</h1>
          <p className="ow-muted">Điều hành hằng ngày — task, KPI, ghi chú, timeline, lịch sử & audit.</p>
        </div>
        <button type="button" className="ow-btn" onClick={data.reload} disabled={data.loading}>
          {data.loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </header>

      {data.error ? <p className="ow-muted" style={{ color: '#b91c1c' }}>{data.error}</p> : null}

      <div className="ow-tabs" role="tablist">
        {TABS.filter((t) => {
          if (isEmployee() && (t.id === 'tasks' || t.id === 'notes' || t.id === 'audit')) return false
          return true
        }).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ow-filters">
        {canSelectBranch() && (
          <label>
            Chi nhánh
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Tất cả / mặc định</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        )}
        {!isEmployee() && (
          <label>
            Nhân viên (Timeline / History)
            <select
              value={employeeId || data.focusEmployeeId || ''}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        )}
        {(tab === 'timeline') && (
          <label>
            Ngày
            <input
              type="date"
              value={timelineDate || data.today}
              onChange={(e) => setTimelineDate(e.target.value)}
            />
          </label>
        )}
      </div>

      {tab === 'tasks' && (
        <DailyTaskPanel
          branchId={data.taskBranchId || branchId}
          date={data.today}
          tasks={data.dailyTasks}
          actor={data.actor}
          onChanged={data.bumpLocal}
          readOnly={readOnly}
        />
      )}

      {tab === 'targets' && (
        <DailyTargetPanel
          rows={data.targetProgress}
          date={data.today}
          onChanged={data.bumpLocal}
          readOnly={readOnly}
        />
      )}

      {tab === 'notes' && (
        <ManagerNotesPanel
          employees={data.employees}
          date={data.today}
          actor={data.actor}
          notes={data.notesToday}
          onChanged={data.bumpLocal}
          readOnly={readOnly}
        />
      )}

      {tab === 'timeline' && (
        <EmployeeTimelinePanel
          events={data.timeline}
          employeeName={focusName}
          date={data.timelineDate}
        />
      )}

      {tab === 'history' && (
        <PerformanceHistoryPanel
          history={data.performanceHistory}
          employeeName={focusName}
        />
      )}

      {tab === 'audit' && (
        <AuditLogPanel logs={data.auditLogs} />
      )}
    </div>
  )
}
