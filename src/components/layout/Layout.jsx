import { useState } from 'react'
import AppHeader from './AppHeader'
import Sidebar from './Sidebar'
import { NAV_ITEMS } from '../../constants/navigation'
import './Layout.css'

function getPageTitle(activeItem) {
  const item = NAV_ITEMS.find((nav) => nav.id === activeItem)
  return item?.label ?? 'Tổng quan'
}

export default function Layout({ children, activeItem = 'dashboard', onNavigate, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleNavigate = (itemId) => {
    onNavigate?.(itemId)
    setSidebarOpen(false)
  }

  return (
    <div className="layout">
      {sidebarOpen && (
        <button
          type="button"
          className="layout__overlay"
          aria-label="Đóng menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        activeItem={activeItem}
        onNavigate={handleNavigate}
        onLogout={onLogout}
        isOpen={sidebarOpen}
      />

      <div className="layout__content">
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          pageTitle={getPageTitle(activeItem)}
        />
        <main className="layout__main">{children}</main>
      </div>
    </div>
  )
}
