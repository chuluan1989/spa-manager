import { useState } from 'react'
import { canAccessSettingsPage } from '../constants/auth'
import SettingsAccountsPermissionsTab from '../components/settings/SettingsAccountsPermissionsTab'
import SettingsAdminProfileTab from '../components/settings/SettingsAdminProfileTab'
import SettingsBranchesRolesTab from '../components/settings/SettingsBranchesRolesTab'
import SettingsCommissionPolicyTab from '../components/settings/SettingsCommissionPolicyTab'
import SettingsSystemTab from '../components/settings/SettingsSystemTab'
import './Settings.css'

const TABS = [
  { id: 'admin-profile', label: 'Hồ sơ Admin' },
  { id: 'accounts', label: 'Tài khoản & phân quyền' },
  { id: 'branches', label: 'Chi nhánh & vai trò' },
  { id: 'commission', label: 'Chính sách hoa hồng' },
  { id: 'system', label: 'Hệ thống' },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [toast, setToast] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  if (!canAccessSettingsPage()) {
    return (
      <div className="settings settings--denied">
        <h2 className="settings__title">Không có quyền truy cập</h2>
        <p className="settings__subtitle">Chỉ Admin được truy cập Cài đặt hệ thống.</p>
      </div>
    )
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const handleDataChange = () => setRefreshKey((value) => value + 1)

  const renderTab = () => {
    switch (activeTab) {
      case 'admin-profile':
        return <SettingsAdminProfileTab showToast={showToast} />
      case 'accounts':
        return <SettingsAccountsPermissionsTab showToast={showToast} key={refreshKey} />
      case 'branches':
        return <SettingsBranchesRolesTab showToast={showToast} onDataChange={handleDataChange} key={refreshKey} />
      case 'commission':
        return <SettingsCommissionPolicyTab showToast={showToast} key={refreshKey} />
      case 'system':
        return <SettingsSystemTab showToast={showToast} />
      default:
        return null
    }
  }

  return (
    <div className="settings">
      {toast && <div className="settings__toast">{toast}</div>}

      <header className="settings__header">
        <h2 className="settings__title">Cài đặt</h2>
        <p className="settings__subtitle">Quản trị hồ sơ, tài khoản, chi nhánh và cấu hình hệ thống</p>
      </header>

      <nav className="settings__tabs" aria-label="Cài đặt hệ thống">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`settings__tab${activeTab === tab.id ? ' settings__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {renderTab()}
    </div>
  )
}
