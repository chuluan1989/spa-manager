import { CUSTOMER_SEGMENTS } from '../constants/customerTypes'
import { getBranchName } from './branchStorage'
import { formatCurrency } from './invoice'

export function aggregateCustomerBranchSummaries(branches, customers) {
  return branches.map((branch) => {
    const branchCustomers = customers.filter((c) => c.branchIds?.includes(branch.id))
    const totals = branchCustomers.reduce(
      (acc, customer) => {
        acc.totalSpend += customer.totalSpend ?? 0
        acc.totalTips += customer.totalTips ?? 0
        acc.visitCount += customer.visitCount ?? 0
        if (customer.segment === CUSTOMER_SEGMENTS.NEW) acc.newCount += 1
        if (customer.segment === CUSTOMER_SEGMENTS.VIP) acc.vipCount += 1
        if (customer.segment === CUSTOMER_SEGMENTS.LOYAL) acc.loyalCount += 1
        if (customer.segment === CUSTOMER_SEGMENTS.AT_RISK) acc.atRiskCount += 1
        return acc
      },
      { totalSpend: 0, totalTips: 0, visitCount: 0, newCount: 0, vipCount: 0, loyalCount: 0, atRiskCount: 0 },
    )

    return {
      branchId: branch.id,
      branchName: branch.name ?? getBranchName(branch.id),
      employeeCount: branchCustomers.length,
      countLabel: 'khách hàng',
      ...totals,
    }
  })
}

export function formatCustomerBranchStats(branch) {
  return [
    { label: 'Tổng khách', value: branch.employeeCount, formatted: String(branch.employeeCount) },
    { label: 'Khách mới', value: branch.newCount, formatted: String(branch.newCount), tone: 'green' },
    { label: 'VIP', value: branch.vipCount, formatted: String(branch.vipCount), tone: 'gold' },
    { label: 'Chi tiêu', value: branch.totalSpend, formatted: formatCurrency(branch.totalSpend), tone: 'commission' },
  ]
}
