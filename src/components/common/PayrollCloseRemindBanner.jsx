import { useState } from 'react'
import './PayrollCloseRemindBanner.css'

/**
 * Banner nhắc chốt kỳ — hiện từ ngày nộp trở đi đến khi gửi/duyệt.
 * Thu gọn chỉ áp dụng lần xem hiện tại (không sessionStorage).
 */
export default function PayrollCloseRemindBanner({
  cycleLabel,
  rangeLabel,
  checklist,
  collapsed = false,
  syncing = false,
  onExpand,
  onCollapse,
  onOpenSalary,
  onSyncNow,
  onGoAttendance,
}) {
  const [localSyncError, setLocalSyncError] = useState('')

  if (collapsed) {
    return (
      <div className="payroll-close-remind payroll-close-remind--collapsed" role="status">
        <p className="payroll-close-remind__title">
          Nhắc chốt {cycleLabel}
          {rangeLabel ? ` · ${rangeLabel}` : ''}
        </p>
        <button
          type="button"
          className="payroll-close-remind__btn payroll-close-remind__btn--primary"
          onClick={onExpand}
        >
          Mở lại nhắc
        </button>
      </div>
    )
  }

  const items = [
    { key: 'tour', title: 'Tour/Hóa đơn', item: checklist?.tour },
    { key: 'attendance', title: 'Chấm công', item: checklist?.attendance },
    { key: 'salary', title: 'Bảng lương dự kiến', item: checklist?.salary },
    { key: 'submit', title: 'Gửi chốt', item: checklist?.submit },
  ]

  const needsSync = Boolean(checklist?.tour?.needsSync)
  const needsAttendance = Boolean(checklist?.attendance?.needsAttendance)
  const unsyncedCount = checklist?.tour?.unsyncedCount ?? 0
  const missingDays = checklist?.attendance?.missingDays ?? 0

  async function handleSyncClick() {
    if (!onSyncNow || syncing) return
    setLocalSyncError('')
    try {
      await onSyncNow()
    } catch (err) {
      setLocalSyncError(err?.message ?? 'Đồng bộ thất bại.')
    }
  }

  return (
    <div className="payroll-close-remind" role="status">
      <div className="payroll-close-remind__body">
        <p className="payroll-close-remind__title">
          Đã đến thời gian chốt {cycleLabel}.
        </p>
        <p className="payroll-close-remind__subtitle">
          Vui lòng kiểm tra Tour, chấm công và bảng lương dự kiến trước khi gửi Admin duyệt.
        </p>
        {rangeLabel ? <p className="payroll-close-remind__range">{rangeLabel}</p> : null}

        {checklist ? (
          <ul className="payroll-close-remind__checklist">
            {items.map(({ key, title, item }) => (
              <li
                key={key}
                className={item?.ok ? 'is-ok' : 'is-warn'}
              >
                <span>{title}</span>
                <strong>{item?.label ?? '—'}</strong>
              </li>
            ))}
          </ul>
        ) : null}

        {needsSync ? (
          <div className="payroll-close-remind__alert">
            <p>Còn {unsyncedCount} hóa đơn chưa đồng bộ.</p>
            <button
              type="button"
              className="payroll-close-remind__btn payroll-close-remind__btn--alert"
              disabled={syncing}
              onClick={handleSyncClick}
            >
              {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
          </div>
        ) : null}

        {needsAttendance ? (
          <div className="payroll-close-remind__alert">
            <p>Còn {missingDays} ngày chưa chấm công.</p>
            {checklist?.attendance?.missingDates?.length > 0 ? (
              <p className="payroll-close-remind__missing-dates">
                {checklist.attendance.missingDates
                  .slice(0, 8)
                  .map((d) => {
                    const [, m, day] = d.split('-')
                    return `${day}/${m}`
                  })
                  .join(', ')}
                {checklist.attendance.missingDates.length > 8 ? '…' : ''}
              </p>
            ) : null}
            <button
              type="button"
              className="payroll-close-remind__btn payroll-close-remind__btn--alert"
              onClick={onGoAttendance}
            >
              Đi đến Chấm công
            </button>
          </div>
        ) : null}

        {localSyncError ? (
          <p className="payroll-close-remind__sync-error" role="alert">{localSyncError}</p>
        ) : null}
      </div>
      <div className="payroll-close-remind__actions">
        <button
          type="button"
          className="payroll-close-remind__btn payroll-close-remind__btn--primary"
          onClick={onOpenSalary}
        >
          Kiểm tra &amp; Chốt kỳ lương
        </button>
        <button type="button" className="payroll-close-remind__btn" onClick={onCollapse}>
          Thu gọn
        </button>
      </div>
    </div>
  )
}
