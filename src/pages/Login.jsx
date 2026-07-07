import { useState } from 'react'
import { ArrowLeft, Briefcase, Building2, Lock, MapPin, Phone, UserRound, Users } from 'lucide-react'
import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import { ROLES } from '../constants/auth'
import { verifyLogin } from '../constants/loginCredentials'
import { getActiveBranches } from '../constants/branches'
import { BRANCH_CONTACTS, BRAND_SLOGAN, SYSTEM_HOTLINE } from '../constants/branchContacts'
import { getActiveEmployeesByBranch } from '../utils/employeeStorage'
import './Login.css'

const ROLE_OPTIONS = [
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.BRANCH_MANAGER, label: 'Quản lý chi nhánh' },
  { value: ROLES.EMPLOYEE, label: 'Nhân viên' },
]

export default function Login({ onLogin, onBack }) {
  const [role, setRole] = useState('')
  const [branch, setBranch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})

  const isBranchManager = role === ROLES.BRANCH_MANAGER
  const isEmployeeRole = role === ROLES.EMPLOYEE
  const branchEmployees = branch ? getActiveEmployeesByBranch(branch) : []

  const handleRoleChange = (nextRole) => {
    setRole(nextRole)
    setBranch('')
    setEmployeeId('')
    setPassword('')
    setErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await verifyLogin({ role, branch, employeeId, password })
    if (!result.ok) {
      setErrors({ [result.field]: result.message })
      return
    }
    onLogin(result.user)
  }

  return (
    <div className="login">
      <div className="login__bg" aria-hidden="true" />
      <div className="login__overlay" aria-hidden="true" />

      <div className="login__layout">
        <aside className="login__hero">
          {onBack && (
            <button type="button" className="login__back" onClick={onBack}>
              <ArrowLeft size={16} strokeWidth={2.25} />
              Quay lại
            </button>
          )}

          <div className="login__brand">
            <KhoeSpaLogo size={140} className="login__logo" />
            <h1 className="login__name">Khoẻ Spa</h1>
            <p className="login__slogan">{BRAND_SLOGAN}</p>
          </div>

          <a href={`tel:${SYSTEM_HOTLINE.replace(/\./g, '')}`} className="login__hotline">
            <Phone size={18} />
            <span>Hotline hệ thống</span>
            <strong>{SYSTEM_HOTLINE}</strong>
          </a>

          <div className="login__branches">
            <h2 className="login__branches-title">Hệ thống chi nhánh</h2>
            <ul className="login__branch-list">
              {BRANCH_CONTACTS.map((item) => (
                <li key={item.id} className="login__branch-item">
                  <div className="login__branch-badge">{item.label}</div>
                  <div className="login__branch-body">
                    <p className="login__branch-address">
                      <MapPin size={14} aria-hidden />
                      {item.address}
                    </p>
                    <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`} className="login__branch-phone">
                      <Phone size={14} aria-hidden />
                      {item.phone}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="login__main">
          <div className="login__card">
            <div className="login__card-brand">
              <KhoeSpaLogo size={56} />
              <div>
                <h2 className="login__card-title">Đăng nhập</h2>
                <p className="login__card-sub">Phần mềm quản lý vận hành Khoẻ Spa</p>
              </div>
            </div>

            <form className="login__form app-form" onSubmit={handleSubmit}>
              <label className="login__field">
                <span>Vai trò</span>
                <div className="login__control">
                  <UserRound className="login__control-icon" size={18} aria-hidden />
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className={errors.role ? 'login__input--error' : ''}
                  >
                    <option value="">Chọn vai trò</option>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                {errors.role && <span className="login__error">{errors.role}</span>}
              </label>

              {(isBranchManager || isEmployeeRole) && (
                <label className="login__field">
                  <span>Chi nhánh</span>
                  <div className="login__control">
                    <Building2 className="login__control-icon" size={18} aria-hidden />
                    <select
                      value={branch}
                      onChange={(e) => {
                        setBranch(e.target.value)
                        setEmployeeId('')
                        setErrors((prev) => ({ ...prev, branch: undefined, employeeId: undefined }))
                      }}
                      className={errors.branch ? 'login__input--error' : ''}
                    >
                      <option value="">Chọn chi nhánh</option>
                      {getActiveBranches().map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  {errors.branch && <span className="login__error">{errors.branch}</span>}
                </label>
              )}

              {isEmployeeRole && (
                <label className="login__field">
                  <span>Nhân viên</span>
                  <div className="login__control">
                    <Users className="login__control-icon" size={18} aria-hidden />
                    <select
                      value={employeeId}
                      onChange={(e) => {
                        setEmployeeId(e.target.value)
                        setErrors((prev) => ({ ...prev, employeeId: undefined }))
                      }}
                      className={errors.employeeId ? 'login__input--error' : ''}
                      disabled={!branch}
                    >
                      <option value="">{branch ? 'Chọn nhân viên' : 'Chọn chi nhánh trước'}</option>
                      {branchEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                    </select>
                  </div>
                  {errors.employeeId && <span className="login__error">{errors.employeeId}</span>}
                </label>
              )}

              {role && (
                <label className="login__field">
                  <span>Mật khẩu</span>
                  <div className="login__control">
                    <Lock className="login__control-icon" size={18} aria-hidden />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors((prev) => ({ ...prev, password: undefined }))
                      }}
                      placeholder="Nhập mật khẩu"
                      className={errors.password ? 'login__input--error' : ''}
                      autoComplete="current-password"
                    />
                  </div>
                  {errors.password && <span className="login__error">{errors.password}</span>}
                </label>
              )}

              <button type="submit" className="login__submit ks-btn-primary" disabled={!role}>
                <Briefcase size={18} strokeWidth={2.25} />
                Đăng nhập hệ thống
              </button>
            </form>
          </div>

          <p className="login__footer">© 2026 Khoẻ Spa · {BRAND_SLOGAN}</p>
        </main>
      </div>
    </div>
  )
}
