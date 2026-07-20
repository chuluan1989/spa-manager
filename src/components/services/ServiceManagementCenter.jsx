import { useState } from 'react'
import { canManageServiceCatalog } from '../../constants/auth'
import ServiceAdvancedTab from './ServiceAdvancedTab'
import ServiceQuickTab from './ServiceQuickTab'
import './ServiceManagementCenter.css'

export default function ServiceManagementCenter({ showToast }) {
  const [tab, setTab] = useState('quick')
  const canManage = canManageServiceCatalog()

  return (
    <div className="svc-mgmt-center">
      <nav className="app-tabs svc-mgmt-center__tabs">
        <button
          type="button"
          className={`app-tabs__btn ${tab === 'quick' ? 'app-tabs__btn--active' : ''}`}
          onClick={() => setTab('quick')}
        >
          Quản lý nhanh
        </button>
        {canManage && (
          <button
            type="button"
            className={`app-tabs__btn ${tab === 'advanced' ? 'app-tabs__btn--active' : ''}`}
            onClick={() => setTab('advanced')}
          >
            Nâng cao
          </button>
        )}
      </nav>

      {tab === 'quick' && (
        <ServiceQuickTab showToast={showToast} readOnly={!canManage} />
      )}
      {tab === 'advanced' && canManage && (
        <ServiceAdvancedTab showToast={showToast} />
      )}
    </div>
  )
}
