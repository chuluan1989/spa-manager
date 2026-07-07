import { useRef, useState } from 'react'
import {
  DEFAULT_ADMIN_PROFILE,
  loadAdminProfile,
  saveAdminProfile,
} from '../../utils/adminProfileStorage'
import { updateAdminPassword } from '../../utils/credentialsStorage'
import { isValidVietnamesePhone } from '../../utils/validators'

function readImageFile(file, onLoad) {
  const reader = new FileReader()
  reader.onload = () => onLoad(String(reader.result ?? ''))
  reader.onerror = () => onLoad('')
  reader.readAsDataURL(file)
}

export default function SettingsAdminProfileTab({ showToast }) {
  const avatarInputRef = useRef(null)
  const logoInputRef = useRef(null)
  const [profile, setProfile] = useState(() => loadAdminProfile())
  const [passwordForm, setPasswordForm] = useState({ next: '', confirm: '' })

  const handleSaveProfile = () => {
    if (profile.phone && !isValidVietnamesePhone(profile.phone)) {
      showToast('Số điện thoại không hợp lệ')
      return
    }
    saveAdminProfile(profile)
    showToast('Đã lưu hồ sơ Admin')
  }

  const handleResetProfile = () => {
    setProfile({ ...DEFAULT_ADMIN_PROFILE })
    saveAdminProfile(DEFAULT_ADMIN_PROFILE)
    showToast('Đã đặt lại hồ sơ Admin mặc định')
  }

  const handleChangePassword = async () => {
    if (!passwordForm.next.trim()) {
      showToast('Vui lòng nhập mật khẩu mới')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      showToast('Mật khẩu xác nhận không khớp')
      return
    }
    await updateAdminPassword(passwordForm.next)
    setPasswordForm({ next: '', confirm: '' })
    showToast('Đổi mật khẩu Admin thành công')
  }

  const handleImagePick = (file, field) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ảnh tối đa 2MB')
      return
    }
    readImageFile(file, (dataUrl) => {
      if (!dataUrl) {
        showToast('Không đọc được file ảnh')
        return
      }
      setProfile((current) => ({ ...current, [field]: dataUrl }))
    })
  }

  return (
    <div className="settings__panel">
      <h3 className="settings__section-title">Hồ sơ quản trị viên</h3>
      <p className="settings__hint">
        Cập nhật thông tin hiển thị và bảo mật tài khoản Admin hệ thống.
      </p>

      <div className="settings__form-grid">
        <label className="settings__field">
          <span>Tên hiển thị</span>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>
        <label className="settings__field">
          <span>Email</span>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
        </label>
        <label className="settings__field">
          <span>Số điện thoại</span>
          <input
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
        </label>
      </div>

      <div className="settings__avatar-row">
        <div className="settings__avatar-preview">
          {profile.avatar ? (
            <img src={profile.avatar} alt="Avatar Admin" />
          ) : (
            <span>Chưa có avatar</span>
          )}
        </div>
        <div className="settings__avatar-actions">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleImagePick(e.target.files?.[0], 'avatar')}
          />
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => avatarInputRef.current?.click()}>
            Đổi Avatar
          </button>
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => setProfile({ ...profile, avatar: '' })}>
            Xóa Avatar
          </button>
        </div>
      </div>

      <div className="settings__avatar-row">
        <div className="settings__avatar-preview settings__avatar-preview--logo">
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt="Logo tùy chỉnh" />
          ) : (
            <span>Logo mặc định hệ thống</span>
          )}
        </div>
        <div className="settings__avatar-actions">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleImagePick(e.target.files?.[0], 'logoUrl')}
          />
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => logoInputRef.current?.click()}>
            Đổi Logo
          </button>
          <button type="button" className="settings__btn settings__btn--secondary" onClick={() => setProfile({ ...profile, logoUrl: '' })}>
            Dùng logo mặc định
          </button>
        </div>
      </div>

      <div className="settings__actions-row">
        <button type="button" className="settings__btn settings__btn--primary" onClick={handleSaveProfile}>
          Lưu hồ sơ
        </button>
        <button type="button" className="settings__btn settings__btn--secondary" onClick={handleResetProfile}>
          Đặt lại mặc định
        </button>
      </div>

      <hr className="settings__divider" />

      <h4 className="settings__subheading">Đổi mật khẩu Admin</h4>
      <div className="settings__form-grid">
        <label className="settings__field">
          <span>Mật khẩu mới</span>
          <input
            type="password"
            value={passwordForm.next}
            onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
          />
        </label>
        <label className="settings__field">
          <span>Xác nhận mật khẩu</span>
          <input
            type="password"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
          />
        </label>
      </div>
      <button type="button" className="settings__btn settings__btn--primary" onClick={handleChangePassword}>
        Cập nhật mật khẩu
      </button>
    </div>
  )
}
