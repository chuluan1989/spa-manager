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
          <span className="settings__field-hint">Chỉ dùng để nhắc hoàn thiện hồ sơ. Không khóa nhập hóa đơn.</span>
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
            value={settings.payroll1LockDate ?? '2026-07-18'}
            onChange={(event) => setSettings({
              ...settings,
              payroll1LockDate: event.target.value,
            })}
          />
          <span className="settings__field-hint">
            Ngày tham chiếu thông báo hoàn thiện Hồ sơ / Chấm công (không khóa tạo hóa đơn).
            Mặc định 18/07/2026. Thông báo vẫn hiện nếu dữ liệu thiếu; nhân viên/quản lý vẫn tạo và sửa hóa đơn bình thường.
          </span>
        </label>
        <SettingToggle
          label="Bật thông báo kỳ lương 1 (Hồ sơ / Chấm công)"
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

        <h4 className="settings__card-title" style={{ marginTop: 20, fontSize: '1rem' }}>
          Tự động ghi nhận nghỉ không phép
        </h4>
        <SettingToggle
          label="Bật tự động ghi nghỉ không phép khi không chấm công"
          hint="Chạy sau khi hết ngày (mặc định 00:05 ICT ngày kế tiếp). Không ghi trong thời hạn bổ sung kỳ lương 1."
          checked={settings.autoAbsentEnabled === true}
          onChange={(v) => updateSetting('autoAbsentEnabled', v)}
        />
        <label className="settings__field">
          <span className="settings__field-label">Giờ chốt ngày (ICT, tham chiếu)</span>
          <input
            type="time"
            value={settings.autoAbsentCloseTime ?? '00:05'}
            onChange={(event) => setSettings({
              ...settings,
              autoAbsentCloseTime: event.target.value,
            })}
          />
        </label>
        <label className="settings__field">
          <span className="settings__field-label">Ngày bắt đầu áp dụng *</span>
          <input
            type="date"
            value={settings.autoAbsentApplyFrom ?? ''}
            onChange={(event) => setSettings({
              ...settings,
              autoAbsentApplyFrom: event.target.value || '',
            })}
          />
          <span className="settings__field-hint">
            Bắt buộc khi bật tính năng. Chỉ tự ghi từ ngày này trở đi (đổi trong Cài đặt, không cần deploy).
            Ngày trống = không tự động chạy.
          </span>
          {settings.autoAbsentEnabled && !String(settings.autoAbsentApplyFrom || '').trim() && (
            <p className="settings__field-hint" style={{ color: '#b45309', marginTop: 6 }} role="alert">
              Chưa cấu hình ngày bắt đầu áp dụng nghỉ không phép.
            </p>
          )}
        </label>
        <label className="settings__field">
          <span className="settings__field-label">Mức phạt nghỉ nguyên ngày không phép (₫)</span>
          <input
            type="number"
            min="0"
            step="10000"
            value={settings.autoAbsentPenaltyAmount ?? 100000}
            onChange={(event) => setSettings({
              ...settings,
              autoAbsentPenaltyAmount: Number.parseInt(event.target.value, 10) || 0,
            })}
          />
        </label>
        <fieldset className="settings__field">
          <span className="settings__field-label">Ngày trong tuần phải chấm công</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {[
              { id: 1, label: 'T2' },
              { id: 2, label: 'T3' },
              { id: 3, label: 'T4' },
              { id: 4, label: 'T5' },
              { id: 5, label: 'T6' },
              { id: 6, label: 'T7' },
              { id: 0, label: 'CN' },
            ].map((day) => {
              const selected = (settings.autoAbsentWorkDays ?? [1, 2, 3, 4, 5, 6]).includes(day.id)
              return (
                <label key={day.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const current = settings.autoAbsentWorkDays ?? [1, 2, 3, 4, 5, 6]
                      const next = event.target.checked
                        ? [...new Set([...current, day.id])]
                        : current.filter((id) => id !== day.id)
                      setSettings({ ...settings, autoAbsentWorkDays: next })
                    }}
                  />
                  {day.label}
                </label>
              )
            })}
          </div>
          <span className="settings__field-hint">
            Nếu không chọn ngày nào, hệ thống không tự ghi nhận (lịch làm việc chưa xác định).
          </span>
        </fieldset>
        <label className="settings__field">
          <span className="settings__field-label">Ngày nghỉ chung (YYYY-MM-DD, mỗi dòng một ngày)</span>
          <textarea
            rows={3}
            value={(settings.autoAbsentHolidays ?? []).join('\n')}
            onChange={(event) => setSettings({
              ...settings,
              autoAbsentHolidays: event.target.value
                .split(/[\n,]+/)
                .map((item) => item.trim())
                .filter(Boolean),
            })}
          />
        </label>
        <label className="settings__field">
          <span className="settings__field-label">Nhân viên miễn chấm công (mã NV, mỗi dòng một mã)</span>
          <textarea
            rows={3}
            value={(settings.autoAbsentExemptEmployeeIds ?? []).join('\n')}
            onChange={(event) => setSettings({
              ...settings,
              autoAbsentExemptEmployeeIds: event.target.value
                .split(/[\n,]+/)
                .map((item) => item.trim())
                .filter(Boolean),
            })}
          />
        </label>
        <div className="settings__actions-row">
          <button
            type="button"
            className="settings__btn settings__btn--secondary"
            onClick={() => {
              saveSystemSettings(settings)
              showToast('Đã lưu cấu hình tự động nghỉ không phép')
            }}
          >
            Lưu tự động nghỉ không phép
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
