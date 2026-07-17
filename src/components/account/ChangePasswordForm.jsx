import { useState } from 'react'
import {
  changeOwnBranchPassword,
  changeOwnEmployeePassword,
} from '../../utils/credentialsStorage'
import './ChangePasswordForm.css'

/**
 * Form đổi mật khẩu cho Nhân viên / Quản lý.
 * Admin reset dùng modal riêng (không yêu cầu mật khẩu cũ).
 */
export default function ChangePasswordForm({
  mode = 'employee',
  employeeId = '',
  branchId = '',
  onSuccess,
  showToast,
}) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const result = mode === 'branch'
        ? await changeOwnBranchPassword({
          branchId,
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        })
        : await changeOwnEmployeePassword({
          employeeId,
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        })

      if (!result.success) {
        showToast?.(result.error ?? 'Không thể đổi mật khẩu')
        return
      }
      setForm({ current: '', next: '', confirm: '' })
      showToast?.('Đổi mật khẩu thành công')
      onSuccess?.()
    } catch (error) {
      showToast?.(error?.message ?? 'Không thể đổi mật khẩu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="change-password" onSubmit={handleSubmit}>
      <h3 className="change-password__title">Đổi mật khẩu</h3>
      <p className="change-password__hint">
        Mật khẩu mới tối thiểu 6 ký tự. Phiên hiện tại vẫn giữ; lần đăng nhập sau dùng mật khẩu mới.
      </p>
      <label className="change-password__field">
        <span>Mật khẩu hiện tại</span>
        <input
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={(e) => update('current', e.target.value)}
          disabled={saving}
        />
      </label>
      <label className="change-password__field">
        <span>Mật khẩu mới</span>
        <input
          type="password"
          autoComplete="new-password"
          value={form.next}
          onChange={(e) => update('next', e.target.value)}
          disabled={saving}
        />
      </label>
      <label className="change-password__field">
        <span>Xác nhận mật khẩu mới</span>
        <input
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => update('confirm', e.target.value)}
          disabled={saving}
        />
      </label>
      <button
        type="submit"
        className="change-password__submit"
        disabled={saving}
      >
        {saving ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
      </button>
    </form>
  )
}
