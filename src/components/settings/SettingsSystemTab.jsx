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
  toggleSystemSetting,
} from '../../utils/systemSettingsStorage'
import { loadAdminProfile, saveAdminProfile } from '../../utils/adminProfileStorage'
import { IMAGE_CATEGORIES, uploadImageFile } from '../../utils/imageStorage'

function SettingToggle({ label, hint, checked, onChange }) {
  return (
    <label className="settings__switch-row">
      <div>
        <span className="settings__switch-label">{label}</span>
        {hint && <span className="settings__switch-hint">{hint}</span>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export default function SettingsSystemTab({ showToast }) {
  const fileInputRef = useRef(null)
  const logoInputRef = useRef(null)
  const [settings, setSettings] = useState(() => loadSystemSettings())
  const [lastSnapshot, setLastSnapshot] = useState(null)
  const dataSummary = collectAllData()

  const updateSetting = (key, value) => {
    const next = toggleSystemSetting(key, value)
    setSettings(next)
    showToast('Đã cập nhật cấu hình')
  }

  const handleSaveBrand = () => {
    saveSystemSettings(settings)
    const profile = loadAdminProfile()
    saveAdminProfile({ ...profile, logoUrl: settings.logoUrl ?? '' })
    showToast('Đã lưu giao diện thương hiệu')
  }

  const handleExport = () => {
    exportAllData()
    showToast('Đã xuất backup JSON')
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!window.confirm('Nhập dữ liệu sẽ ghi đè dữ liệu hiện tại. Tiếp tục?')) return
      importAllData(payload)
      setSettings(loadSystemSettings())
      showToast('Nhập dữ liệu thành công')
    } catch (error) {
      showToast(error?.message ?? 'Không đọc được file JSON')
    } finally {
      event.target.value = ''
    }
  }

  const handleLogoPick = async (file) => {
    if (!file || file.size > 2 * 1024 * 1024) {
      showToast('Ảnh logo tối đa 2MB')
      return
    }
    try {
      const logoUrl = await uploadImageFile(file, {
        category: IMAGE_CATEGORIES.BRAND_LOGO,
        entityId: 'brand',
        maxBytes: 2 * 1024 * 1024,
        skipCompress: true,
      })
      setSettings({ ...settings, logoUrl })
    } catch (error) {
      showToast(error?.message ?? 'Upload logo thất bại')
    }
  }

  return (
    <>
      <section className="settings__card">
        <h3 className="settings__card-title">Cấu hình nghiệp vụ</h3>
        <div className="settings__switch-list">
          <SettingToggle label="Cho phép giảm giá" checked={settings.allowDiscount} onChange={(v) => updateSetting('allowDiscount', v)} />
          <SettingToggle label="Cho phép nhập tips" checked={settings.allowTips} onChange={(v) => updateSetting('allowTips', v)} />
          <SettingToggle label="Nhân viên sửa hóa đơn của mình" checked={settings.allowEmployeeEditOwnInvoice} onChange={(v) => updateSetting('allowEmployeeEditOwnInvoice', v)} />
          <SettingToggle label="Quản lý sửa hóa đơn chi nhánh" checked={settings.allowManagerEditBranchInvoice} onChange={(v) => updateSetting('allowManagerEditBranchInvoice', v)} />
          <SettingToggle label="Chỉ Admin được xóa hóa đơn" checked={settings.onlyAdminDeleteInvoice} onChange={(v) => updateSetting('onlyAdminDeleteInvoice', v)} />
          <SettingToggle label="Bắt buộc hoàn thiện hồ sơ trước khi nhập tour" checked={settings.requireCompleteProfileBeforeTour} onChange={(v) => updateSetting('requireCompleteProfileBeforeTour', v)} />
        </div>
        <label className="settings__field">
          <span className="settings__field-label">Hạn hoàn thiện hồ sơ nhân viên</span>
          <input
            type="date"
            value={settings.employeeProfileDeadline ?? '2026-07-10'}
            onChange={(event) => setSettings({
              ...settings,
              employeeProfileDeadline: event.target.value,
            })}
          />
          <span className="settings__field-hint">Sau ngày này, nhân viên chưa hoàn thiện hồ sơ sẽ bị khóa tạo hóa đơn và chấm công.</span>
        </label>
        <div className="settings__actions-row">
          <button
            type="button"
            className="settings__btn settings__btn--secondary"
            onClick={() => {
              saveSystemSettings(settings)
              showToast('Đã lưu hạn hoàn thiện hồ sơ')
            }}
          >
            Lưu hạn hồ sơ
          </button>
        </div>
        <label className="settings__field">
          <span className="settings__field-label">Kỳ lương 1 — ngày bắt đầu kiểm tra</span>
          <input
            type="date"
            value={settings.payroll1PeriodStart ?? '2026-07-01'}
            onChange={(event) => setSettings({
              ...settings,
              payroll1PeriodStart: event.target.value,
            })}
          />
        </label>
        <label className="settings__field">
          <span className="settings__field-label">Kỳ lương 1 — hạn chốt (khóa sau 23:59 ICT)</span>
          <input
            type="date"
            value={settings.payroll1LockDate ?? '2026-07-15'}
            onChange={(event) => setSettings({
              ...settings,
              payroll1LockDate: event.target.value,
            })}
          />
          <span className="settings__field-hint">
            Sau 23:59 ngày này (Asia/Ho_Chi_Minh), nhân viên thiếu dữ liệu bị khóa tạo hóa đơn mới cho đến khi hoàn tất.
            Gia hạn bằng cách chọn ngày mới rồi Lưu.
          </span>
        </label>
        <SettingToggle
          label="Bật thông báo / khóa kỳ lương 1"
          checked={settings.payroll1Enabled !== false}
          onChange={(v) => updateSetting('payroll1Enabled', v)}
        />
        <div className="settings__actions-row">
          <button
            type="button"
            className="settings__btn settings__btn--secondary"
            onClick={() => {
              saveSystemSettings(settings)
              showToast('Đã lưu cấu hình kỳ lương 1')
            }}
          >
            Lưu kỳ lương 1
          </button>
        </div>
        <label className="settings__field">
          <span className="settings__field-label">Ngưỡng doanh thu Khách VIP (₫)</span>
          <input
            type="number"
            min="0"
            step="100000"
            value={settings.vipCustomerThreshold ?? 10000000}
            onChange={(event) => setSettings({
              ...settings,
              vipCustomerThreshold: Number.parseInt(event.target.value, 10) || 0,
            })}
          />
          <span className="settings__field-hint">Khách đạt tổng doanh thu vé từ mức này sẽ được phân loại VIP.</span>
        </label>
        <div className="settings__actions-row">
          <button
            type="button"
            className="settings__btn settings__btn--secondary"
            onClick={() => {
              saveSystemSettings(settings)
              showToast('Đã lưu ngưỡng Khách VIP')
            }}
          >
            Lưu ngưỡng VIP
          </button>
        </div>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Dữ liệu</h3>
        <div className="settings__switch-list">
          <SettingToggle label="Bật Realtime" checked={settings.realtimeEnabled} onChange={(v) => updateSetting('realtimeEnabled', v)} />
          <SettingToggle label="Cảnh báo dữ liệu cũ LocalStorage" checked={settings.warnLegacyLocalStorage} onChange={(v) => updateSetting('warnLegacyLocalStorage', v)} />
        </div>
        <div className="settings__backup-summary">
          <span>HĐ: {dataSummary.invoices.length}</span>
          <span>Chi phí: {dataSummary.expenses.length}</span>
          <span>NV: {dataSummary.employees.length}</span>
          <span>CN: {dataSummary.branches.length}</span>
        </div>
        <div className="settings__actions-row">
          <button type="button" className="settings__btn settings__btn--primary" onClick={handleExport}>Xuất backup JSON</button>
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => fileInputRef.current?.click()}>Nhập backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
          <button type="button" className="settings__btn" onClick={() => { setLastSnapshot(createBackupSnapshot()); showToast('Đã tạo bản sao lưu tạm') }}>
            Backup tạm
          </button>
          <button
            type="button"
            className="settings__btn"
            onClick={() => {
              if (!lastSnapshot) { showToast('Chưa có bản sao lưu tạm'); return }
              restoreFromSnapshot(lastSnapshot)
              setSettings(loadSystemSettings())
              showToast('Đã khôi phục')
            }}
          >
            Khôi phục tạm
          </button>
          <button
            type="button"
            className="settings__btn settings__btn--danger"
            onClick={() => {
              if (!window.confirm('Xóa dữ liệu nghiệp vụ demo?')) return
              clearDemoData()
              showToast('Đã xóa dữ liệu demo')
            }}
          >
            Xóa demo
          </button>
        </div>
        <p className="settings__hint">{getClearDemoDataSummary().kept.join(' · ')}</p>
      </section>

      <section className="settings__card">
        <h3 className="settings__card-title">Giao diện thương hiệu</h3>
        <div className="settings__form-grid">
          <label className="settings__field">
            <span>Slogan</span>
            <input value={settings.slogan} onChange={(e) => setSettings({ ...settings, slogan: e.target.value })} />
          </label>
          <label className="settings__field">
            <span>Hotline</span>
            <input value={settings.hotline} onChange={(e) => setSettings({ ...settings, hotline: e.target.value })} />
          </label>
          <label className="settings__field">
            <span>Màu chính</span>
            <input type="color" value={settings.primaryColor} onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })} />
          </label>
          <label className="settings__field">
            <span>Tên thương hiệu</span>
            <input value={settings.brandName} onChange={(e) => setSettings({ ...settings, brandName: e.target.value })} />
          </label>
        </div>
        <div className="settings__avatar-row">
          <div className="settings__avatar-preview settings__avatar-preview--logo">
            {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" /> : <span>Logo</span>}
          </div>
          <div className="settings__avatar-actions">
            <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={(e) => handleLogoPick(e.target.files?.[0])} />
            <button type="button" className="settings__btn settings__btn--secondary" onClick={() => logoInputRef.current?.click()}>Đổi logo</button>
          </div>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={handleSaveBrand}>Lưu thương hiệu</button>
        <p className="settings__hint">Mặc định: {DEFAULT_SYSTEM_SETTINGS.brandName}</p>
      </section>
    </>
  )
}
