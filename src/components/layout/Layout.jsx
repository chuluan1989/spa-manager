import AppHeader from './AppHeader'
import Sidebar from './Sidebar'
import { NAV_ITEMS } from '../../constants/navigation'
import './Layout.css'
import '../erp/erp.css'

function getPageTitle(activeItem) {
  const item = NAV_ITEMS.find((nav) => nav.id === activeItem)
  return item?.label ?? 'Tổng quan'
}

export default function Layout({ children, activeItem = 'dashboard', onNavigate, onLogout, banner = null }) {
  return (
    <div className="layout">
      <Sidebar
        activeItem={activeItem}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <div className="layout__content">
        <AppHeader pageTitle={getPageTitle(activeItem)} />
        <main className="layout__main">
          {banner}
          {children}
        </main>
      </div>
    </div>
  )
}
