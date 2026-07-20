import { getBranchById } from './branchStorage'
import {
  BRANCH_SUPPORT_SERVICE_ID,
  BRANCH_SUPPORT_SERVICE_NAME,
  createBranchSupportCatalogEntry,
} from '../constants/branchSupportService'
import { parseTips } from './invoice'

function parseMoneyInput(input) {
  const digits = String(input ?? '').replace(/\D/g, '')
  const amount = Number.parseInt(digits, 10)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function parseCommissionRateInput(input) {
  const raw = String(input ?? '').trim().replace(',', '.')
  if (!raw) return NaN
  const value = raw.endsWith('%') ? Number.parseFloat(raw.slice(0, -1)) : Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0 || value > 100) return NaN
  return value
}

export function isBranchSupportServiceEnabled(branchId) {
  if (!branchId) return false
  const branch = getBranchById(branchId)
  return Boolean(branch && branch.status !== 'inactive')
}

export function appendBranchSupportServiceToFlatList(services = []) {
  const list = Array.isArray(services) ? [...services] : []
  if (list.some((service) => service.id === BRANCH_SUPPORT_SERVICE_ID)) {
    return list
  }
  return [...list, createBranchSupportCatalogEntry()]
}

export function appendBranchSupportServiceToGroups(groups = []) {
  const list = Array.isArray(groups) ? [...groups] : []
  const hasSupport = list.some((group) =>
    (group.services ?? []).some((service) => service.id === BRANCH_SUPPORT_SERVICE_ID)
    || (group.families ?? []).some((family) =>
      (family.variants ?? []).some((variant) => variant.id === BRANCH_SUPPORT_SERVICE_ID),
    ),
  )
  if (hasSupport) return list

  return [
    ...list,
    {
      id: 'branch-support-group',
      name: 'Dịch vụ đặc biệt',
      services: [createBranchSupportCatalogEntry()],
      families: [],
    },
  ]
}

export function calculateBranchSupportTotals({
  priceInput = '',
  commissionRateInput = '',
  tipsInput = '',
  supportNote = '',
}) {
  const price = parseMoneyInput(priceInput)
  const commissionPercent = parseCommissionRateInput(commissionRateInput)
  const tips = parseTips(tipsInput)
  const commissionAmount = Number.isFinite(commissionPercent)
    ? Math.round(price * commissionPercent / 100)
    : 0

  const services = [{
    id: BRANCH_SUPPORT_SERVICE_ID,
    name: BRANCH_SUPPORT_SERVICE_NAME,
    originalPrice: price,
    price,
    discountAmount: 0,
    commissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 0,
    commissionAmount,
    isSupportService: true,
    supportNote: String(supportNote ?? '').trim(),
  }]

  return {
    originalServiceTotal: price,
    discountInput: '',
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    serviceTotal: price,
    payment: price,
    tips,
    total: price + tips,
    customerTotal: price + tips,
    commission: commissionAmount,
    serviceCommission: commissionAmount,
    services,
  }
}

export function validateBranchSupportForm({
  branchId = '',
  employeeId = '',
  priceInput = '',
  commissionRateInput = '',
  tipsInput = '',
}) {
  const errors = {}

  if (!isBranchSupportServiceEnabled(branchId)) {
    errors.branchId = 'Chi nhánh không hỗ trợ dịch vụ hỗ trợ'
  }
  if (!employeeId) {
    errors.employeeId = 'Vui lòng chọn nhân viên'
  }

  const price = parseMoneyInput(priceInput)
  if (!price) {
    errors.supportPrice = 'Vui lòng nhập giá dịch vụ'
  }

  const rate = parseCommissionRateInput(commissionRateInput)
  if (!Number.isFinite(rate)) {
    errors.supportCommission = 'Vui lòng nhập % hoa hồng (1–100)'
  }

  if (tipsInput === '' || tipsInput === null || tipsInput === undefined) {
    errors.supportTips = 'Vui lòng nhập Tips (có thể nhập 0)'
  } else if (parseTips(tipsInput) < 0) {
    errors.supportTips = 'Tips không hợp lệ'
  }

  return errors
}
