import { useCallback, useEffect, useState } from 'react'
import { CloudUpload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import {
  detectPendingLegacyData,
  shouldShowLegacySyncBanner,
  syncLegacyDataToCloud,
} from '../../utils/legacyCloudSync'
import './LegacyCloudSyncBanner.css'

export default function LegacyCloudSyncBanner({ user, onSyncComplete }) {
  const [checking, setChecking] = useState(true)
  const [pendingResult, setPendingResult] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const refreshPending = useCallback(async () => {
    setChecking(true)
    const result = await detectPendingLegacyData(user)
    setPendingResult(result)
    setChecking(false)
    return result
  }, [user])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  const visible = !checking && shouldShowLegacySyncBanner(user, pendingResult)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncLegacyDataToCloud(user)
      setSyncResult(result)
      if (result.success) {
        await refreshPending()
        onSyncComplete?.()
      }
    } catch (error) {
      setSyncResult({
        success: false,
        errorCount: 1,
        errors: [{ entity: 'sync', message: error?.message ?? String(error) }],
        synced: {},
      })
    } finally {
      setSyncing(false)
    }
  }

  if (checking && !syncResult) return null
  if (!visible && !syncResult) return null

  const totals = pendingResult?.totals
  const synced = syncResult?.synced ?? {}

  return (
    <div className={`legacy-sync-banner${syncResult?.success ? ' legacy-sync-banner--success' : ''}`}>
      <div className="legacy-sync-banner__content">
        <CloudUpload className="legacy-sync-banner__icon" size={22} aria-hidden />

        {syncResult?.success ? (
          <div className="legacy-sync-banner__text">
            <strong>Đồng bộ dữ liệu cũ thành công!</strong>
            <p className="legacy-sync-banner__summary">
              Đã đồng bộ {synced.employees ?? 0} nhân viên, {synced.invoices ?? 0} hóa đơn/tour,
              {synced.expenses ?? 0} chi phí
              {(synced.services ?? 0) > 0 ? `, ${synced.services} dịch vụ` : ''}.
              {syncResult.errorCount > 0 ? ` ${syncResult.errorCount} lỗi.` : ''}
            </p>
          </div>
        ) : (
          <div className="legacy-sync-banner__text">
            <strong>Bạn có dữ liệu cũ trên máy này.</strong>
            <p>Bấm đồng bộ để đưa lên hệ thống — dữ liệu local sẽ được giữ nguyên cho đến khi import thành công.</p>
            {totals?.total > 0 && (
              <p className="legacy-sync-banner__counts">
                Chưa đồng bộ: {totals.employees} nhân viên, {totals.invoices} hóa đơn/tour,
                {totals.expenses} chi phí
                {totals.services > 0 ? `, ${totals.services} dịch vụ` : ''}.
              </p>
            )}
            {syncResult && !syncResult.success && (
              <p className="legacy-sync-banner__error">
                <AlertCircle size={16} aria-hidden />
                Đồng bộ thất bại ({syncResult.errorCount ?? 0} lỗi).
                {(syncResult.errors ?? [])
                  .slice(0, 2)
                  .map((item) => item.message)
                  .join(' ')}
              </p>
            )}
          </div>
        )}

        {!syncResult?.success && (
          <button
            type="button"
            className="legacy-sync-banner__button"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="legacy-sync-banner__spin" size={16} aria-hidden />
                Đang đồng bộ...
              </>
            ) : (
              'Đồng bộ dữ liệu cũ'
            )}
          </button>
        )}

        {syncResult?.success && (
          <CheckCircle2 className="legacy-sync-banner__success-icon" size={24} aria-hidden />
        )}
      </div>
    </div>
  )
}
