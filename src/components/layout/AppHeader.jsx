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
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="app-header__brand">
          <KhoeSpaLogo size={32} />
          <div className="app-header__brand-text">
            <span className="app-header__system">Khoẻ Spa Manager</span>
            <span className="app-header__branch">{getCurrentUserBranchName()}</span>
          </div>
        </div>
      </div>

      <div className="app-header__user">
        <div className="app-header__user-info">
          <p className="app-header__user-name">{getCurrentUserName()}</p>
          <p className="app-header__user-meta">{getRoleLabel()}</p>
        </div>
        <div className="app-header__avatar" aria-hidden="true">
          {getCurrentUserName().charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  )
}
