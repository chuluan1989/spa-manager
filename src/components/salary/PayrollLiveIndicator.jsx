function formatLiveTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function PayrollLiveIndicator({ updatedAt, isRefreshing = false }) {
  return (
    <div className={`salary-live${isRefreshing ? ' salary-live--syncing' : ''}`} title="Live Payroll — cập nhật theo thời gian thực">
      <span className="salary-live__dot" aria-hidden />
      <span className="salary-live__label">Live</span>
      {updatedAt && (
        <span className="salary-live__time">
          {isRefreshing ? 'Đang cập nhật…' : `Cập nhật ${formatLiveTime(updatedAt)}`}
        </span>
      )}
    </div>
  )
}
