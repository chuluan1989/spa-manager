import Payroll1Progress from './Payroll1Progress'
import './payroll1.css'

/**
 * Banner nhắc Hồ sơ / Chấm công — không chặn, không modal, không khóa Hóa đơn.
 */
export default function Payroll1StatusBanner({ status, onNavigate }) {
  if (!status) return null

  if (status.dataComplete) {
    return (
      <div className="payroll1-banner payroll1-banner--done" role="status">
        ✅ Hồ sơ và Chấm công đã hoàn thành. Cảm ơn bạn.
      </div>
    )
  }

  const pending = status.pendingTasks ?? []

  return (
    <div className="payroll1-banner payroll1-banner--todo" role="status">
      <div className="payroll1-banner__body">
        <Payroll1Progress status={status} compact />
        <p className="payroll1-banner__summary">
          Nhắc nhở: {pending.map((task) => task.label).join(' · ')}. Bạn vẫn tạo và sửa hóa đơn bình thường.
        </p>
      </div>
      <div className="payroll1-banner__actions">
        {pending.slice(0, 2).map((task) => (
          <button key={task.id} type="button" onClick={() => onNavigate?.(task.pageId)}>
            {task.buttonLabel}
          </button>
        ))}
      </div>
    </div>
  )
}
