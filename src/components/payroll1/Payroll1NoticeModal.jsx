import { PAYROLL1_NOTICE_TITLE } from '../../utils/payroll1Policy'
import { formatVnDate } from '../../utils/ictTime'
import './payroll1.css'

export default function Payroll1NoticeModal({ status, onNavigate, onConfirmRead }) {
  const lockLabel = status?.lockDateLabel || formatVnDate('2026-07-15')

  return (
    <div className="payroll1-notice" role="dialog" aria-modal="true" aria-labelledby="payroll1-notice-title">
      <div className="payroll1-notice__backdrop" />
      <div className="payroll1-notice__panel">
        <h2 id="payroll1-notice-title">{PAYROLL1_NOTICE_TITLE}</h2>
        <p>Vui lòng kiểm tra và hoàn thành:</p>
        <ul>
          <li>Hồ sơ cá nhân.</li>
          <li>Chấm công từ ngày 01/07/2026 đến hôm nay.</li>
          <li>Kiểm tra và nhập đầy đủ các hóa đơn/tour đã thực hiện từ ngày 01/07/2026 đến hôm nay.</li>
        </ul>
        <p>
          Hết ngày {lockLabel}, hệ thống sẽ chốt dữ liệu tính lương kỳ 1.
        </p>
        <p>
          Tài khoản chưa hoàn thành hồ sơ, chấm công hoặc dữ liệu hóa đơn sẽ bị khóa chức năng nhập hóa đơn
          cho đến khi hoàn tất.
        </p>

        {status && (
          <div className="payroll1-notice__statuses">
            <div className="payroll1-notice__status-row">
              <span>Hồ sơ</span>
              <strong className={status.profileComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.profileStatusLabel}
              </strong>
            </div>
            <div className="payroll1-notice__status-row">
              <span>Chấm công</span>
              <strong className={status.attendanceComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.attendanceStatusLabel}
                {!status.attendanceComplete ? ` (${status.missingAttendanceCount} ngày)` : ''}
              </strong>
            </div>
            <div className="payroll1-notice__status-row">
              <span>Hóa đơn</span>
              <strong className={status.invoiceReviewComplete ? 'payroll1-notice__ok' : 'payroll1-notice__warn'}>
                {status.invoiceStatusLabel}
              </strong>
            </div>
          </div>
        )}

        <div className="payroll1-notice__actions">
          <button type="button" onClick={() => onNavigate('profile')}>Kiểm tra hồ sơ</button>
          <button type="button" onClick={() => onNavigate('attendance')}>Kiểm tra chấm công</button>
          <button type="button" onClick={() => onNavigate('payroll1-check')}>Kiểm tra hóa đơn</button>
          <button type="button" className="payroll1-notice__confirm" onClick={onConfirmRead}>
            Xác nhận đã đọc
          </button>
        </div>
      </div>
    </div>
  )
}
