import { useState } from 'react'
import EmployeeAvatar from '../components/employees/EmployeeAvatar'
import '../components/employees/EmployeeProfileForm.css'
import {
  getBranchName,
  getEmployeeById,
  getStatusLabel,
  readAvatarFile,
  updateOwnEmployeeProfile,
} from '../utils/employeeStorage'
import { validateEmployeeSelfProfile } from '../utils/validators'
import { getCurrentUserEmployeeId } from '../constants/auth'
import './MyProfile.css'

function Field({ label, children, full = false, hint }) {
  return (
    <label className={`employee-profile__field${full ? ' employee-profile__field--full' : ''}`}>
      <span>
        {label}
        {hint && <em className="myprofile__hint"> {hint}</em>}
      </span>
      {children}
    </label>
  )
}

function toFormState(employee) {
  return {
    name: employee.name ?? '',
    phone: employee.phone ?? '',
    cccd: employee.cccd ?? '',
    cccdIssueDate: employee.cccdIssueDate ?? '',
    cccdIssuePlace: employee.cccdIssuePlace ?? '',
    cccdAddress: employee.cccdAddress ?? '',
    currentAddress: employee.currentAddress ?? '',
    bankName: employee.bankName ?? '',
    bankAccount: employee.bankAccount ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    avatar: employee.avatar ?? '',
    cccdFrontImage: employee.cccdFrontImage ?? '',
    cccdBackImage: employee.cccdBackImage ?? '',
  }
}

function ImageUploadField({ label, value, onChange, onError }) {
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readAvatarFile(file)
      onChange(dataUrl)
    } catch (error) {
      onError?.(error.message)
      e.target.value = ''
    }
  }

  return (
    <Field label={label}>
      <div className="myprofile__image-upload">
        {value ? (
          <img src={value} alt={label} className="myprofile__image-preview" />
        ) : (
          <div className="myprofile__image-placeholder">Chưa có ảnh</div>
        )}
        <div className="employee-profile__avatar-actions">
          <label className="employee-profile__upload-btn">
            Tải ảnh lên
            <input type="file" accept="image/*" hidden onChange={handleFile} />
          </label>
          {value && (
            <button
              type="button"
              className="employee-profile__remove-avatar"
              onClick={() => onChange('')}
            >
              Xóa ảnh
            </button>
          )}
        </div>
      </div>
    </Field>
  )
}

export default function MyProfile({ mandatory = false, onCompleted }) {
  const employeeId = getCurrentUserEmployeeId()
  const [employee, setEmployee] = useState(() => getEmployeeById(employeeId))
  const [form, setForm] = useState(() => toFormState(employee ?? {}))
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSave = () => {
    const nextErrors = validateEmployeeSelfProfile(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const result = updateOwnEmployeeProfile(employeeId, form)
    if (!result.success) {
      if (result.errors) setErrors(result.errors)
      showToast(result.error ?? 'Không thể lưu hồ sơ')
      return
    }

    setEmployee(result.employee)
    setForm(toFormState(result.employee))
    showToast('Cập nhật hồ sơ thành công')
    onCompleted?.(result.employee)
  }

  if (!employee) {
    return (
      <div className="myprofile myprofile--denied">
        <h2 className="myprofile__title">Không tìm thấy hồ sơ nhân viên</h2>
      </div>
    )
  }

  return (
    <div className="myprofile">
      {toast && <div className="myprofile__toast">{toast}</div>}

      <header className="myprofile__header">
        <h2 className="myprofile__title">Hồ sơ cá nhân</h2>
        <p className="myprofile__subtitle">
          Bạn chỉ có thể xem và cập nhật thông tin của chính mình.
        </p>
      </header>

      {mandatory && (
        <div className="myprofile__banner">
          Vui lòng cập nhật đầy đủ <strong>Họ tên</strong> và <strong>Số điện thoại</strong> để
          tiếp tục sử dụng hệ thống.
        </div>
      )}

      <section className="myprofile__card">
        <h3 className="myprofile__card-title">Thông tin công việc</h3>
        <p className="myprofile__hint-block">
          Các thông tin dưới đây chỉ Admin hoặc Quản lý chi nhánh mới có quyền chỉnh sửa.
        </p>
        <div className="employee-profile__grid">
          <Field label="Mã nhân viên">
            <div className="employee-profile__readonly">{employee.id}</div>
          </Field>
          <Field label="Chi nhánh">
            <div className="employee-profile__readonly">{getBranchName(employee.branchId)}</div>
          </Field>
          <Field label="Chức vụ">
            <div className="employee-profile__readonly">{employee.position || '—'}</div>
          </Field>
          <Field label="Ngày vào làm">
            <div className="employee-profile__readonly">{employee.startDate || '—'}</div>
          </Field>
          <Field label="Trạng thái">
            <div className="employee-profile__readonly">{getStatusLabel(employee.status)}</div>
          </Field>
        </div>
      </section>

      <section className="myprofile__card">
        <h3 className="myprofile__card-title">Ảnh chân dung</h3>
        <div className="employee-profile__avatar-section">
          <EmployeeAvatar name={form.name} avatar={form.avatar} size="lg" />
          <div className="employee-profile__avatar-actions">
            <label className="employee-profile__upload-btn">
              Tải ảnh lên
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const avatar = await readAvatarFile(file)
                    updateField('avatar', avatar)
                  } catch (error) {
                    showToast(error.message)
                    e.target.value = ''
                  }
                }}
              />
            </label>
            {form.avatar && (
              <button
                type="button"
                className="employee-profile__remove-avatar"
                onClick={() => updateField('avatar', '')}
              >
                Xóa ảnh
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="myprofile__card">
        <h3 className="myprofile__card-title">Thông tin cá nhân</h3>
        <div className="employee-profile__grid">
          <Field
            label="Họ và tên"
            hint="(đổi tên sẽ đổi mật khẩu đăng nhập theo tên mới)"
          >
            <input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Nhập họ và tên"
              className={errors.name ? 'employee-profile__input--error' : ''}
            />
            {errors.name && <span className="employee-profile__error">{errors.name}</span>}
          </Field>

          <Field label="Số điện thoại">
            <input
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="VD: 0901234567"
              className={errors.phone ? 'employee-profile__input--error' : ''}
            />
            {errors.phone && <span className="employee-profile__error">{errors.phone}</span>}
          </Field>

          <Field label="Số CCCD">
            <input
              value={form.cccd}
              onChange={(e) => updateField('cccd', e.target.value)}
              placeholder="Nhập đúng 12 số"
              className={errors.cccd ? 'employee-profile__input--error' : ''}
            />
            {errors.cccd && <span className="employee-profile__error">{errors.cccd}</span>}
          </Field>

          <Field label="Ngày cấp CCCD">
            <input
              type="date"
              value={form.cccdIssueDate}
              onChange={(e) => updateField('cccdIssueDate', e.target.value)}
            />
          </Field>

          <Field label="Nơi cấp CCCD">
            <input
              value={form.cccdIssuePlace}
              onChange={(e) => updateField('cccdIssuePlace', e.target.value)}
              placeholder="Nhập nơi cấp CCCD"
            />
          </Field>

          <Field label="Địa chỉ trên CCCD" full>
            <textarea
              className="employee-profile__textarea"
              rows={3}
              value={form.cccdAddress}
              onChange={(e) => updateField('cccdAddress', e.target.value)}
              placeholder="Nhập địa chỉ trên CCCD"
            />
          </Field>

          <Field label="Địa chỉ nơi ở hiện tại" full>
            <textarea
              className="employee-profile__textarea"
              rows={3}
              value={form.currentAddress}
              onChange={(e) => updateField('currentAddress', e.target.value)}
              placeholder="Nhập địa chỉ nơi ở hiện tại"
            />
          </Field>

          <Field label="Tên ngân hàng">
            <input
              value={form.bankName}
              onChange={(e) => updateField('bankName', e.target.value)}
              placeholder="VD: Vietcombank"
            />
          </Field>

          <Field label="Số tài khoản">
            <input
              value={form.bankAccount}
              onChange={(e) => updateField('bankAccount', e.target.value)}
              placeholder="Nhập số tài khoản ngân hàng"
            />
          </Field>

          <Field label="Người liên hệ khẩn cấp">
            <input
              value={form.emergencyContactName}
              onChange={(e) => updateField('emergencyContactName', e.target.value)}
              placeholder="Họ tên người liên hệ"
            />
          </Field>

          <Field label="SĐT người liên hệ">
            <input
              value={form.emergencyContactPhone}
              onChange={(e) => updateField('emergencyContactPhone', e.target.value)}
              placeholder="Số điện thoại người liên hệ"
              className={errors.emergencyContactPhone ? 'employee-profile__input--error' : ''}
            />
            {errors.emergencyContactPhone && (
              <span className="employee-profile__error">{errors.emergencyContactPhone}</span>
            )}
          </Field>
        </div>
      </section>

      <section className="myprofile__card">
        <h3 className="myprofile__card-title">Ảnh CCCD</h3>
        <div className="employee-profile__grid">
          <ImageUploadField
            label="Ảnh CCCD mặt trước"
            value={form.cccdFrontImage}
            onChange={(value) => updateField('cccdFrontImage', value)}
            onError={showToast}
          />
          <ImageUploadField
            label="Ảnh CCCD mặt sau"
            value={form.cccdBackImage}
            onChange={(value) => updateField('cccdBackImage', value)}
            onError={showToast}
          />
        </div>
      </section>

      <div className="myprofile__actions">
        <button type="button" className="myprofile__save-btn" onClick={handleSave}>
          Lưu hồ sơ
        </button>
      </div>
    </div>
  )
}
