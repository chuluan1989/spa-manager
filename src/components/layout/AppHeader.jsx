import { getCurrentUserName, getRoleLabel } from '../../constants/auth'
import './AppHeader.css'

export default function AppHeader({ pageTitle = 'Tổng quan' }) {
  return (
    <header className="app-header">
      <div className="app-header__left">
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
