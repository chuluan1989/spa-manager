import { useMemo, useState } from 'react'
import CustomerDetail from './CustomerDetail'
import CustomerFilters from './CustomerFilters'
import CustomerList from './CustomerList'
import CustomerRemarketing from './CustomerRemarketing'
import ErpBranchCardGrid from '../erp/ErpBranchCardGrid'
import ErpBreadcrumb from '../erp/ErpBreadcrumb'
import ErpKpiGrid from '../erp/ErpKpiGrid'
import ErpPageHeader from '../erp/ErpPageHeader'
import { getActiveBranches } from '../../constants/branches'
import {
  canManageCustomerCare,
  canSelectBranch,
  getCurrentUserBranch,
  isAdmin,
  isEmployee,
} from '../../constants/auth'
import { CUSTOMER_SEGMENTS } from '../../constants/customerTypes'
import { buildDefaultCustomerFilters, useCustomersData } from '../../hooks/useCustomersData'
import { getCareLogsForCustomer } from '../../utils/customerProfileStorage'
import {
  aggregateCustomerBranchSummaries,
  formatCustomerBranchStats,
} from '../../utils/customerViewHelpers'
import '../erp/erp.css'
import '../../pages/Customers.css'

const LEVEL = {
  BRANCHES: 'branches',
  CUSTOMERS: 'customers',
  REMARKETING: 'remarketing',
  CARE: 'care',
}

function getInitialLevel() {
  if (isAdmin()) return LEVEL.BRANCHES
  return LEVEL.CUSTOMERS
}

export default function CustomersPageDrill() {
  const [level, setLevel] = useState(getInitialLevel)
  const [selectedBranchId, setSelectedBranchId] = useState(() =>
    (canSelectBranch() ? '' : getCurrentUserBranch()),
  )
  const [selectedKey, setSelectedKey] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [draftFilters, setDraftFilters] = useState(buildDefaultCustomerFilters)
  const [appliedFilters, setAppliedFilters] = useState(buildDefaultCustomerFilters)

  const branchScopedFilters = useMemo(() => ({
    ...appliedFilters,
    branchId: selectedBranchId || appliedFilters.branchId,
    segment: segmentFilter || appliedFilters.segment,
  }), [appliedFilters, selectedBranchId, segmentFilter])

  const { customers, filteredCustomers, dashboard, remarketingLists, reload } = useCustomersData(branchScopedFilters)

  const visibleBranches = useMemo(() => {
    const all = getActiveBranches()
    if (isAdmin()) return all
    return all.filter((b) => b.id === getCurrentUserBranch())
  }, [])

  const branchSummaries = useMemo(
    () => aggregateCustomerBranchSummaries(visibleBranches, customers),
    [visibleBranches, customers],
  )

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.key === selectedKey) ?? null,
    [customers, selectedKey],
  )

  const kpiItems = useMemo(() => [
    {
      id: 'total',
      label: 'Tổng khách',
      value: dashboard.totalCustomers,
      onClick: () => { setSegmentFilter(''); setLevel(LEVEL.CUSTOMERS) },
    },
    {
      id: 'new',
      label: 'Khách mới',
      value: dashboard.newCustomers,
      tone: 'green',
      onClick: () => { setSegmentFilter(CUSTOMER_SEGMENTS.NEW); setLevel(LEVEL.CUSTOMERS) },
    },
    {
      id: 'loyal',
      label: 'Khách thân thiết',
      value: dashboard.loyalCustomers,
      tone: 'blue',
      onClick: () => { setSegmentFilter(CUSTOMER_SEGMENTS.LOYAL); setLevel(LEVEL.CUSTOMERS) },
    },
    {
      id: 'vip',
      label: 'Khách VIP',
      value: dashboard.vipCustomers,
      tone: 'gold',
      onClick: () => { setSegmentFilter(CUSTOMER_SEGMENTS.VIP); setLevel(LEVEL.CUSTOMERS) },
    },
    {
      id: 'at_risk',
      label: 'Nguy cơ mất',
      value: dashboard.atRiskCustomers,
      tone: 'red',
      onClick: () => { setSegmentFilter(CUSTOMER_SEGMENTS.AT_RISK); setLevel(LEVEL.CUSTOMERS) },
    },
    {
      id: 'return',
      label: 'Quay lại tháng này',
      value: dashboard.returningThisMonth,
    },
  ], [dashboard])

  const breadcrumbItems = useMemo(() => {
    if (isEmployee()) return []
    const items = [{ id: 'crm', label: 'Khách hàng', onClick: () => { setLevel(LEVEL.BRANCHES); setSelectedBranchId(''); setSelectedKey('') } }]
    if (level === LEVEL.BRANCHES) return items
    if (selectedBranchId || !isAdmin()) {
      items.push({
        id: 'branch',
        label: visibleBranches.find((b) => b.id === selectedBranchId)?.name ?? 'Chi nhánh',
        onClick: () => { setLevel(LEVEL.CUSTOMERS); setSelectedKey('') },
      })
    }
    if (selectedCustomer) {
      items.push({ id: 'customer', label: selectedCustomer.name })
    }
    return items
  }, [level, selectedBranchId, selectedCustomer, visibleBranches])

  return (
    <div className="customers erp-page">
      <ErpPageHeader
        title="Khách hàng"
        subtitle="CRM quản lý khách — drill-down: Tổng quan → Chi nhánh → Hồ sơ khách → Lịch sử dịch vụ."
        badge={{ value: customers.length, label: 'khách' }}
      />

      {!isEmployee() && <ErpBreadcrumb items={breadcrumbItems} />}

      {(level === LEVEL.BRANCHES || isAdmin()) && level !== LEVEL.CUSTOMERS && level !== LEVEL.REMARKETING && (
        <ErpKpiGrid items={kpiItems} />
      )}

      {level === LEVEL.BRANCHES && !isEmployee() && (
        <>
          <h2 className="erp-section-title">Chi nhánh</h2>
          <ErpBranchCardGrid
            branches={branchSummaries}
            onSelectBranch={(branchId) => {
              setSelectedBranchId(branchId)
              setLevel(LEVEL.CUSTOMERS)
              setSelectedKey('')
            }}
            renderStat={formatCustomerBranchStats}
          />
          <div className="customers__quick-links">
            <button type="button" className="erp-btn" onClick={() => setLevel(LEVEL.REMARKETING)}>
              Remarketing
            </button>
            {canManageCustomerCare() && (
              <button type="button" className="erp-btn" onClick={() => setLevel(LEVEL.CARE)}>
                Chăm sóc khách
              </button>
            )}
          </div>
        </>
      )}

      {(level === LEVEL.CUSTOMERS || (!isAdmin() && level !== LEVEL.REMARKETING && level !== LEVEL.CARE)) && (
        <div className={`customers__layout ${selectedCustomer ? 'customers__layout--split' : ''}`}>
          <div className="customers__main">
            <CustomerFilters
              filters={{ ...draftFilters, branchId: selectedBranchId || draftFilters.branchId, segment: segmentFilter || draftFilters.segment }}
              onChange={(next) => setDraftFilters({ ...next, branchId: selectedBranchId || next.branchId })}
              onApply={() => setAppliedFilters({ ...draftFilters, branchId: selectedBranchId, segment: segmentFilter || draftFilters.segment })}
              onReset={() => {
                const reset = buildDefaultCustomerFilters({ branchId: selectedBranchId })
                setDraftFilters(reset)
                setAppliedFilters(reset)
                setSegmentFilter('')
              }}
            />
            <p className="customers__result-count">{filteredCustomers.length} khách phù hợp</p>
            <CustomerList
              customers={filteredCustomers}
              selectedKey={selectedKey}
              onSelect={(key) => setSelectedKey(key)}
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

      {level === LEVEL.REMARKETING && (
        <div className={`customers__layout ${selectedCustomer ? 'customers__layout--split' : ''}`}>
          <div className="customers__main">
            <button type="button" className="erp-btn erp-btn--ghost" onClick={() => setLevel(LEVEL.BRANCHES)}>← Tổng quan CRM</button>
            <CustomerRemarketing remarketingLists={remarketingLists} onSelectCustomer={setSelectedKey} />
          </div>
          {selectedCustomer && (
            <CustomerDetail customer={selectedCustomer} onClose={() => setSelectedKey('')} onUpdated={reload} />
          )}
        </div>
      )}

      {level === LEVEL.CARE && canManageCustomerCare() && (
        <section className="crm-care-hub">
          <button type="button" className="erp-btn erp-btn--ghost" onClick={() => setLevel(LEVEL.BRANCHES)}>← Tổng quan CRM</button>
          <p className="crm-care-hub__hint">Chọn khách từ danh sách hoặc Remarketing để xem lịch sử chăm sóc.</p>
          <div className="crm-care-hub__recent">
            {customers.flatMap((customer) =>
              getCareLogsForCustomer(customer.key).slice(0, 1).map((log) => ({ customer, log })),
            ).slice(0, 12).map(({ customer, log }) => (
              <button key={`${customer.key}-${log.id}`} type="button" className="crm-care-hub__card" onClick={() => setSelectedKey(customer.key)}>
                <strong>{customer.name}</strong>
                <span>{log.careDate} · {log.caretaker}</span>
                <p>{log.content}</p>
              </button>
            ))}
          </div>
          {selectedCustomer && (
            <CustomerDetail customer={selectedCustomer} onClose={() => setSelectedKey('')} onUpdated={reload} />
          )}
        </section>
      )}
    </div>
  )
}
