import { loadBranches } from '../../utils/branchStorage'
import {
  canChangeEmployeeBranch,
  canEditEmployeeAvatar,
  canViewEmployeeAvatar,
  canViewEmployeeBankInfo,
  canViewEmployeeCccd,
  canViewEmployeeCurrentAddress,
  canViewEmployeeEmergencyContact,
  canViewEmployeeNote,
  canViewEmployeePersonalInfo,
  canViewEmployeePosition,
  getScopedBranchId,
  isBranchManager,
} from '../../constants/auth'
import {
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_OPTIONS,
  GENDER_OPTIONS,
  readAvatarFile,
} from '../../utils/employeeStorage'
import EmployeeAvatar from './EmployeeAvatar'
import './EmployeeProfileForm.css'

function Field({ label, children, full = false }) {
  return (
    <label className={`employee-profile__field${full ? ' employee-profile__field--full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function ReadOnlyValue({ value, multiline = false }) {
  return (
    <div className={`employee-profile__readonly${multiline ? ' employee-profile__readonly--multiline' : ''}`}>
      {value || '—'}
    </div>
  )
}

function AddressTextarea({ value, onChange, placeholder, readOnly }) {
  if (readOnly) {
    return <ReadOnlyValue value={value} multiline />
  }

  return (
    <textarea
      className="employee-profile__textarea"
      rows={4}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  )
}

function CccdImageField({ value, readOnly, onChange, onRemove }) {
  return (
    <div className="employee-profile__cccd-image">
      {value ? (
        <img src={value} alt="Ảnh CCCD" className="employee-profile__cccd-image-preview" />
      ) : (
        <div className="employee-profile__cccd-image-placeholder">Chưa có ảnh</div>
      )}
      {!readOnly && (
        <div className="employee-profile__avatar-actions">
          <label className="employee-profile__upload-btn">
            Tải ảnh lên
            <input type="file" accept="image/*" hidden onChange={onChange} />
          </label>
          {value && (
            <button type="button" className="employee-profile__remove-avatar" onClick={onRemove}>
              Xóa ảnh
            </button>
          )}
          <p className="employee-profile__upload-hint">
            Ảnh JPG/PNG, tối đa 15MB — ảnh trên 2MB sẽ tự động được nén.
          </p>
        </div>
      )}
    </div>
  )
}

export default function EmployeeProfileForm({
  form,
  onChange,
  errors = {},
  mode = 'view',
  showAvatarUpload: showAvatarUploadProp = false,
  onAvatarError,
  forceAdminFields = false,
  positionSuggestions = [],
}) {
  const branches = loadBranches()
  const readOnly = mode === 'view'
  const lockedBranchId = getScopedBranchId()
  const branchLocked = isBranchManager() && Boolean(lockedBranchId)
  const selectableBranches = branchLocked
    ? branches.filter((branch) => branch.id === lockedBranchId)
    : branches

  const showCccd = forceAdminFields || canViewEmployeeCccd()
  const showPersonal = forceAdminFields || canViewEmployeePersonalInfo()
  const showNote = forceAdminFields || canViewEmployeeNote()
  const showAvatar = forceAdminFields || canViewEmployeeAvatar()
  const showAvatarUpload = (forceAdminFields || canEditEmployeeAvatar()) && showAvatarUploadProp
  const showCurrentAddress = forceAdminFields || canViewEmployeeCurrentAddress()
  const showBankInfo = forceAdminFields || canViewEmployeeBankInfo()
  const showEmergencyContact = forceAdminFields || canViewEmployeeEmergencyContact()
  const showPosition = forceAdminFields || canViewEmployeePosition()
  const showBranchSelector = canChangeEmployeeBranch() || forceAdminFields
  const canEditCccdImages = (forceAdminFields || canViewEmployeeCccd()) && !readOnly

  const handleCccdImageChange = (field) => async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const image = await readAvatarFile(file)
      onChange({ ...form, [field]: image })
    } catch (error) {
      onAvatarError?.(error.message)
      event.target.value = ''
    }
  }

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const avatar = await readAvatarFile(file)
      onChange({ ...form, avatar })
    } catch (error) {
      onAvatarError?.(error.message)
      event.target.value = ''
    }
  }

  const statusOptions = EMPLOYEE_STATUS_OPTIONS
  const showPayrollFields = forceAdminFields

  return (
    <div className="employee-profile">
      {showAvatar && (
        <div className="employee-profile__avatar-section">
          <EmployeeAvatar name={form.name} avatar={form.avatar} size="lg" />
          {showAvatarUpload && !readOnly && (
            <div className="employee-profile__avatar-actions">
              <label className="employee-profile__upload-btn">
                Tải ảnh lên
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarChange}
                />
              </label>
              {form.avatar && (
                <button
                  type="button"
                  className="employee-profile__remove-avatar"
                  onClick={() => onChange({ ...form, avatar: '' })}
                >
                  Xóa ảnh
                </button>
              )}
              <p className="employee-profile__upload-hint">
                Ảnh JPG/PNG, tối đa 15MB — ảnh trên 2MB sẽ tự động được nén.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="employee-profile__grid">
        <Field label="Họ và tên">
          {readOnly ? (
            <ReadOnlyValue value={form.name} />
          ) : (
            <>
              <input
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="Nhập họ và tên"
                className={errors.name ? 'employee-profile__input--error' : ''}
              />
              {errors.name && <span className="employee-profile__error">{errors.name}</span>}
            </>
          )}
        </Field>

        {showPersonal && (
          <>
            <Field label="Ngày sinh">
              {readOnly ? (
                <ReadOnlyValue value={form.dateOfBirth} />
              ) : (
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => onChange({ ...form, dateOfBirth: e.target.value })}
                />
              )}
            </Field>

            <Field label="Giới tính">
              {readOnly ? (
                <ReadOnlyValue
                  value={GENDER_OPTIONS.find((o) => o.value === form.gender)?.label}
                />
              ) : (
                <select
                  value={form.gender}
                  onChange={(e) => onChange({ ...form, gender: e.target.value })}
                >
                  <option value="">Chọn giới tính</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}

        <Field label="Số điện thoại">
          {readOnly ? (
            <ReadOnlyValue value={form.phone} />
          ) : (
            <input
              value={form.phone}
              onChange={(e) => onChange({ ...form, phone: e.target.value })}
              placeholder="Nhập số điện thoại"
            />
          )}
        </Field>

        {showPersonal && (
          <Field label="Email">
            {readOnly ? (
              <ReadOnlyValue value={form.email} />
            ) : (
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                placeholder="Nhập email"
              />
            )}
          </Field>
        )}

        {showCccd && (
          <>
            <Field label="Số CCCD">
              {readOnly ? (
                <ReadOnlyValue value={form.cccd} />
              ) : (
                <input
                  value={form.cccd}
                  onChange={(e) => onChange({ ...form, cccd: e.target.value })}
                  placeholder="Nhập số CCCD"
                />
              )}
            </Field>

            <Field label="Ngày cấp CCCD">
              {readOnly ? (
                <ReadOnlyValue value={form.cccdIssueDate} />
              ) : (
                <input
                  type="date"
                  value={form.cccdIssueDate}
                  onChange={(e) => onChange({ ...form, cccdIssueDate: e.target.value })}
                />
              )}
            </Field>

            <Field label="Nơi cấp CCCD">
              {readOnly ? (
                <ReadOnlyValue value={form.cccdIssuePlace} />
              ) : (
                <input
                  value={form.cccdIssuePlace}
                  onChange={(e) => onChange({ ...form, cccdIssuePlace: e.target.value })}
                  placeholder="Nhập nơi cấp CCCD"
                />
              )}
            </Field>

            <Field label="Địa chỉ trên CCCD" full>
              <AddressTextarea
                value={form.cccdAddress}
                readOnly={readOnly}
                placeholder="Nhập địa chỉ trên CCCD (số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố...)"
                onChange={(e) => onChange({ ...form, cccdAddress: e.target.value })}
              />
            </Field>

            <Field label="Ảnh CCCD mặt trước">
              <CccdImageField
                value={form.cccdFrontImage}
                readOnly={!canEditCccdImages}
                onChange={handleCccdImageChange('cccdFrontImage')}
                onRemove={() => onChange({ ...form, cccdFrontImage: '' })}
              />
            </Field>

            <Field label="Ảnh CCCD mặt sau">
              <CccdImageField
                value={form.cccdBackImage}
                readOnly={!canEditCccdImages}
                onChange={handleCccdImageChange('cccdBackImage')}
                onRemove={() => onChange({ ...form, cccdBackImage: '' })}
              />
            </Field>
          </>
        )}

        {showCurrentAddress && (
          <Field label="Địa chỉ nơi ở hiện tại" full>
            <AddressTextarea
              value={form.currentAddress}
              readOnly={readOnly}
              placeholder="Nhập địa chỉ nơi ở hiện tại (số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố...)"
              onChange={(e) => onChange({ ...form, currentAddress: e.target.value })}
            />
          </Field>
        )}

        {showEmergencyContact && (
          <>
            <Field label="Người liên hệ khẩn cấp">
              {readOnly ? (
                <ReadOnlyValue value={form.emergencyContactName} />
              ) : (
                <input
                  value={form.emergencyContactName}
                  onChange={(e) => onChange({ ...form, emergencyContactName: e.target.value })}
                  placeholder="Họ tên người liên hệ"
                />
              )}
            </Field>

            <Field label="SĐT người liên hệ">
              {readOnly ? (
                <ReadOnlyValue value={form.emergencyContactPhone} />
              ) : (
                <input
                  value={form.emergencyContactPhone}
                  onChange={(e) => onChange({ ...form, emergencyContactPhone: e.target.value })}
                  placeholder="Số điện thoại người liên hệ"
                />
              )}
            </Field>
          </>
        )}

        {showBankInfo && (
          <>
            <Field label="Tên ngân hàng">
              {readOnly ? (
                <ReadOnlyValue value={form.bankName} />
              ) : (
                <input
                  value={form.bankName}
                  onChange={(e) => onChange({ ...form, bankName: e.target.value })}
                  placeholder="VD: Vietcombank"
                />
              )}
            </Field>

            <Field label="Chủ tài khoản">
              {readOnly ? (
                <ReadOnlyValue value={form.bankAccountHolder} />
              ) : (
                <input
                  value={form.bankAccountHolder}
                  onChange={(e) => onChange({ ...form, bankAccountHolder: e.target.value })}
                  placeholder="Tên chủ tài khoản"
                />
              )}
            </Field>

            <Field label="Số tài khoản">
              {readOnly ? (
                <ReadOnlyValue value={form.bankAccount} />
              ) : (
                <input
                  value={form.bankAccount}
                  onChange={(e) => onChange({ ...form, bankAccount: e.target.value })}
                  placeholder="Nhập số tài khoản ngân hàng"
                />
              )}
            </Field>
          </>
        )}

        <Field label="Chi nhánh làm việc">
          {readOnly || !showBranchSelector ? (
            <ReadOnlyValue
              value={branches.find((b) => b.id === (form.branchId || lockedBranchId))?.name}
            />
          ) : (
            <>
              <select
                value={form.branchId || lockedBranchId}
                onChange={(e) => onChange({ ...form, branchId: e.target.value })}
                className={errors.branchId ? 'employee-profile__input--error' : ''}
              >
                <option value="">Chọn chi nhánh</option>
                {selectableBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {errors.branchId && (
                <span className="employee-profile__error">{errors.branchId}</span>
              )}
            </>
          )}
        </Field>

        {showPosition && (
          <Field label="Chức vụ">
            {readOnly ? (
              <ReadOnlyValue value={form.position} />
            ) : (
              <>
                <input
                  list={positionSuggestions.length ? 'position-suggestions' : undefined}
                  value={form.position}
                  onChange={(e) => onChange({ ...form, position: e.target.value })}
                  placeholder="Nhập chức vụ"
                />
                {positionSuggestions.length > 0 && (
                  <datalist id="position-suggestions">
                    {positionSuggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </Field>
        )}

        <Field label="Ngày bắt đầu làm việc">
          {readOnly ? (
            <ReadOnlyValue value={form.startDate} />
          ) : (
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => onChange({ ...form, startDate: e.target.value })}
            />
          )}
        </Field>

        {showPayrollFields && (
          <>
            <Field label="Ngày nghỉ việc">
              {readOnly ? (
                <ReadOnlyValue value={form.endDate} />
              ) : (
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                />
              )}
            </Field>
            <Field label="Mức hoa hồng (%)">
              {readOnly ? (
                <ReadOnlyValue value={form.commissionRate ? `${form.commissionRate}%` : ''} />
              ) : (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.commissionRate}
                  onChange={(e) => onChange({ ...form, commissionRate: e.target.value })}
                  placeholder="VD: 20"
                />
              )}
            </Field>
            <Field label="Tỷ lệ lương (%)">
              {readOnly ? (
                <ReadOnlyValue value={form.salaryRate ? `${form.salaryRate}%` : ''} />
              ) : (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.salaryRate}
                  onChange={(e) => onChange({ ...form, salaryRate: e.target.value })}
                  placeholder="VD: 100"
                />
              )}
            </Field>
          </>
        )}

        <Field label="Trạng thái">
          {readOnly ? (
            <ReadOnlyValue
              value={statusOptions.find((o) => o.value === form.status)?.label}
            />
          ) : (
            <select
              value={form.status}
              onChange={(e) => onChange({ ...form, status: e.target.value })}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </Field>

        {showNote && (
          <Field label="Ghi chú" full>
            {readOnly ? (
              <ReadOnlyValue value={form.note} multiline />
            ) : (
              <textarea
                className="employee-profile__textarea"
                rows={3}
                value={form.note}
                onChange={(e) => onChange({ ...form, note: e.target.value })}
                placeholder="Ghi chú thêm..."
              />
            )}
          </Field>
        )}
      </div>
    </div>
  )
}
