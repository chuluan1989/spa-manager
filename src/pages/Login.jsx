import { useEffect, useState } from 'react'
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  MapPin,
  Phone,
  User,
  UserCircle,
} from 'lucide-react'
import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import { ROLES } from '../constants/auth'
import { verifyLogin } from '../constants/loginCredentials'
import { getActiveBranches } from '../constants/branches'
import { BRANCH_CONTACTS, SYSTEM_HOTLINE } from '../constants/branchContacts'
import { getActiveEmployeesByBranch } from '../utils/employeeStorage'
import './Login.css'

const ROLE_OPTIONS = [
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.BRANCH_MANAGER, label: 'Quản lý chi nhánh' },
  { value: ROLES.EMPLOYEE, label: 'Nhân viên' },
]

const REMEMBER_ROLE_KEY = 'spa-manager-login-remember-role'

function FieldIcon({ children }) {
  return <span className="login__field-icon" aria-hidden="true">{children}</span>
}

export default function Login({ onLogin }) {
  const [role, setRole] = useState('')
  const [branch, setBranch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem(REMEMBER_ROLE_KEY)
      if (savedRole && ROLE_OPTIONS.some((option) => option.value === savedRole)) {
        setRole(savedRole)
        setRememberMe(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

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

    try {
      if (rememberMe) localStorage.setItem(REMEMBER_ROLE_KEY, role)
      else localStorage.removeItem(REMEMBER_ROLE_KEY)
    } catch {
      /* ignore */
    }

    onLogin(result.user)
  }

  return (
    <div className="login">
      <div className="login__backdrop" aria-hidden="true">
        <div className="login__backdrop-glow login__backdrop-glow--left" />
        <div className="login__backdrop-glow login__backdrop-glow--right" />
        <div className="login__backdrop-streak login__backdrop-streak--1" />
        <div className="login__backdrop-streak login__backdrop-streak--2" />
        <div className="login__backdrop-streak login__backdrop-streak--3" />
        <div className="login__backdrop-floral login__backdrop-floral--tl" />
        <div className="login__backdrop-floral login__backdrop-floral--br" />
        <div className="login__backdrop-sparkles" />
        <div className="login__backdrop-noise" />
      </div>

      <section className="login__hero">
        <div className="login__hero-inner">
          <div className="login__brand">
            <KhoeSpaLogo size={621} className="login__logo" priority />
            <a href={`tel:${SYSTEM_HOTLINE.replace(/\./g, '')}`} className="login__hotline">
              ☎ {SYSTEM_HOTLINE}
            </a>
          </div>

          <div className="login__card">
            <div className="login__card-badge" aria-hidden="true">
              <img src="/assets/logo.png" alt="" />
            </div>
            <h1 className="login__card-title">Đăng nhập hệ thống</h1>

            <form className="login__form app-form" onSubmit={handleSubmit}>
              <label className="login__field">
                <span>Vai trò</span>
                <div className="login__input-wrap">
                  <FieldIcon><UserCircle size={18} strokeWidth={1.75} /></FieldIcon>
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
                  <div className="login__input-wrap">
                    <FieldIcon><MapPin size={18} strokeWidth={1.75} /></FieldIcon>
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
                  <div className="login__input-wrap">
                    <FieldIcon><User size={18} strokeWidth={1.75} /></FieldIcon>
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
                  <div className="login__input-wrap login__input-wrap--password">
                    <FieldIcon><Lock size={18} strokeWidth={1.75} /></FieldIcon>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setErrors((prev) => ({ ...prev, password: undefined }))
                      }}
                      placeholder="Nhập mật khẩu"
                      className={errors.password ? 'login__input--error' : ''}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="login__password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && <span className="login__error">{errors.password}</span>}
                </label>
              )}

              <label className="login__remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Ghi nhớ đăng nhập</span>
              </label>

              <button type="submit" className="login__submit" disabled={!role}>
                <LogIn size={18} strokeWidth={2.25} aria-hidden="true" />
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
              <div className="login__branch-card-top">
                <span className="login__branch-pin">
                  <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <p className="login__branch-label">{item.label}</p>
              </div>
              <p className="login__branch-address">{item.address}</p>
              <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`} className="login__branch-phone">
                <Phone size={14} strokeWidth={2} aria-hidden="true" />
                {item.phone}
              </a>
            </article>
          ))}
        </div>
        <p className="login__footer-note">© 2026 Khoẻ Spa Manager · All rights reserved.</p>
      </section>
    </div>
  )
}
