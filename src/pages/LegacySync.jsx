import { useRef, useState } from 'react'
import { CloudUpload, Search, Download, Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getCurrentUser, isAdmin } from '../constants/auth'
import {
  checkLegacyData,
  importLegacyDataToCloud,
} from '../utils/legacyCloudSync'
import {
  downloadLegacyExport,
  isLegacyImportCompleted,
  loadLegacyImportLogs,
} from '../utils/legacyStorageScanner'
import './LegacySync.css'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function LegacySync() {
  const user = getCurrentUser()
  const fileInputRef = useRef(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [uploadedJson, setUploadedJson] = useState(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const [error, setError] = useState('')

  const importLogs = loadLegacyImportLogs()
  const importCompleted = isLegacyImportCompleted()

  async function handleCheck() {
    setChecking(true)
    setError('')
    setImportResult(null)
    try {
      const result = checkLegacyData(user, { jsonPayload: uploadedJson })
      setCheckResult(result)
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setChecking(false)
    }
  }

  async function handleImport() {
    if (!window.confirm('Đồng bộ dữ liệu cũ lên Cloud? Dữ liệu local sẽ được giữ nguyên.')) return

    setImporting(true)
    setError('')
    try {
      const result = await importLegacyDataToCloud(user, { jsonPayload: uploadedJson })
      setImportResult(result)
      if (result.scan) setCheckResult(checkLegacyData(user, { jsonPayload: uploadedJson }))
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleExport() {
    downloadLegacyExport()
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        setUploadedJson(parsed)
        setUploadFileName(file.name)
        setCheckResult(null)
        setImportResult(null)
        setError('')
      } catch {
        setError('File JSON không hợp lệ.')
        setUploadedJson(null)
        setUploadFileName('')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="legacy-sync">
        <h2 className="legacy-sync__title">Đồng bộ dữ liệu cũ</h2>
        <p className="legacy-sync__warn">
          Supabase chưa được cấu hình. Liên hệ Admin để bật đồng bộ Cloud trước khi import dữ liệu cũ.
        </p>
      </div>
    )
  }

  const counts = checkResult?.scopedCounts
  const scan = checkResult?.scan
  const hasData = checkResult?.hasLegacyData

  return (
    <div className="legacy-sync">
      <header className="legacy-sync__header">
        <CloudUpload size={28} aria-hidden />
        <div>
          <h2 className="legacy-sync__title">Đồng bộ dữ liệu cũ</h2>
          <p className="legacy-sync__subtitle">
            Quét LocalStorage trên thiết bị này và đưa dữ liệu đã nhập trước khi bật Supabase lên hệ thống Cloud.
          </p>
        </div>
      </header>

      {importCompleted && (
        <div className="legacy-sync__note">
          Thiết bị này đã từng import dữ liệu cũ (
          <code>legacy_import_completed=true</code>
          ). Bạn vẫn có thể kiểm tra và import thêm nếu còn dữ liệu chưa có trên Cloud.
        </div>
      )}

      <section className="legacy-sync__actions">
        <button type="button" className="legacy-sync__btn legacy-sync__btn--primary" onClick={handleCheck} disabled={checking || importing}>
          {checking ? <Loader2 className="legacy-sync__spin" size={18} /> : <Search size={18} />}
          Kiểm tra dữ liệu cũ
        </button>
        <button
          type="button"
          className="legacy-sync__btn legacy-sync__btn--accent"
          onClick={handleImport}
          disabled={checking || importing || (checkResult && !hasData && !uploadedJson)}
        >
          {importing ? <Loader2 className="legacy-sync__spin" size={18} /> : <CloudUpload size={18} />}
          Đồng bộ lên Cloud
        </button>
        <button type="button" className="legacy-sync__btn" onClick={handleExport}>
          <Download size={18} />
          Xuất dữ liệu cũ
        </button>
        {isAdmin() && (
          <>
            <button type="button" className="legacy-sync__btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={18} />
              Nhập dữ liệu backup
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleFileSelect} />
          </>
        )}
      </section>

      {uploadFileName && (
        <p className="legacy-sync__file">
          File backup đã chọn: <strong>{uploadFileName}</strong>
        </p>
      )}

      {error && (
        <div className="legacy-sync__error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {checkResult && !hasData && (
        <div className="legacy-sync__empty">
          Không tìm thấy dữ liệu cũ trên thiết bị này.
        </div>
      )}

      {scan && (
        <section className="legacy-sync__panel">
          <h3>Kết quả quét LocalStorage</h3>
          <div className="legacy-sync__stats">
            <div><span>Tổng key localStorage</span><strong>{scan.totalKeys}</strong></div>
            <div><span>Key đã quét</span><strong>{scan.scannedKeys}</strong></div>
            <div><span>Nhân viên</span><strong>{counts?.employees ?? scan.counts.employees}</strong></div>
            <div><span>Hóa đơn/Tour</span><strong>{counts?.invoices ?? scan.counts.invoices}</strong></div>
            <div><span>Chi phí</span><strong>{counts?.expenses ?? scan.counts.expenses}</strong></div>
            <div><span>Dịch vụ</span><strong>{counts?.services ?? scan.counts.services}</strong></div>
            <div><span>Chi nhánh</span><strong>{counts?.branches ?? scan.counts.branches}</strong></div>
            <div><span>Bảng giá chi nhánh</span><strong>{counts?.branchPricing ?? scan.counts.branchPricing}</strong></div>
            <div><span>Cài đặt</span><strong>{counts?.systemSettings ?? scan.counts.systemSettings}</strong></div>
          </div>

          <h4>Chi tiết từng key</h4>
          <div className="legacy-sync__table-wrap">
            <table className="legacy-sync__table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Có dữ liệu</th>
                  <th>Kích thước</th>
                  <th>Loại nhận diện</th>
                  <th>Lỗi parse</th>
                </tr>
              </thead>
              <tbody>
                {scan.keyReports.map((row) => (
                  <tr key={row.key}>
                    <td><code>{row.key}</code></td>
                    <td>{row.hasData ? 'Có' : 'Không'}</td>
                    <td>{formatBytes(row.byteSize)}</td>
                    <td>{row.detectedTypes?.length ? row.detectedTypes.join(', ') : '—'}</td>
                    <td>{row.parseError ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {importResult && (
        <section className={`legacy-sync__panel ${importResult.success ? 'legacy-sync__panel--success' : 'legacy-sync__panel--error'}`}>
          <h3>
            {importResult.success ? (
              <>
                <CheckCircle2 size={20} /> Báo cáo import
              </>
            ) : (
              <>
                <AlertCircle size={20} /> Import gặp lỗi
              </>
            )}
          </h3>
          {importResult.empty ? (
            <p>{importResult.message}</p>
          ) : (
            <>
              <div className="legacy-sync__stats">
                <div><span>Phát hiện (phạm vi tài khoản)</span><strong>{importResult.detected?.total ?? 0}</strong></div>
                <div><span>Import thành công</span><strong>{importResult.importedTotal ?? 0}</strong></div>
                <div><span>Bỏ qua (trùng Cloud)</span><strong>{importResult.skippedTotal ?? 0}</strong></div>
                <div><span>Lỗi</span><strong>{importResult.errorCount ?? 0}</strong></div>
              </div>
              <ul className="legacy-sync__report">
                <li>Nhân viên: phát hiện {importResult.detected?.employees ?? 0}, import {importResult.imported?.employees ?? 0}, bỏ qua {importResult.skipped?.employees ?? 0}</li>
                <li>Hóa đơn/Tour: phát hiện {importResult.detected?.invoices ?? 0}, import {importResult.imported?.invoices ?? 0}, bỏ qua {importResult.skipped?.invoices ?? 0}</li>
                <li>Chi phí: phát hiện {importResult.detected?.expenses ?? 0}, import {importResult.imported?.expenses ?? 0}, bỏ qua {importResult.skipped?.expenses ?? 0}</li>
                <li>Dịch vụ: phát hiện {importResult.detected?.services ?? 0}, import {importResult.imported?.services ?? 0}, bỏ qua {importResult.skipped?.services ?? 0}</li>
              </ul>
              {importResult.errors?.length > 0 && (
                <div className="legacy-sync__errors-list">
                  <strong>Chi tiết lỗi:</strong>
                  <ul>
                    {importResult.errors.map((item, index) => (
                      <li key={`${item.entity}-${index}`}>
                        [{item.entity}] {item.message}
                        {item.count ? ` (${item.count} dòng)` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {importLogs.length > 0 && (
        <section className="legacy-sync__panel">
          <h3>Lịch sử import gần đây</h3>
          <ul className="legacy-sync__logs">
            {importLogs.slice(0, 5).map((log, index) => (
              <li key={log.at ?? index}>
                {log.at} — import {log.importedTotal ?? 0} dòng, bỏ qua {log.skippedTotal ?? 0}, lỗi {log.errorCount ?? 0}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
