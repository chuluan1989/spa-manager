import { useState } from 'react'
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
      <div className="login__card">
        <div className="login__brand">
          <div className="login__logo">S</div>
          <div>
            <h1 className="login__title">Spa Manager</h1>
            <p className="login__subtitle">Đăng nhập để tiếp tục</p>
          </div>
        </div>

        <form className="login__form" onSubmit={handleSubmit}>
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

          <button type="submit" className="login__btn" disabled={!role}>
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  )
}
