import { useRef, useState } from 'react'
import {
  DEFAULT_ADMIN_PROFILE,
  loadAdminProfile,
  saveAdminProfile,
} from '../../utils/adminProfileStorage'
import { IMAGE_CATEGORIES, uploadImageFile } from '../../utils/imageStorage'
import { verifyAdminPassword, updateAdminPassword } from '../../utils/credentialsStorage'
import { isValidVietnamesePhone } from '../../utils/validators'

export default function SettingsAdminProfileTab({ showToast }) {
  const avatarInputRef = useRef(null)
  const [profile, setProfile] = useState(() => loadAdminProfile())
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })

  const handleSaveProfile = () => {
    if (profile.phone && !isValidVietnamesePhone(profile.phone)) {
      showToast('Số điện thoại không hợp lệ')
      return
    }
    saveAdminProfile(profile)
    showToast('Đã lưu hồ sơ Admin')
  }

  const handleChangePassword = async () => {
    if (!passwordForm.current.trim()) {
      showToast('Vui lòng nhập mật khẩu hiện tại')
      return
    }
    if (!(await verifyAdminPassword(passwordForm.current))) {
      showToast('Mật khẩu hiện tại không đúng')
      return
    }
    if (!passwordForm.next.trim()) {
      showToast('Vui lòng nhập mật khẩu mới')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      showToast('Mật khẩu xác nhận không khớp')
      return
    }
    await updateAdminPassword(passwordForm.next)
    setPasswordForm({ current: '', next: '', confirm: '' })
    showToast('Đổi mật khẩu thành công')
  }

  const handleImagePick = async (file) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ảnh tối đa 2MB')
      return
    }
    try {
      const avatarUrl = await uploadImageFile(file, {
        category: IMAGE_CATEGORIES.ADMIN_AVATAR,
        entityId: 'admin',
        maxBytes: 2 * 1024 * 1024,
        skipCompress: true,
      })
      setProfile((current) => ({ ...current, avatar: avatarUrl }))
    } catch (error) {
      showToast(error?.message ?? 'Upload ảnh thất bại')
    }
  }

  return (
    <div className="settings__panel settings__profile-layout">
      <aside className="settings__profile-sidebar">
        <div className="settings__profile-avatar-lg">
          {profile.avatar ? (
            <img src={profile.avatar} alt="Avatar Admin" />
          ) : (
            <span>{profile.name?.charAt(0) ?? 'A'}</span>
          )}
        </div>
        <h3 className="settings__profile-name">{profile.name || 'Quản trị viên'}</h3>
        <p className="settings__profile-role">Admin</p>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleImagePick(e.target.files?.[0])}
        />
        <button
          type="button"
          className="settings__btn settings__btn--secondary settings__btn--small"
          onClick={() => avatarInputRef.current?.click()}
        >
          Đổi avatar
        </button>
      </aside>

      <div className="settings__profile-main">
        <h3 className="settings__section-title">Thông tin cá nhân</h3>
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
            <span>Số điện thoại</span>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </label>
          <label className="settings__field settings__field--full">
            <span>Email</span>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </label>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={handleSaveProfile}>
          Lưu hồ sơ
        </button>

        <hr className="settings__divider" />

        <h4 className="settings__subheading">Đổi mật khẩu</h4>
        <div className="settings__form-grid">
          <label className="settings__field settings__field--full">
            <span>Mật khẩu hiện tại</span>
            <input
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
            />
          </label>
          <label className="settings__field">
            <span>Mật khẩu mới</span>
            <input
              type="password"
              value={passwordForm.next}
              onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
            />
          </label>
          <label className="settings__field">
            <span>Nhập lại mật khẩu mới</span>
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
    </div>
  )
}
