import { useState } from 'react'
import { formatPayrollCloseSubmitCta } from '../../utils/payrollCycleClose/employmentPeriodGate'
import {
  PAYROLL_CLOSE_BANNER_MODE,
} from '../../utils/payrollCycleClose/closeRemind'
import './PayrollCloseRemindBanner.css'

/**
 * Banner chốt kỳ — neo kỳ đang đến hạn theo lịch.
 * needs_action/returned → nhắc gửi; submitted → chờ duyệt (không nhắc); approved → đã duyệt.
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
  onViewPendingPeriods,
}) {
  const [localSyncError, setLocalSyncError] = useState('')
  const bannerMode = checklist?.bannerMode || PAYROLL_CLOSE_BANNER_MODE.NEEDS_ACTION
  const nagSubmit = checklist?.nagSubmit !== false
    && (
      bannerMode === PAYROLL_CLOSE_BANNER_MODE.NEEDS_ACTION
      || bannerMode === PAYROLL_CLOSE_BANNER_MODE.RETURNED
    )
  const pendingOlderCount = checklist?.pendingOlderCount ?? 0
  const pendingOlderMessage = checklist?.pendingOlderMessage || ''
  const primaryCta = bannerMode === PAYROLL_CLOSE_BANNER_MODE.RETURNED
    ? 'Gửi lại'
    : formatPayrollCloseSubmitCta(cycleLabel)

  if (collapsed) {
    const collapsedTitle = bannerMode === PAYROLL_CLOSE_BANNER_MODE.WAITING
      ? `Đã gửi ${cycleLabel} — chờ duyệt`
      : bannerMode === PAYROLL_CLOSE_BANNER_MODE.APPROVED
        ? `Đã duyệt ${cycleLabel}`
        : bannerMode === PAYROLL_CLOSE_BANNER_MODE.RETURNED
          ? `Đã trả lại ${cycleLabel}`
          : `Nhắc chốt ${cycleLabel}`
    return (
      <div className={`payroll-close-remind payroll-close-remind--collapsed payroll-close-remind--${bannerMode}`} role="status">
        <p className="payroll-close-remind__title">
          {collapsedTitle}
          {rangeLabel ? ` · ${rangeLabel}` : ''}
        </p>
        <button
          type="button"
          className="payroll-close-remind__btn payroll-close-remind__btn--primary"
          onClick={onExpand}
        >
          Mở lại
        </button>
      </div>
    )
  }

  const items = nagSubmit
    ? [
        { key: 'tour', title: 'Tour/Hóa đơn', item: checklist?.tour },
        { key: 'attendance', title: 'Chấm công', item: checklist?.attendance },
        { key: 'salary', title: 'Bảng lương dự kiến', item: checklist?.salary },
        { key: 'submit', title: 'Gửi chốt', item: checklist?.submit },
      ]
    : []

  const needsSync = Boolean(checklist?.tour?.needsSync)
  const needsAttendance = Boolean(checklist?.attendance?.needsAttendance)
  const unsyncedCount = checklist?.tour?.unsyncedCount ?? 0
  const missingDays = checklist?.attendance?.missingDays ?? 0
  const employmentStartWarning = checklist?.employmentStartWarning || ''
  const returnReason = checklist?.returnReason || ''
  const submittedAtLabel = checklist?.submittedAtLabel || ''
  const approvedAtLabel = checklist?.approvedAtLabel || ''
  const recipients = checklist?.recipients || ['Quản lý', 'Admin']

  async function handleSyncClick() {
    if (!onSyncNow || syncing) return
    setLocalSyncError('')
    try {
      await onSyncNow()
    } catch (err) {
      setLocalSyncError(err?.message ?? 'Đồng bộ thất bại.')
    }
  }

  let title = `Đã đến thời gian chốt ${cycleLabel}.`
  let subtitle = 'Vui lòng kiểm tra Tour, chấm công và bảng lương dự kiến trước khi gửi Admin duyệt.'
  if (bannerMode === PAYROLL_CLOSE_BANNER_MODE.WAITING) {
    title = 'Đã gửi'
    subtitle = 'Đang chờ Quản lý/Admin duyệt'
  } else if (bannerMode === PAYROLL_CLOSE_BANNER_MODE.APPROVED) {
    title = 'Đã duyệt'
    subtitle = `${cycleLabel} đã được duyệt.`
  } else if (bannerMode === PAYROLL_CLOSE_BANNER_MODE.RETURNED) {
    title = 'Đã trả lại'
    subtitle = 'Vui lòng bổ sung theo lý do trả và gửi lại.'
  }

  return (
    <div className={`payroll-close-remind payroll-close-remind--${bannerMode}`} role="status">
      <div className="payroll-close-remind__body">
        <p className="payroll-close-remind__title">{title}</p>
        <p className="payroll-close-remind__subtitle">{subtitle}</p>
        {rangeLabel ? <p className="payroll-close-remind__range">{rangeLabel}</p> : null}

        {bannerMode === PAYROLL_CLOSE_BANNER_MODE.WAITING ? (
          <div className="payroll-close-remind__status-box">
            {submittedAtLabel ? (
              <p>
                Đã gửi lúc:
                {' '}
                <strong>{submittedAtLabel}</strong>
              </p>
            ) : null}
            <p>
              Người nhận:
              {' '}
              <strong>{recipients.join(', ')}</strong>
            </p>
          </div>
        ) : null}

        {bannerMode === PAYROLL_CLOSE_BANNER_MODE.APPROVED ? (
          <div className="payroll-close-remind__status-box payroll-close-remind__status-box--ok">
            {approvedAtLabel ? (
              <p>
                Duyệt lúc:
                {' '}
                <strong>{approvedAtLabel}</strong>
              </p>
            ) : (
              <p><strong>Kỳ này đã được duyệt.</strong></p>
            )}
          </div>
        ) : null}

        {bannerMode === PAYROLL_CLOSE_BANNER_MODE.RETURNED && returnReason ? (
          <div className="payroll-close-remind__status-box payroll-close-remind__status-box--return">
            <p>
              Lý do trả:
              {' '}
              <strong>{returnReason}</strong>
            </p>
          </div>
        ) : null}

        {nagSubmit && checklist ? (
          <ul className="payroll-close-remind__checklist">
            {items.map(({ key, title: itemTitle, item }) => (
              <li
                key={key}
                className={item?.ok ? 'is-ok' : 'is-warn'}
              >
                <span>{itemTitle}</span>
                <strong>{item?.label ?? '—'}</strong>
              </li>
            ))}
          </ul>
        ) : null}

        {pendingOlderCount > 0 && pendingOlderMessage ? (
          <div className="payroll-close-remind__older">
            <p>{pendingOlderMessage}</p>
            {onViewPendingPeriods ? (
              <button
                type="button"
                className="payroll-close-remind__btn payroll-close-remind__btn--older"
                onClick={onViewPendingPeriods}
              >
                Xem các kỳ còn thiếu
              </button>
            ) : null}
          </div>
        ) : null}

        {employmentStartWarning ? (
          <p className="payroll-close-remind__sync-error" role="status">
            {employmentStartWarning}
          </p>
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
        {nagSubmit ? (
          <button
            type="button"
            className="payroll-close-remind__btn payroll-close-remind__btn--primary"
            onClick={onOpenSalary}
          >
            {primaryCta}
          </button>
        ) : (
          <button
            type="button"
            className="payroll-close-remind__btn"
            onClick={onOpenSalary}
          >
            Xem bảng chốt
          </button>
        )}
        <button type="button" className="payroll-close-remind__btn" onClick={onCollapse}>
          Thu gọn
        </button>
      </div>
    </div>
  )
}
