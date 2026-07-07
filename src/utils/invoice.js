import { getServiceMapForBranch } from './serviceStorage'

const FLAT_20_PERCENT_BRANCHES = [
  'Vĩnh Long',
  'Trà Vinh',
  'Bạc Liêu',
]

export function parseTips(value) {
  if (value === '' || value === null || value === undefined) return 0
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

export function formatCurrency(amount) {
  const safe = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('vi-VN').format(safe) + ' ₫'
}

function getCommissionPercentByBranch(branchName, serviceCommissionPercent) {
  if (FLAT_20_PERCENT_BRANCHES.includes(branchName)) {
    return 20
  }

  return Number(serviceCommissionPercent ?? 0)
}

export function buildServiceDetailsForSave(selectedIds, branchId, fallbackServices = [], branchName = '') {
  const serviceMap = getServiceMapForBranch(branchId)

  return selectedIds
    .map((id) => {
      const live = serviceMap[id]
      const fallback = fallbackServices.find((service) => service.id === id)
      const service = live || fallback

      if (!service) return null

      const price = Number(service.price ?? 0)
      const commissionPercent = getCommissionPercentByBranch(
        branchName,
        service.commissionPercent,
      )

      return {
        id: service.id,
        name: service.name,
        price,
        commissionPercent,
        commissionAmount: Math.round((price * commissionPercent) / 100),
      }
    })
    .filter(Boolean)
}

export function calculateCommissionFromDetails(services, tips) {
  const serviceCommission = services.reduce((sum, service) => {
    return sum + Number(service.commissionAmount ?? 0)
  }, 0)

  return serviceCommission + parseTips(tips)
}

export function calculateServiceCommissionFromDetails(services) {
  return services.reduce((sum, service) => sum + Number(service.commissionAmount ?? 0), 0)
}

export function calculateCommission(selectedIds, tips, branchId = '', fallbackServices = [], branchName = '') {
  const services = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices, branchName)
  return calculateCommissionFromDetails(services, tips)
}

export function calculateInvoiceTotals(selectedIds, tips, branchId = '', fallbackServices = [], branchName = '') {
  const services = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices, branchName)

  const serviceTotal = services.reduce((sum, s) => sum + Number(s.price ?? 0), 0)
  const tipsValue = parseTips(tips)
  const total = serviceTotal + tipsValue
  const serviceCommission = calculateServiceCommissionFromDetails(services)
  const commission = serviceCommission + tipsValue

  return {
    serviceTotal,
    tips: tipsValue,
    total,
    commission,
    serviceCommission,
    services,
  }
}

export function getSelectedServiceDetails(selectedIds, branchId = '', fallbackServices = [], branchName = '') {
  return buildServiceDetailsForSave(selectedIds, branchId, fallbackServices, branchName)
}

export function getInvoiceServiceDetails(invoice) {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services
  }
  return []
}

export function formatServiceLine(service) {
  const price = formatCurrency(service.price).replace(' ₫', 'đ')
  const commission = formatCurrency(service.commissionAmount).replace(' ₫', 'đ')
  return `${service.name}: ${price} | HH ${service.commissionPercent}% = ${commission}`
}

export function getInvoiceServiceTotal(invoice) {
  if (Number.isFinite(invoice?.serviceTotal)) return invoice.serviceTotal

  const details = getInvoiceServiceDetails(invoice)
  if (details.length > 0) {
    return details.reduce((sum, s) => sum + Number(s.price ?? 0), 0)
  }

  const total = Number.isFinite(invoice?.total) ? invoice.total : 0
  const tips = Number.isFinite(invoice?.tips) ? invoice.tips : 0

  return Math.max(0, total - tips)
}
