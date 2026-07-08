import { canAccessCustomersPage } from '../constants/auth'
import CustomersPageDrill from '../components/customers/CustomersPageDrill'

export default function Customers() {
  if (!canAccessCustomersPage()) {
    return (
      <div className="customers">
        <p>Bạn không có quyền truy cập module Khách hàng.</p>
      </div>
    )
  }

  return <CustomersPageDrill />
}
