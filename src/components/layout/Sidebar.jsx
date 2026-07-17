import { useState } from 'react'
import { LogOut } from 'lucide-react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import {
  getCurrentUser,
  getCurrentUserBranch,
  getCurrentUserName,
  getRoleLabel,
  getVisibleNavItems,
  isAdmin,
  isBranchManager,
  ROLES,
} from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { loadAdminProfile } from '../../utils/adminProfileStorage'
import ChangePasswordForm from '../account/ChangePasswordForm'
import NavIcon from './NavIcon'
import './Sidebar.css'

const APP_VERSION = 'v2.0'

function getSidebarUserName() {
  const user = getCurrentUser()
  if (!user) return '—'
  if (user.role === ROLES.ADMIN) {
    return loadAdminProfile().name?.trim() || 'Admin'
  }
  return getCurrentUserName()
}

function getSidebarRoleLabel() {
  if (isAdmin()) return 'Admin hệ thống'
  const role = getRoleLabel()
  if (role === 'Quản lý chi nhánh') return 'Quản lý chi nhánh'
  if (role === 'Nhân viên') return 'Nhân viên'
  return role
}

function getSidebarAvatar() {
  const user = getCurrentUser()
  if (!user) return null
  if (user.role === ROLES.ADMIN) {
    return loadAdminProfile().avatar || null
  }
  if (user.role === ROLES.EMPLOYEE && user.employeeId) {
    return getEmployeeById(user.employeeId)?.avatar || null
  }
  return null
}

export default function Sidebar({ activeItem = 'dashboard', onNavigate, onLogout }) {
  const navItems = getVisibleNavItems()
  const userName = getSidebarUserName()
  const roleLabel = getSidebarRoleLabel()
  const avatarUrl = getSidebarAvatar()
  const avatarInitial = userName.charAt(0).toUpperCase() || 'K'
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <aside className="sidebar" aria-label="Menu chính">
      <div className="sidebar__brand">
        <KhoeSpaLogo size={156} className="sidebar__logo-img" priority />
        <div className="sidebar__brand-line" aria-hidden="true" />
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${activeItem === item.id ? 'sidebar__link--active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
            aria-current={activeItem === item.id ? 'page' : undefined}
          >
            <span className="sidebar__link-icon">
              <NavIcon name={item.icon} />
            </span>
            <span className="sidebar__link-text">
              <span className="sidebar__link-label">{item.label}</span>
              {item.description && (
                <span className="sidebar__link-desc">{item.description}</span>
              )}
            </span>
            <span className="sidebar__tooltip" role="tooltip">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span>{avatarInitial}</span>
            )}
          </div>
          <div className="sidebar__user-info">
            <p className="sidebar__user-name">{userName}</p>
            <p className="sidebar__user-role">{roleLabel}</p>
          </div>
        </div>

        {isBranchManager() && (
          <button
            type="button"
            className="sidebar__logout"
            onClick={() => setPasswordOpen(true)}
          >
            Đổi mật khẩu
          </button>
        )}

        <button
          type="button"
          className="sidebar__logout"
          onClick={onLogout}
        >
          <LogOut size={16} aria-hidden />
          Đăng xuất
        </button>

        <p className="sidebar__version">PHIÊN BẢN<br />Khoẻ Spa Manager {APP_VERSION}</p>
      </div>

      {toast && <div className="sidebar__toast">{toast}</div>}

      {passwordOpen && (
        <div className="sidebar__modal-backdrop" onClick={() => setPasswordOpen(false)}>
          <div className="sidebar__modal" onClick={(e) => e.stopPropagation()}>
            <ChangePasswordForm
              mode="branch"
              branchId={getCurrentUserBranch()}
              showToast={showToast}
              onSuccess={() => setPasswordOpen(false)}
            />
            <button type="button" className="sidebar__logout" onClick={() => setPasswordOpen(false)}>
              Đóng
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
