import { useMemo, useState } from 'react'
import CustomerFilters from './CustomerFilters'
import CustomerList from './CustomerList'
import {
  CUSTOMER_SEGMENT_LABELS,
  REMARKETING_LIST_LABELS,
  REMARKETING_LISTS,
} from '../../constants/customerTypes'
import { buildDefaultCustomerFilters } from '../../hooks/useCustomersData'
import { filterCustomers } from '../../utils/customerAnalytics'

export default function CustomerRemarketing({
  remarketingLists,
  onSelectCustomer,
}) {
  const [activeList, setActiveList] = useState(REMARKETING_LISTS.INACTIVE_90)
  const [draftFilters, setDraftFilters] = useState(buildDefaultCustomerFilters())
  const [appliedFilters, setAppliedFilters] = useState(buildDefaultCustomerFilters())

  const listKeys = Object.keys(REMARKETING_LIST_LABELS)

  const baseCustomers = remarketingLists[activeList] ?? []

  const customers = useMemo(
    () => filterCustomers(baseCustomers, appliedFilters),
    [baseCustomers, appliedFilters],
  )

  return (
    <section className="crm-remarketing">
      <div className="crm-remarketing__lists">
        {listKeys.map((key) => {
          const count = remarketingLists[key]?.length ?? 0
          return (
            <button
              key={key}
              type="button"
              className={activeList === key ? 'crm-remarketing__chip--active' : 'crm-remarketing__chip'}
              onClick={() => setActiveList(key)}
            >
              {REMARKETING_LIST_LABELS[key]}
              <span>{count}</span>
            </button>
          )
        })}
      </div>

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

      <CustomerList
        customers={customers}
        selectedKey=""
        onSelect={(key) => onSelectCustomer(key)}
      />
    </section>
  )
}
