import { COMMISSION_POLICY_TYPE } from '../constants/commissionPolicyTypes'
import { getBranchCommissionPolicy } from './commissionPolicyStorage'

function normalizeServiceKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
}

function matchesServiceToken(serviceKey, token) {
  if (!serviceKey || !token) return false
  if (serviceKey === token) return true
  if (serviceKey.includes(token) || token.includes(serviceKey)) return true
  return false
}

function serviceMatchesGroup(service, group) {
  const serviceId = normalizeServiceKey(service?.id)
  const serviceName = normalizeServiceKey(service?.name)

  for (const id of group.serviceIds ?? []) {
    const token = normalizeServiceKey(id)
    if (serviceId === token || serviceId.endsWith(`-${token}`)) return true
  }

  for (const name of group.serviceNames ?? []) {
    const token = normalizeServiceKey(name)
    if (matchesServiceToken(serviceName, token)) return true
  }

  return false
}

export function resolveCommissionPercent(branchId, service, policy = null) {
  const branchPolicy = policy ?? getBranchCommissionPolicy(branchId)
  if (!branchPolicy) return 0

  if (branchPolicy.policyType === COMMISSION_POLICY_TYPE.FLAT) {
    return Number(branchPolicy.flatRate ?? branchPolicy.defaultRate ?? 0)
  }

  for (const group of branchPolicy.groups ?? []) {
    if (serviceMatchesGroup(service, group)) {
      return Number(group.rate ?? 0)
    }
  }

  return Number(branchPolicy.defaultRate ?? 0)
}

export function getBranchCommissionPolicySummary(branchId, policy = null) {
  const branchPolicy = policy ?? getBranchCommissionPolicy(branchId)
  if (!branchPolicy) return 'Chưa cấu hình'

  if (branchPolicy.policyType === COMMISSION_POLICY_TYPE.FLAT) {
    return `${branchPolicy.flatRate ?? branchPolicy.defaultRate ?? 0}% tất cả dịch vụ`
  }

  const parts = (branchPolicy.groups ?? []).map((group) => `${group.label || `${group.rate}%`}`)
  parts.push(`${branchPolicy.defaultRate ?? 20}% (còn lại)`)
  return parts.join(' · ')
}

export function calculateCommissionAmount(actualPrice, percent) {
  const price = Number(actualPrice ?? 0)
  const rate = Number(percent ?? 0)
  return Math.round(price * rate / 100)
}
