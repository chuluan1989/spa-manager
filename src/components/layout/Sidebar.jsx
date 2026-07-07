import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import {
  getCurrentUserBranchName,
  getCurrentUserName,
  getRoleLabel,
  getVisibleNavItems,
} from '../../constants/auth'
import NavIcon from './NavIcon'
import './Sidebar.css'

export default function Sidebar({ activeItem = 'dashboard', onNavigate, onLogout, isOpen = false }) {
  const navItems = getVisibleNavItems()

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <KhoeSpaLogo size={48} className="sidebar__logo-img" />
        <div className="sidebar__brand-text">
          <h1 className="sidebar__title">Khoẻ Spa</h1>
          <p className="sidebar__subtitle">Manager</p>
        </div>
      </div>

      <div className="sidebar__user">
        <p className="sidebar__user-name">{getCurrentUserName()}</p>
        <p className="sidebar__user-role">{getRoleLabel()}</p>
        <p className="sidebar__user-branch">{getCurrentUserBranchName()}</p>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${activeItem === item.id ? 'sidebar__link--active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button type="button" className="sidebar__logout" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
