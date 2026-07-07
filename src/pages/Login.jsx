import { useState } from 'react'
import { ArrowLeft, Briefcase, Building2, Lock, UserRound, Users } from 'lucide-react'
import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import { ROLES } from '../constants/auth'
import { verifyLogin } from '../constants/loginCredentials'
import { getActiveBranches } from '../constants/branches'
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
      <div className="login__texture" aria-hidden="true" />
      <div className="login__glow login__glow--one" aria-hidden="true" />
      <div className="login__glow login__glow--two" aria-hidden="true" />
      <div className="login__vignette" aria-hidden="true" />

      <div className="login__wrap">
        {onBack && (
          <button type="button" className="login__back" onClick={onBack}>
            <ArrowLeft size={16} strokeWidth={2.25} />
            Quay lại
          </button>
        )}

        <div className="login__brand">
          <KhoeSpaLogo size={120} />
          <h1 className="login__product">Khoẻ Spa Manager</h1>
          <p className="login__slogan">Quản lý vận hành hệ thống Spa</p>
          <p className="login__intro">
            Nền tảng quản lý chuyên nghiệp — hóa đơn, doanh thu, nhân sự và báo cáo
            theo thời gian thực cho toàn hệ thống Khoẻ Spa.
          </p>
        </div>

        <div className="login__card">
          <h2 className="login__title">Đăng nhập</h2>
          <p className="login__audience">Dành cho Admin, Quản lý chi nhánh và Nhân viên</p>

          <form className="login__form" onSubmit={handleSubmit}>
            <label className="login__field">
              <span>Vai trò</span>
              <div className="login__control">
                <UserRound className="login__control-icon" size={17} strokeWidth={2} aria-hidden="true" />
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
                  <Building2 className="login__control-icon" size={17} strokeWidth={2} aria-hidden="true" />
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
                  <Users className="login__control-icon" size={17} strokeWidth={2} aria-hidden="true" />
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
                  <Lock className="login__control-icon" size={17} strokeWidth={2} aria-hidden="true" />
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

            <button type="submit" className="login__btn" disabled={!role}>
              <Briefcase size={17} strokeWidth={2.25} />
              Đăng nhập
            </button>
          </form>
        </div>

        <p className="login__footer">© 2026 Khoẻ Spa — Massage Y học cổ truyền</p>
      </div>
    </div>
  )
}
