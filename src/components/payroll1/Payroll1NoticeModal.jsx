import { PAYROLL1_NOTICE_TITLE } from '../../utils/payroll1Policy'
import Payroll1Progress from './Payroll1Progress'
import './payroll1.css'

/**
 * Popup thông minh: chỉ liệt kê mục chưa xong.
 * Không lưu "đã đọc" — trạng thái lấy từ Supabase.
 */
export default function Payroll1NoticeModal({ status, onNavigate, onContinue }) {
  const pending = status?.pendingTasks ?? []
  const count = pending.length

  return (
    <div className="payroll1-notice" role="dialog" aria-modal="true" aria-labelledby="payroll1-notice-title">
      <div className="payroll1-notice__backdrop" />
      <div className="payroll1-notice__panel">
        <h2 id="payroll1-notice-title">{PAYROLL1_NOTICE_TITLE}</h2>

        <Payroll1Progress status={status} />

        {status && (
          <div className="payroll1-notice__statuses">
            <div className="payroll1-notice__status-row">
              <span>Hồ sơ</span>
              <strong className={status.profileComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.profileComplete ? '🟢 Đã hoàn thành' : '🔴 Chưa hoàn thành'}
              </strong>
            </div>
            <div className="payroll1-notice__status-row">
              <span>Chấm công</span>
              <strong className={status.attendanceComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.attendanceComplete
                  ? '🟢 Đã kiểm tra'
                  : `🟡 Còn thiếu ${status.missingAttendanceCount} ngày`}
              </strong>
            </div>
            <div className="payroll1-notice__status-row">
              <span>Hóa đơn</span>
              <strong className={status.invoiceReviewComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.invoiceReviewComplete
                  ? '🟢 Đã kiểm tra'
                  : '🔴 Chưa kiểm tra dữ liệu'}
              </strong>
            </div>
          </div>
        )}

        {count > 0 ? (
          <>
            <p>
              <strong>
                Còn {count} việc cần hoàn thành:
              </strong>
            </p>
            <ul>
              {pending.map((task) => (
                <li key={task.id}>{task.label}</li>
              ))}
            </ul>
            <p>
              Hết ngày {status?.lockDateLabel ?? '15/07/2026'}, hệ thống sẽ chốt dữ liệu tính lương kỳ 1.
              Tài khoản thiếu dữ liệu có thể bị khóa nhập hóa đơn sau hạn.
            </p>
          </>
        ) : (
          <p>✅ Dữ liệu kỳ lương 1 đã hoàn thành. Cảm ơn bạn.</p>
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
