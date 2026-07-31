import './PayrollCloseRemindBanner.css'

/**
 * Banner nhắc chốt kỳ — ngày 02 (Kỳ 1) / ngày 17 (Kỳ 2).
 */
export default function PayrollCloseRemindBanner({
  cycleLabel,
  rangeLabel,
  onOpenSalary,
  onDismiss,
}) {
  return (
    <div className="payroll-close-remind" role="status">
      <div className="payroll-close-remind__body">
        <p className="payroll-close-remind__title">
          Đã đến thời gian chốt {cycleLabel}. Vui lòng kiểm tra chấm công và gửi bảng lương cho Admin duyệt.
        </p>
        {rangeLabel ? <p className="payroll-close-remind__range">{rangeLabel}</p> : null}
      </div>
      <div className="payroll-close-remind__actions">
        <button
          type="button"
          className="payroll-close-remind__btn payroll-close-remind__btn--primary"
          onClick={onOpenSalary}
        >
          Mở Lương / Chốt kỳ
        </button>
        <button type="button" className="payroll-close-remind__btn" onClick={onDismiss}>
          Để sau
        </button>
      </div>
    </div>
  )
}
