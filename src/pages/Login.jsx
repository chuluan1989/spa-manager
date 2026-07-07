import { useState } from 'react'
import { MapPin, Phone } from 'lucide-react'
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

export default function Login({ onLogin }) {
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
      <div className="login__backdrop" aria-hidden="true">
        <div className="login__backdrop-glow login__backdrop-glow--left" />
        <div className="login__backdrop-glow login__backdrop-glow--right" />
        <div className="login__backdrop-curve login__backdrop-curve--1" />
        <div className="login__backdrop-curve login__backdrop-curve--2" />
        <div className="login__backdrop-noise" />
      </div>

      <section className="login__hero">
        <div className="login__hero-inner">
          <div className="login__brand">
            <KhoeSpaLogo size={384} className="login__logo" priority />
            <p className="login__brand-name">Khoẻ Spa</p>
            <p className="login__brand-slogan">{BRAND_SLOGAN}</p>
            <a href={`tel:${SYSTEM_HOTLINE.replace(/\./g, '')}`} className="login__hotline">
              <Phone size={20} strokeWidth={2} className="login__hotline-icon" aria-hidden="true" />
              <span>{SYSTEM_HOTLINE}</span>
            </a>
          </div>

          <div className="login__card">
            <h1 className="login__card-title">Đăng nhập hệ thống</h1>

            <form className="login__form app-form" onSubmit={handleSubmit}>
              <label className="login__field">
                <span>Vai trò</span>
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
                {errors.role && <span className="login__error">{errors.role}</span>}
              </label>

              {(isBranchManager || isEmployeeRole) && (
                <label className="login__field">
                  <span>Chi nhánh</span>
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
                  {errors.branch && <span className="login__error">{errors.branch}</span>}
                </label>
              )}

              {isEmployeeRole && (
                <label className="login__field">
                  <span>Nhân viên</span>
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
                  {errors.employeeId && <span className="login__error">{errors.employeeId}</span>}
                </label>
              )}

              {role && (
                <label className="login__field">
                  <span>Mật khẩu</span>
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
                  {errors.password && <span className="login__error">{errors.password}</span>}
                </label>
              )}

              <button type="submit" className="login__submit" disabled={!role}>
                Đăng nhập
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="login__branches">
        <div className="login__branches-fade" aria-hidden="true" />
        <h2 className="login__branches-title">Hệ thống 8 chi nhánh</h2>
        <div className="login__branches-grid">
          {BRANCH_CONTACTS.map((item) => (
            <article key={item.id} className="login__branch-card">
              <p className="login__branch-label">
                <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                {item.label}
              </p>
              <p className="login__branch-address">{item.address}</p>
              <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`} className="login__branch-phone">
                <Phone size={14} strokeWidth={2} aria-hidden="true" />
                {item.phone}
              </a>
            </article>
          ))}
        </div>
        <p className="login__footer-note">© 2026 Khoẻ Spa Manager</p>
      </section>
    </div>
  )
}
