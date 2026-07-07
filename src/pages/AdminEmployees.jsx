import { useState } from 'react'
import SettingsEmployeesTab from '../components/settings/SettingsEmployeesTab'
import { canAccessSettingsPage } from '../constants/auth'
import './AdminSection.css'

export default function AdminEmployees() {
  const [toast, setToast] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

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
        <h2 className="admin-section__title">Nhân viên</h2>
        <p className="admin-section__subtitle">Quản lý hồ sơ và phân bổ nhân viên toàn hệ thống</p>
      </header>
      <SettingsEmployeesTab showToast={showToast} key={refreshKey} />
    </div>
  )
}
