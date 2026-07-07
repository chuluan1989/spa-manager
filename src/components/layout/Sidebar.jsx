import { LogOut } from 'lucide-react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { BRAND_SLOGAN } from '../../constants/branchContacts'
import {
  getCurrentUser,
  getCurrentUserName,
  getRoleLabel,
  getVisibleNavItems,
  isAdmin,
  ROLES,
} from '../../constants/auth'
import { getEmployeeById } from '../../utils/employeeStorage'
import { loadAdminProfile } from '../../utils/adminProfileStorage'
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

  return (
    <aside className="sidebar" aria-label="Menu chính">
      <div className="sidebar__brand">
        <KhoeSpaLogo size={120} className="sidebar__logo-img" priority />
        <p className="sidebar__brand-name">Khoẻ Spa</p>
        <p className="sidebar__brand-slogan">{BRAND_SLOGAN}</p>
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

        <button
          type="button"
          className="sidebar__logout"
          onClick={onLogout}
          aria-label="Đăng xuất"
        >
          <LogOut size={18} strokeWidth={1.75} />
          <span>Đăng xuất</span>
        </button>

        <p className="sidebar__version">
          <span className="sidebar__version-label">Phiên bản</span>
          Khoẻ Spa Manager {APP_VERSION}
        </p>
      </div>
    </aside>
  )
}
