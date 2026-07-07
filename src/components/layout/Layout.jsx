import { useState } from 'react'
import AppHeader from './AppHeader'
import Sidebar from './Sidebar'
import './Layout.css'

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
        />
        <main className="layout__main">{children}</main>
      </div>
    </div>
  )
}
