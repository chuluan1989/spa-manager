import {
  PAYROLL1_NOTICE_AFTER_DEADLINE,
  PAYROLL1_NOTICE_BEFORE_DEADLINE,
  PAYROLL1_NOTICE_TITLE,
} from '../../utils/payroll1Policy'
import Payroll1Progress from './Payroll1Progress'
import './payroll1.css'

/**
 * Popup: chỉ Hồ sơ + Chấm công. Không nhắc hóa đơn / tour / doanh thu.
 */
export default function Payroll1NoticeModal({ status, onNavigate, onContinue }) {
  const pending = status?.pendingTasks ?? []
  const count = pending.length
  const deadlinePassed = Boolean(status?.deadlinePassed)

  return (
    <div className="payroll1-notice" role="dialog" aria-modal="true" aria-labelledby="payroll1-notice-title">
      <div className="payroll1-notice__backdrop" />
      <div className="payroll1-notice__panel">
        <h2 id="payroll1-notice-title">{PAYROLL1_NOTICE_TITLE}</h2>

        <Payroll1Progress status={status} />

        {status && (
          <div className="payroll1-notice__statuses">
            {!status.profileComplete && (
              <div className="payroll1-notice__status-row">
                <span>Hồ sơ</span>
                <strong className="payroll1-notice__warn">
                  Còn thiếu {(status.pendingTasks.find((t) => t.id === 'profile')?.detail || '').replace(/^Còn thiếu:\s*/, '') || 'thông tin bắt buộc'}
                </strong>
              </div>
            )}
            {!status.attendanceComplete && (
              <div className="payroll1-notice__status-row">
                <span>Chấm công</span>
                <strong className="payroll1-notice__warn">
                  Còn thiếu {status.missingAttendanceCount} ngày
                </strong>
              </div>
            )}
          </div>
        )}

        {count > 0 ? (
          <>
            <p>
              {deadlinePassed ? PAYROLL1_NOTICE_AFTER_DEADLINE : PAYROLL1_NOTICE_BEFORE_DEADLINE}
            </p>
            <ul>
              {pending.map((task) => (
                <li key={task.id}>{task.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Hồ sơ và Chấm công đã hoàn thành. Cảm ơn bạn.</p>
        )}

        <div className="payroll1-notice__actions">
          {pending.map((task) => (
            <button key={task.id} type="button" onClick={() => onNavigate(task.pageId)}>
              {task.buttonLabel}
            </button>
          ))}
          <button type="button" className="payroll1-notice__confirm" onClick={onContinue}>
            Tiếp tục làm việc
          </button>
        </div>
      </div>
    </div>
  )
}
