import { LogOut } from 'lucide-react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { getVisibleNavItems } from '../../constants/auth'
import NavIcon from './NavIcon'
import './Sidebar.css'

export default function Sidebar({ activeItem = 'dashboard', onNavigate, onLogout, isOpen = false }) {
  const navItems = getVisibleNavItems()

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`} aria-label="Menu chính">
      <div className="sidebar__brand">
        <KhoeSpaLogo size={64} className="sidebar__logo-img" priority />
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${activeItem === item.id ? 'sidebar__link--active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={activeItem === item.id ? 'page' : undefined}
          >
            <NavIcon name={item.icon} />
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__logout"
          onClick={onLogout}
          title="Đăng xuất"
          aria-label="Đăng xuất"
        >
          <LogOut size={20} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  )
}
