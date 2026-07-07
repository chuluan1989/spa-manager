import { useState } from 'react'
import SettingsServicesTab from '../components/settings/SettingsServicesTab'
import { canAccessSettingsPage } from '../constants/auth'
import './AdminSection.css'

export default function AdminServices() {
  const [toast, setToast] = useState('')

  if (!canAccessSettingsPage()) {
    return (
      <div className="admin-section admin-section--denied">
        <h2>Không có quyền truy cập</h2>
      </div>
    )
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="admin-section">
      {toast && <div className="admin-section__toast">{toast}</div>}
      <header className="admin-section__header">
        <h2 className="admin-section__title">Dịch vụ</h2>
        <p className="admin-section__subtitle">Quản lý danh mục dịch vụ và hoa hồng</p>
      </header>
      <SettingsServicesTab showToast={showToast} />
    </div>
  )
}
