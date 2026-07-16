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
            {!status.invoiceReviewComplete && (
              <div className="payroll1-notice__status-row">
                <span>Hóa đơn</span>
                <strong className="payroll1-notice__warn">
                  Chưa xác nhận {status.uncheckedInvoiceCount} ngày
                </strong>
              </div>
            )}
          </div>
        )}

        {count > 0 ? (
          <>
            <p>
              {deadlinePassed
                ? 'Tài khoản đang tạm hạn chế nhập hóa đơn do chưa hoàn thành dữ liệu kỳ lương. Vui lòng hoàn thành các mục còn thiếu hoặc liên hệ Admin.'
                : 'Vui lòng hoàn thành hồ sơ, chấm công và kiểm tra hóa đơn từ ngày 01/07/2026 trước ngày 19/07/2026. Sau thời hạn này, chức năng nhập hóa đơn sẽ tạm bị hạn chế cho đến khi dữ liệu được hoàn tất.'}
            </p>
            <ul>
              {pending.map((task) => (
                <li key={task.id}>{task.label}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Dữ liệu đã hoàn thành. Cảm ơn bạn.</p>
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
