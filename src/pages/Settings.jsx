import { useState } from 'react'
import { canAccessSettingsPage } from '../constants/auth'
import SettingsAccountsTab from '../components/settings/SettingsAccountsTab'
import SettingsAdminProfileTab from '../components/settings/SettingsAdminProfileTab'
import SettingsAuditLogTab from '../components/settings/SettingsAuditLogTab'
import SettingsBackupTab from '../components/settings/SettingsBackupTab'
import SettingsBranchPricingTab from '../components/settings/SettingsBranchPricingTab'
import SettingsBranchesTab from '../components/settings/SettingsBranchesTab'
import SettingsEmployeesTab from '../components/settings/SettingsEmployeesTab'
import SettingsPoliciesTab from '../components/settings/SettingsPoliciesTab'
import SettingsServicesTab from '../components/settings/SettingsServicesTab'
import './Settings.css'

const TABS = [
  { id: 'admin-profile', label: 'Hồ sơ Admin' },
  { id: 'accounts', label: 'Quản lý tài khoản & phân quyền' },
  { id: 'branches', label: 'Quản lý chi nhánh' },
  { id: 'employees', label: 'Quản lý nhân viên' },
  { id: 'services', label: 'Quản lý dịch vụ' },
  { id: 'branch-pricing', label: 'Bảng giá theo chi nhánh' },
  { id: 'policies', label: 'Chính sách lương & hoa hồng' },
  { id: 'audit-log', label: 'Quản lý Nhật ký' },
  { id: 'backup', label: 'Backup & Hệ thống' },
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
      case 'admin-profile':
        return <SettingsAdminProfileTab showToast={showToast} />
      case 'branches':
        return <SettingsBranchesTab showToast={showToast} onDataChange={handleDataChange} />
      case 'employees':
        return <SettingsEmployeesTab showToast={showToast} key={refreshKey} />
      case 'services':
        return <SettingsServicesTab showToast={showToast} />
      case 'branch-pricing':
        return <SettingsBranchPricingTab showToast={showToast} key={refreshKey} />
      case 'policies':
        return <SettingsPoliciesTab />
      case 'audit-log':
        return <SettingsAuditLogTab />
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
          Quản lý tài khoản, chi nhánh, nhân viên, dịch vụ, chính sách, nhật ký và sao lưu dữ liệu
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
