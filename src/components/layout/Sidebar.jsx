import {
  getCurrentUserBranchName,
  getRoleLabel,
  getVisibleNavItems,
} from '../../constants/auth'
import NavIcon from './NavIcon'
import './Sidebar.css'

export default function Sidebar({ activeItem = 'dashboard', onNavigate, onLogout }) {
  const navItems = getVisibleNavItems()

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">S</div>
        <div>
          <h1 className="sidebar__title">Spa Manager</h1>
          <p className="sidebar__subtitle">Quản lý spa</p>
        </div>
      </div>

      <div className="sidebar__user">
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
