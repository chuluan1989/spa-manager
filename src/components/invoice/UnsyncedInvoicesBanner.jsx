import { useCallback, useEffect, useState } from 'react'
import { CloudUpload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import {
  checkUnsyncedLocalInvoices,
  migrateLocalInvoicesToSupabase,
  shouldShowUnsyncedInvoicesBanner,
} from '../../utils/invoiceLegacyMigrate'
import '../common/LegacyCloudSyncBanner.css'

export default function UnsyncedInvoicesBanner({ user, onSyncComplete }) {
  const [checking, setChecking] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [checkError, setCheckError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const refreshPending = useCallback(async () => {
    if (!shouldShowUnsyncedInvoicesBanner(user)) {
      setPendingCount(0)
      setCheckError('')
      setChecking(false)
      return { hasUnsynced: false, count: 0 }
    }

    setChecking(true)
    const result = await checkUnsyncedLocalInvoices(user)
    setPendingCount(result.count ?? 0)
    setCheckError(result.error ?? '')
    setChecking(false)
    return result
  }, [user])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await migrateLocalInvoicesToSupabase(user)
      setSyncResult(result)
      if (result.success) {
        await refreshPending()
        onSyncComplete?.()
      }
    } catch (error) {
      setSyncResult({
        success: false,
        imported: 0,
        failed: 1,
        errors: [{ message: error?.message ?? String(error) }],
      })
    } finally {
      setSyncing(false)
    }
  }

  if (!shouldShowUnsyncedInvoicesBanner(user)) return null
  if (checking && !syncResult) return null

  const visible = pendingCount > 0 || Boolean(syncResult)
  if (!visible) return null

  return (
    <div className={`legacy-sync-banner${syncResult?.success ? ' legacy-sync-banner--success' : ''}`}>
      <div className="legacy-sync-banner__content">
        <CloudUpload className="legacy-sync-banner__icon" size={22} aria-hidden />

        {syncResult?.success ? (
          <div className="legacy-sync-banner__text">
            <strong>Đồng bộ hóa đơn cũ thành công!</strong>
            <p className="legacy-sync-banner__summary">
              Đã đưa {syncResult.imported ?? 0} hóa đơn lên Supabase.
              {(syncResult.skipped ?? 0) > 0 ? ` Bỏ qua ${syncResult.skipped} hóa đơn đã có.` : ''}
              Dữ liệu trên máy vẫn được giữ nguyên.
            </p>
          </div>
        ) : (
          <div className="legacy-sync-banner__text">
            <strong>Có dữ liệu hóa đơn cũ chưa đồng bộ.</strong>
            <p>
              Hệ thống phát hiện {pendingCount} hóa đơn trên máy này chưa có trên Supabase.
              Bấm đồng bộ để Admin, Báo cáo và Lương nhìn thấy dữ liệu cũ.
            </p>
            {checkError && (
              <p className="legacy-sync-banner__error">
                <AlertCircle size={16} aria-hidden />
                {checkError}
              </p>
            )}
            {syncResult && !syncResult.success && (
              <p className="legacy-sync-banner__error">
                <AlertCircle size={16} aria-hidden />
                {syncResult.message ?? 'Đồng bộ thất bại.'}
                {(syncResult.errors ?? [])
                  .slice(0, 2)
                  .map((item) => item.message)
                  .join(' ')}
              </p>
            )}
          </div>
        )}

        {!syncResult?.success && pendingCount > 0 && (
          <button
            type="button"
            className="legacy-sync-banner__button"
            onClick={handleSync}
            disabled={syncing || Boolean(checkError)}
          >
            {syncing ? (
              <>
                <Loader2 className="legacy-sync-banner__spin" size={16} aria-hidden />
                Đang đồng bộ...
              </>
            ) : (
              'Đồng bộ lên hệ thống'
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
