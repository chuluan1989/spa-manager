import { formatOpsLastUpdated } from '../../utils/opsCenter/opsCenterRefresh'

export default function OpsRefreshBar({
  lastUpdatedAt,
  refreshing = false,
  onRefresh,
}) {
  return (
    <div className="ops-center__refresh" role="status">
      <span className="ops-center__refresh-meta">
        {refreshing ? 'Đang làm mới…' : null}
        {!refreshing && lastUpdatedAt
          ? `Cập nhật lần cuối: ${formatOpsLastUpdated(lastUpdatedAt)}`
          : null}
        {!refreshing && !lastUpdatedAt ? 'Chưa cập nhật' : null}
      </span>
      <button
        type="button"
        className="ops-center__refresh-btn"
        onClick={onRefresh}
        disabled={refreshing}
      >
        Làm mới
      </button>
    </div>
  )
}
