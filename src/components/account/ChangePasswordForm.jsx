import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  changeOwnAdminPassword,
  changeOwnBranchPassword,
  changeOwnEmployeePassword,
  MIN_PASSWORD_LENGTH,
} from '../../utils/credentialsStorage'
import './ChangePasswordForm.css'

const EMPTY_FORM = { current: '', next: '', confirm: '' }

/**
 * Form tự đổi mật khẩu (Nhân viên / Quản lý / Admin).
 * Admin reset mật khẩu người khác dùng luồng Settings riêng.
 */
export default function ChangePasswordForm({
  mode = 'employee',
  employeeId = '',
  branchId = '',
  onSuccess,
  onCancel,
  showToast,
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [show, setShow] = useState({ current: false, next: false, confirm: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field, value) => {
    setError('')
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const toggleShow = (field) => {
    setShow((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const clearForm = () => {
    setForm(EMPTY_FORM)
    setShow({ current: false, next: false, confirm: false })
    setError('')
  }

  const handleCancel = () => {
    clearForm()
    onCancel?.()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return

    if (!form.current.trim()) {
      setError('Vui lòng nhập mật khẩu cũ')
      return
    }
    if (!form.next.trim()) {
      setError('Vui lòng nhập mật khẩu mới')
      return
    }
    if (!form.confirm.trim()) {
      setError('Vui lòng nhập lại mật khẩu mới')
      return
    }

    setSaving(true)
    setError('')
    try {
      let result
      if (mode === 'admin') {
        result = await changeOwnAdminPassword({
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        })
      } else if (mode === 'branch') {
        result = await changeOwnBranchPassword({
          branchId,
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        })
      } else {
        result = await changeOwnEmployeePassword({
          employeeId,
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        })
      }

      if (!result.success) {
        const message = result.error ?? 'Không thể đổi mật khẩu'
        setError(message)
        showToast?.(message)
        return
      }

      clearForm()
      showToast?.('Đổi mật khẩu thành công')
      onSuccess?.()
    } catch {
      const message = 'Không thể đổi mật khẩu. Vui lòng thử lại.'
      setError(message)
      showToast?.(message)
    } finally {
      setSaving(false)
    }
  }

  const renderField = (field, label, autoComplete) => (
    <label className="change-password__field">
      <span>{label}</span>
      <div className="change-password__input-wrap">
        <input
          type={show[field] ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={form[field]}
          onChange={(e) => update(field, e.target.value)}
          disabled={saving}
          name={`change-password-${field}`}
        />
        <button
          type="button"
          className="change-password__toggle"
          onClick={() => toggleShow(field)}
          disabled={saving}
          aria-label={show[field] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          tabIndex={-1}
        >
          {show[field] ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
    </label>
  )

  return (
    <form className="change-password" onSubmit={handleSubmit} autoComplete="off">
      <h3 className="change-password__title">Đổi mật khẩu</h3>
      <p className="change-password__hint">
        Mật khẩu mới tối thiểu {MIN_PASSWORD_LENGTH} ký tự, có chữ cái và chữ số.
        Phiên hiện tại vẫn giữ; lần đăng nhập sau dùng mật khẩu mới.
      </p>

      {renderField('current', 'Mật khẩu cũ', 'current-password')}
      {renderField('next', 'Mật khẩu mới', 'new-password')}
      {renderField('confirm', 'Nhập lại mật khẩu mới', 'new-password')}

      {error && (
        <p className="change-password__error" role="alert">
          {error}
        </p>
      )}

      <div className="change-password__actions">
        <button
          type="submit"
          className="change-password__submit"
          disabled={saving || !form.current.trim() || !form.next.trim() || !form.confirm.trim()}
        >
          {saving ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
        </button>
        {onCancel && (
          <button
            type="button"
            className="change-password__cancel"
            onClick={handleCancel}
            disabled={saving}
          >
            Hủy
          </button>
        )}
      </div>
    </form>
  )
}
