import { useState } from 'react'
import { canAccessSettingsPage } from '../constants/auth'
import SettingsAccountsTab from '../components/settings/SettingsAccountsTab'
import SettingsBackupTab from '../components/settings/SettingsBackupTab'
import SettingsBranchPricingTab from '../components/settings/SettingsBranchPricingTab'
import SettingsBranchesTab from '../components/settings/SettingsBranchesTab'
import SettingsEmployeesTab from '../components/settings/SettingsEmployeesTab'
import SettingsServicesTab from '../components/settings/SettingsServicesTab'
import './Settings.css'

const TABS = [
  { id: 'branches', label: 'Chi nhánh' },
  { id: 'employees', label: 'Nhân viên' },
  { id: 'services', label: 'Dịch vụ' },
  { id: 'branch-pricing', label: 'Bảng giá theo chi nhánh' },
  { id: 'accounts', label: 'Tài khoản & phân quyền' },
  { id: 'backup', label: 'Sao lưu dữ liệu' },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState(TABS[0].id)
  const [toast, setToast] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  if (!canAccessSettingsPage()) {
    return (
      <div className="settings settings--denied">
        <h2 className="settings__title">Không có quyền truy cập</h2>
        <p className="settings__subtitle">Chỉ Admin được truy cập Trung tâm quản trị hệ thống.</p>
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
      case 'branches':
        return <SettingsBranchesTab showToast={showToast} onDataChange={handleDataChange} />
      case 'employees':
        return <SettingsEmployeesTab showToast={showToast} key={refreshKey} />
      case 'services':
        return <SettingsServicesTab showToast={showToast} />
      case 'branch-pricing':
        return <SettingsBranchPricingTab showToast={showToast} key={refreshKey} />
      case 'accounts':
        return <SettingsAccountsTab showToast={showToast} />
      case 'backup':
        return <SettingsBackupTab showToast={showToast} />
      default:
        return null
    }
  }

  return (
    <div className="settings">
      {toast && <div className="settings__toast">{toast}</div>}

      <header className="settings__header">
        <h2 className="settings__title">Trung tâm quản trị hệ thống</h2>
        <p className="settings__subtitle">
          Quản lý chi nhánh, nhân viên, dịch vụ, bảng giá, tài khoản và sao lưu dữ liệu
        </p>
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
