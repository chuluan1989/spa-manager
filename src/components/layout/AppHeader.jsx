import { Menu, X } from 'lucide-react'
import KhoeSpaLogo from '../brand/KhoeSpaLogo'
import { getCurrentUserBranchName, getCurrentUserName, getRoleLabel } from '../../constants/auth'
import './AppHeader.css'

export default function AppHeader({ sidebarOpen, onToggleSidebar }) {
  return (
    <header className="app-header">
      <div className="app-header__left">
        <button
          type="button"
          className="app-header__menu-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Đóng menu' : 'Mở menu'}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="app-header__brand-mobile">
          <KhoeSpaLogo size={36} />
        </div>
      </div>

      <div className="app-header__user">
        <div className="app-header__user-info">
          <p className="app-header__user-name">{getCurrentUserName()}</p>
          <p className="app-header__user-meta">
            {getRoleLabel()} · {getCurrentUserBranchName()}
          </p>
        </div>
        <div className="app-header__avatar" aria-hidden="true">
          {getCurrentUserName().charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
