import { loadInvoices } from './invoiceStorage'
import { countServiceInvoiceStats } from './serviceInvoiceGuard'
import { getLastServiceChangeMeta } from './serviceChangeLogStorage'
import { getBranchPricingMatrix, ITEM_STATUS } from './serviceCatalogV2Storage'

export const TIME_FILTERS = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
  CUSTOM: 'custom',
}

export const TIME_FILTER_OPTIONS = [
  { value: TIME_FILTERS.TODAY, label: 'Hôm nay' },
  { value: TIME_FILTERS.WEEK, label: 'Tuần này' },
  { value: TIME_FILTERS.MONTH, label: 'Tháng này' },
  { value: TIME_FILTERS.QUARTER, label: 'Quý này' },
  { value: TIME_FILTERS.YEAR, label: 'Năm nay' },
  { value: TIME_FILTERS.CUSTOM, label: 'Tùy chọn' },
]

export const SORT_OPTIONS = [
  { value: 'name', label: 'Tên' },
  { value: 'revenue', label: 'Doanh thu' },
  { value: 'sold', label: 'Đã bán' },
  { value: 'updated', label: 'Mới sửa' },
  { value: 'price', label: 'Giá' },
  { value: 'commission', label: 'Hoa hồng' },
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getDateRangeForTimeFilter(filter, customFrom = '', customTo = '', now = new Date()) {
  const today = formatDate(now)

  if (filter === TIME_FILTERS.TODAY) {
    return { fromDate: today, toDate: today }
  }

  if (filter === TIME_FILTERS.WEEK) {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - diff)
    return { fromDate: formatDate(monday), toDate: today }
  }

  if (filter === TIME_FILTERS.MONTH) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { fromDate: formatDate(from), toDate: today }
  }

  if (filter === TIME_FILTERS.QUARTER) {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    return { fromDate: formatDate(from), toDate: today }
  }

  if (filter === TIME_FILTERS.YEAR) {
    const from = new Date(now.getFullYear(), 0, 1)
    return { fromDate: formatDate(from), toDate: today }
  }

  if (filter === TIME_FILTERS.CUSTOM) {
    return {
      fromDate: customFrom || today,
      toDate: customTo || today,
    }
  }

  return { fromDate: today, toDate: today }
}

export function formatDurationLabel(minutes) {
  if (minutes == null || minutes === '') return '—'
  return `${minutes}'`
}

export function formatCompactMoney(amount) {
  const value = Number(amount ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} tỷ`
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} triệu`
  if (value >= 1_000) return `${Math.round(value / 1_000)} nghìn`
  return String(value)
}

export function buildServiceManagementRows(branchId) {
  if (!branchId) return []

  return getBranchPricingMatrix(branchId).map((row) => {
    const lastChange = getLastServiceChangeMeta(branchId, row.durationId)
    return {
      ...row,
      durationLabel: formatDurationLabel(row.durationMinutes),
      isActive: row.serviceStatus === ITEM_STATUS.ACTIVE && row.durationStatus === ITEM_STATUS.ACTIVE,
      lastUpdatedAt: lastChange?.updatedAt ?? '',
      lastUpdatedBy: lastChange?.updatedBy ?? '',
    }
  })
}

export function attachInvoiceStats(rows, { branchId, fromDate, toDate }) {
  const invoices = loadInvoices()
  const hasInvoices = invoices.length > 0

  return rows.map((row) => {
    if (!hasInvoices) {
      return { ...row, soldCount: null, revenue: null }
    }
    const stats = countServiceInvoiceStats(invoices, {
      branchId,
      fromDate,
      toDate,
      durationId: row.durationId,
      serviceId: row.serviceId,
    })
    return {
      ...row,
      soldCount: stats.count,
      revenue: stats.revenue,
    }
  })
}

export function filterServiceRows(rows, { search = '', statusFilter = '' } = {}) {
  const q = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (statusFilter === 'active' && !row.isActive) return false
    if (statusFilter === 'inactive' && row.isActive) return false
    if (!q) return true

    const haystack = [
      row.serviceName,
      row.categoryName,
      row.durationLabel,
      String(row.durationMinutes ?? ''),
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
}

export function sortServiceRows(rows, sortBy) {
  const list = [...rows]
  const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'vi')
  const cmpNum = (a, b) => Number(a ?? 0) - Number(b ?? 0)

  switch (sortBy) {
    case 'revenue':
      list.sort((a, b) => cmpNum(b.revenue, a.revenue) || cmpText(a.serviceName, b.serviceName))
      break
    case 'sold':
      list.sort((a, b) => cmpNum(b.soldCount, a.soldCount) || cmpText(a.serviceName, b.serviceName))
      break
    case 'updated':
      list.sort((a, b) => cmpText(b.lastUpdatedAt, a.lastUpdatedAt) || cmpText(a.serviceName, b.serviceName))
      break
    case 'price':
      list.sort((a, b) => cmpNum(b.price, a.price) || cmpText(a.serviceName, b.serviceName))
      break
    case 'commission':
      list.sort((a, b) => cmpNum(b.commissionPercent, a.commissionPercent) || cmpText(a.serviceName, b.serviceName))
      break
    default:
      list.sort((a, b) => cmpText(a.categoryName, b.categoryName) || cmpText(a.serviceName, b.serviceName))
  }

  return list
}

export function groupRowsByCategory(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.categoryId)) {
      map.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        rows: [],
      })
    }
    map.get(row.categoryId).rows.push(row)
  }
  return [...map.values()]
}

export function computeServiceKpis(rows, { fromDate, toDate, branchId }) {
  const total = rows.length
  const active = rows.filter((row) => row.isActive).length
  const inactive = total - active

  const invoices = loadInvoices()
  let totalRevenue = null
  if (invoices.length > 0) {
    totalRevenue = 0
    for (const row of rows) {
      const stats = countServiceInvoiceStats(invoices, {
        branchId,
        fromDate,
        toDate,
        durationId: row.durationId,
        serviceId: row.serviceId,
      })
      totalRevenue += stats.revenue
    }
  }

  return { total, active, inactive, totalRevenue }
}

export function summarizeCategoryStats(rows) {
  const sold = rows.reduce((sum, row) => sum + (row.soldCount ?? 0), 0)
  const revenue = rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0)
  const hasStats = rows.some((row) => row.soldCount != null)
  return {
    serviceCount: rows.length,
    soldCount: hasStats ? sold : null,
    revenue: hasStats ? revenue : null,
  }
}

export function parseCommissionPercentInput(raw) {
  const text = String(raw ?? '').trim().replace(',', '.').replace('%', '')
  if (!text) return NaN
  const value = Number.parseFloat(text)
  if (!Number.isFinite(value)) return NaN
  if (value < 0 || value > 100) return NaN
  return value
}

export function parsePriceInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  const value = Number.parseInt(digits, 10)
  return Number.isFinite(value) && value >= 0 ? value : NaN
}
