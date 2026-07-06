import { COMMISSION } from '../constants/services'
import { getServiceMapForBranch } from './serviceStorage'

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

export function buildServiceDetailsForSave(selectedIds, branchId, fallbackServices = []) {
  const serviceMap = getServiceMapForBranch(branchId)
  return selectedIds
    .map((id) => {
      const live = serviceMap[id]
      if (live) {
        return {
          id: live.id,
          name: live.name,
          price: live.price,
          commissionPercent: live.commissionPercent,
          commissionAmount: Math.round(live.price * live.commissionPercent / 100),
        }
      }
      return fallbackServices.find((service) => service.id === id) ?? null
    })
    .filter(Boolean)
}

export function calculateCommissionFromDetails(services, tips) {
  const total10 = services
    .filter((s) => s.commissionPercent === COMMISSION.TEN)
    .reduce((sum, s) => sum + s.price, 0)

  const total20 = services
    .filter((s) => s.commissionPercent === COMMISSION.TWENTY)
    .reduce((sum, s) => sum + s.price, 0)

  const tipsValue = parseTips(tips)
  const serviceCommission = Math.round(total10 * COMMISSION.TEN / 100)
    + Math.round(total20 * COMMISSION.TWENTY / 100)

  return serviceCommission + tipsValue
}

export function calculateServiceCommissionFromDetails(services) {
  return services.reduce((sum, service) => sum + (service.commissionAmount ?? 0), 0)
}

export function calculateCommission(selectedIds, tips, branchId = '', fallbackServices = []) {
  const services = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
  return calculateCommissionFromDetails(services, tips)
}

export function calculateInvoiceTotals(selectedIds, tips, branchId = '', fallbackServices = []) {
  const services = buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
  const serviceTotal = services.reduce((sum, s) => sum + s.price, 0)
  const tipsValue = parseTips(tips)
  const total = serviceTotal + tipsValue
  const serviceCommission = calculateServiceCommissionFromDetails(services)
  const commission = serviceCommission + tipsValue

  return { serviceTotal, tips: tipsValue, total, commission, serviceCommission, services }
}

export function getSelectedServiceDetails(selectedIds, branchId = '', fallbackServices = []) {
  return buildServiceDetailsForSave(selectedIds, branchId, fallbackServices)
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
  if (details.length > 0) return details.reduce((sum, s) => sum + s.price, 0)
  const total = Number.isFinite(invoice?.total) ? invoice.total : 0
  const tips = Number.isFinite(invoice?.tips) ? invoice.tips : 0
  return Math.max(0, total - tips)
}
