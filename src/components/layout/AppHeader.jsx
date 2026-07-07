import { Menu, X } from 'lucide-react'
import { getCurrentUserName, getRoleLabel } from '../../constants/auth'
import './AppHeader.css'

export default function AppHeader({
  sidebarOpen,
  onToggleSidebar,
  pageTitle = 'Tổng quan',
}) {
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
        <h1 className="app-header__title">{pageTitle}</h1>
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
