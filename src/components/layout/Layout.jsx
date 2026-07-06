import Sidebar from './Sidebar'
import './Layout.css'

export default function Layout({ children, activeItem = 'dashboard', onNavigate, onLogout }) {
  return (
    <div className="layout">
      <Sidebar activeItem={activeItem} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="layout__main">{children}</main>
    </div>
  )
}
