import { useState } from 'react'
import ServiceCatalogTab from '../components/services/ServiceCatalogTab'
import BranchServicePricingTab from '../components/services/BranchServicePricingTab'
import {
  canAccessServiceCatalogPage,
  canManageServiceCatalog,
} from '../constants/auth'
import './AdminSection.css'

export default function AdminServices() {
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState(canManageServiceCatalog() ? 'catalog' : 'pricing')

  if (!canAccessServiceCatalogPage()) {
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
        <p className="admin-section__subtitle">
          Trung tâm quản lý danh mục dịch vụ và bảng giá theo chi nhánh.
        </p>
      </header>

      <nav className="app-tabs admin-section__tabs">
        {canManageServiceCatalog() && (
          <button
            type="button"
            className={`app-tabs__btn ${tab === 'catalog' ? 'app-tabs__btn--active' : ''}`}
            onClick={() => setTab('catalog')}
          >
            Danh mục dịch vụ
          </button>
        )}
        <button
          type="button"
          className={`app-tabs__btn ${tab === 'pricing' ? 'app-tabs__btn--active' : ''}`}
          onClick={() => setTab('pricing')}
        >
          Bảng giá chi nhánh
        </button>
      </nav>

      {tab === 'catalog' && canManageServiceCatalog() && (
        <ServiceCatalogTab showToast={showToast} />
      )}
      {tab === 'pricing' && (
        <BranchServicePricingTab showToast={showToast} readOnly={!canManageServiceCatalog()} />
      )}
    </div>
  )
}
