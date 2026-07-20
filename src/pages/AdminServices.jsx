import { useState } from 'react'
import ServiceManagementCenter from '../components/services/ServiceManagementCenter'
import { canAccessServiceCatalogPage } from '../constants/auth'
import './AdminSection.css'

export default function AdminServices() {
  const [toast, setToast] = useState('')

  if (!canAccessServiceCatalogPage()) {
    return (
      <div className="admin-section admin-section--denied">
        <h2>Không có quyền truy cập</h2>
      </div>
    )
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 4000)
  }

  return (
    <div className="admin-section">
      {toast && <div className="admin-section__toast">{toast}</div>}
      <header className="admin-section__header">
        <h2 className="admin-section__title">Quản lý dịch vụ</h2>
        <p className="admin-section__subtitle">
          Mỗi chi nhánh có bảng giá riêng — giá và % hoa hồng mới chỉ áp dụng cho hóa đơn phát sinh sau khi lưu.
        </p>
      </header>

      <ServiceManagementCenter showToast={showToast} />
    </div>
  )
}
