import { useMemo, useState } from 'react'
import CustomerDashboard from '../components/customers/CustomerDashboard'
import CustomerDetail from '../components/customers/CustomerDetail'
import CustomerFilters from '../components/customers/CustomerFilters'
import CustomerList from '../components/customers/CustomerList'
import CustomerRemarketing from '../components/customers/CustomerRemarketing'
import { canAccessCustomersPage, canManageCustomerCare } from '../constants/auth'
import { buildDefaultCustomerFilters, useCustomersData } from '../hooks/useCustomersData'
import { getCareLogsForCustomer } from '../utils/customerProfileStorage'
import './Customers.css'

const TABS = [
  { id: 'dashboard', label: 'Tổng quan CRM' },
  { id: 'list', label: 'Danh sách khách' },
  { id: 'remarketing', label: 'Remarketing' },
]

export default function Customers() {
  if (!canAccessCustomersPage()) {
    return (
      <div className="customers">
        <p>Bạn không có quyền truy cập module Khách hàng.</p>
      </div>
    )
  }

  return <CustomersPage />
}

function CustomersPage() {
  const [screen, setScreen] = useState('dashboard')
  const [draftFilters, setDraftFilters] = useState(buildDefaultCustomerFilters)
  const [appliedFilters, setAppliedFilters] = useState(buildDefaultCustomerFilters)
  const [selectedKey, setSelectedKey] = useState('')

  const { customers, filteredCustomers, dashboard, remarketingLists, reload } = useCustomersData(appliedFilters)

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === selectedKey) ?? null,
    [customers, selectedKey],
  )

  const tabs = useMemo(() => {
    const list = [...TABS]
    if (canManageCustomerCare()) {
      list.push({ id: 'care', label: 'Chăm sóc khách' })
    }
    return list
  }, [])

  const handleSelectCustomer = (key) => {
    setSelectedKey(key)
    if (screen !== 'list' && screen !== 'remarketing') {
      setScreen('list')
    }
  }

  return (
    <div className="customers">
      <header className="customers__header">
        <div>
          <h1 className="customers__title">Khách hàng</h1>
          <p className="customers__subtitle">
            CRM quản lý khách hàng — dữ liệu tự động tổng hợp từ hóa đơn, tips và dịch vụ.
          </p>
        </div>
        <div className="customers__count">
          <span>{customers.length}</span>
          <small>khách trong phạm vi</small>
        </div>
      </header>

      <nav className="customers__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={screen === tab.id ? 'customers__tab--active' : ''}
            onClick={() => setScreen(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {screen === 'dashboard' && <CustomerDashboard dashboard={dashboard} />}

      {screen === 'list' && (
        <div className={`customers__layout ${selectedCustomer ? 'customers__layout--split' : ''}`}>
          <div className="customers__main">
            <CustomerFilters
              filters={draftFilters}
              onChange={setDraftFilters}
              onApply={() => setAppliedFilters({ ...draftFilters })}
              onReset={() => {
                const reset = buildDefaultCustomerFilters()
                setDraftFilters(reset)
                setAppliedFilters(reset)
              }}
            />
            <p className="customers__result-count">{filteredCustomers.length} khách phù hợp</p>
            <CustomerList
              customers={filteredCustomers}
              selectedKey={selectedKey}
              onSelect={handleSelectCustomer}
            />
          </div>
          {selectedCustomer && (
            <CustomerDetail
              customer={selectedCustomer}
              onClose={() => setSelectedKey('')}
              onUpdated={reload}
            />
          )}
        </div>
      )}

      {screen === 'remarketing' && (
        <div className={`customers__layout ${selectedCustomer ? 'customers__layout--split' : ''}`}>
          <div className="customers__main">
            <CustomerRemarketing
              remarketingLists={remarketingLists}
              onSelectCustomer={handleSelectCustomer}
            />
          </div>
          {selectedCustomer && (
            <CustomerDetail
              customer={selectedCustomer}
              onClose={() => setSelectedKey('')}
              onUpdated={reload}
            />
          )}
        </div>
      )}

      {screen === 'care' && canManageCustomerCare() && (
        <section className="crm-care-hub">
          <p className="crm-care-hub__hint">Chọn khách từ danh sách hoặc Remarketing để xem lịch sử chăm sóc chi tiết.</p>
          <div className="crm-care-hub__recent">
            {customers
              .flatMap((customer) =>
                getCareLogsForCustomer(customer.key).slice(0, 1).map((log) => ({ customer, log })),
              )
              .slice(0, 12)
              .map(({ customer, log }) => (
                <button
                  key={`${customer.key}-${log.id}`}
                  type="button"
                  className="crm-care-hub__card"
                  onClick={() => handleSelectCustomer(customer.key)}
                >
                  <strong>{customer.name}</strong>
                  <span>{log.careDate} · {log.caretaker}</span>
                  <p>{log.content}</p>
                </button>
              ))}
          </div>
          {selectedCustomer && (
            <CustomerDetail
              customer={selectedCustomer}
              onClose={() => setSelectedKey('')}
              onUpdated={reload}
            />
          )}
        </section>
      )}
    </div>
  )
}
