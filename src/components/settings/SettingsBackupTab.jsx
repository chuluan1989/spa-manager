import { useRef, useState } from 'react'
import {
  clearDemoData,
  collectAllData,
  createBackupSnapshot,
  exportAllData,
  getClearDemoDataSummary,
  importAllData,
  restoreFromSnapshot,
} from '../../utils/dataBackup'
import {
  DEFAULT_SYSTEM_SETTINGS,
  loadSystemSettings,
  saveSystemSettings,
} from '../../utils/systemSettingsStorage'

export default function SettingsBackupTab({ showToast }) {
  const fileInputRef = useRef(null)
  const [systemInfo, setSystemInfo] = useState(() => loadSystemSettings())
  const [lastSnapshot, setLastSnapshot] = useState(null)

  const handleExport = () => {
    exportAllData()
    showToast('Đã xuất toàn bộ dữ liệu JSON')
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!window.confirm('Nhập dữ liệu sẽ ghi đè dữ liệu hiện tại. Tiếp tục?')) {
        event.target.value = ''
        return
      }
      importAllData(payload)
      setSystemInfo(loadSystemSettings())
      showToast('Nhập dữ liệu thành công. Đã tự sao lưu bản trước khi nhập.')
    } catch (error) {
      showToast(error?.message ?? 'Không đọc được file JSON')
    } finally {
      event.target.value = ''
    }
  }

  const clearDemoSummary = getClearDemoDataSummary()

  const handleClearDemo = () => {
    const message = [
      'Xóa dữ liệu nghiệp vụ demo?',
      '',
      'Sẽ xóa:',
      ...clearDemoSummary.removed.map((item) => `• ${item}`),
      '',
      'Giữ nguyên:',
      ...clearDemoSummary.kept.map((item) => `• ${item}`),
    ].join('\n')

    if (!window.confirm(message)) {
      return
    }
    clearDemoData()
    showToast('Đã xóa dữ liệu nghiệp vụ demo')
  }

  const handleCreateSnapshot = () => {
    const snapshot = createBackupSnapshot()
    setLastSnapshot(snapshot)
    showToast('Đã tạo bản sao lưu tạm trong phiên làm việc')
  }

  const handleRestoreSnapshot = () => {
    if (!lastSnapshot) {
      showToast('Chưa có bản sao lưu tạm để khôi phục')
      return
    }
    if (!window.confirm('Khôi phục từ bản sao lưu tạm vừa tạo?')) return
    restoreFromSnapshot(lastSnapshot)
    setSystemInfo(loadSystemSettings())
    showToast('Đã khôi phục dữ liệu')
  }

  const handleSaveSystemInfo = () => {
    saveSystemSettings(systemInfo)
    showToast('Lưu thông tin hệ thống thành công')
  }

  const dataSummary = collectAllData()

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Sao lưu & khôi phục dữ liệu</h3>
        <p className="settings__hint">
          Xuất/nhập toàn bộ: hóa đơn, chi phí, nhân viên, chi nhánh, dịch vụ, bảng giá chi nhánh, tài khoản, phân quyền, cài đặt hệ thống.
        </p>
        <div className="settings__backup-summary">
          <span>Hóa đơn: {dataSummary.invoices.length}</span>
          <span>Chi phí: {dataSummary.expenses.length}</span>
          <span>Nhân viên: {dataSummary.employees.length}</span>
          <span>Chi nhánh: {dataSummary.branches.length}</span>
          <span>Dịch vụ: {dataSummary.services.length}</span>
        </div>
        <div className="settings__actions-row">
          <button type="button" className="settings__btn settings__btn--primary" onClick={handleExport}>
            Xuất toàn bộ dữ liệu JSON
          </button>
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => fileInputRef.current?.click()}>
            Nhập dữ liệu JSON
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
          <button type="button" className="settings__btn" onClick={handleCreateSnapshot}>
            Tạo bản sao lưu tạm
          </button>
          <button type="button" className="settings__btn" onClick={handleRestoreSnapshot}>
            Khôi phục bản sao lưu tạm
          </button>
          <button type="button" className="settings__btn settings__btn--danger" onClick={handleClearDemo}>
            Xóa dữ liệu nghiệp vụ demo
          </button>
        </div>
        <p className="settings__hint">
          Xóa demo chỉ gỡ hóa đơn, chi phí và reset nhân viên. Chi nhánh, dịch vụ, bảng giá, tài khoản và phân quyền không đổi.
        </p>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Thông tin hệ thống</h3>
        <div className="settings__form-grid">
          <label className="settings__field">
            <span>Tên hệ thống</span>
            <input
              value={systemInfo.systemName}
              onChange={(e) => setSystemInfo({ ...systemInfo, systemName: e.target.value })}
            />
          </label>
          <label className="settings__field">
            <span>Tên thương hiệu</span>
            <input
              value={systemInfo.brandName}
              onChange={(e) => setSystemInfo({ ...systemInfo, brandName: e.target.value })}
            />
          </label>
          <label className="settings__field">
            <span>Hotline</span>
            <input
              value={systemInfo.hotline}
              onChange={(e) => setSystemInfo({ ...systemInfo, hotline: e.target.value })}
            />
          </label>
          <label className="settings__field settings__field--full">
            <span>Ghi chú</span>
            <textarea
              rows={3}
              value={systemInfo.note}
              onChange={(e) => setSystemInfo({ ...systemInfo, note: e.target.value })}
            />
          </label>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={handleSaveSystemInfo}>
          Lưu thông tin
        </button>
        <p className="settings__hint">Mặc định: {DEFAULT_SYSTEM_SETTINGS.systemName} — {DEFAULT_SYSTEM_SETTINGS.brandName}</p>
      </section>
    </>
  )
}
