import Payroll1Progress from './Payroll1Progress'
import './payroll1.css'

/**
 * Dòng nhắc nhỏ sau khi đóng popup / khi đã hoàn thành.
 * Trạng thái luôn tính từ Supabase (qua props status).
 */
export default function Payroll1StatusBanner({ status, onOpenTasks, onNavigate }) {
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
          Còn {pending.length} việc: {pending.map((task) => task.label).join(' · ')}
        </p>
      </div>
      <div className="payroll1-banner__actions">
        {pending.slice(0, 2).map((task) => (
          <button key={task.id} type="button" onClick={() => onNavigate?.(task.pageId)}>
            {task.buttonLabel}
          </button>
        ))}
        <button type="button" className="payroll1-banner__more" onClick={onOpenTasks}>
          Xem chi tiết
        </button>
      </div>
    </div>
  )
}
