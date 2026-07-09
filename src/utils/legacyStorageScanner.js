/**
 * Quét toàn bộ localStorage, nhận diện dữ liệu cũ theo cấu trúc JSON
 * (không phụ thuộc một key cố định).
 */
import { rowToCamel } from '../repositories/caseUtils'
import { normalizeEmployee } from './employeeStorage'
import { normalizeExpense } from './expenseStorage'
import { normalizeBranch } from './branchStorage'
import { normalizeService } from './serviceStorage'

export const LEGACY_IMPORT_COMPLETED_KEY = 'legacy_import_completed'
export const LEGACY_IMPORT_LOG_KEY = 'spa-manager-legacy-import-log'

const SKIP_KEY_EXACT = new Set([
  LEGACY_IMPORT_COMPLETED_KEY,
  LEGACY_IMPORT_LOG_KEY,
  'spa-manager-supabase-migrated-v1',
  'spa-manager-pre-import-backup',
  'spa-manager-current-user',
  'spa-manager-services-version',
])

const SKIP_KEY_PREFIXES = ['spa-manager-legacy-cloud-sync-v1:']

const KNOWN_KEY_HINTS = {
  employees: ['employee', 'nhan-vien', 'nhanvien', 'staff'],
  invoices: ['invoice', 'hoa-don', 'hoadon', 'tour', 'revenue', 'doanh-thu'],
  expenses: ['expense', 'chi-phi', 'chiphi', 'cost'],
  services: ['service', 'dich-vu', 'dichvu', 'catalog'],
  branches: ['branch', 'chi-nhanh', 'chinhanh'],
  branchPricing: ['pricing', 'branch-pricing', 'bang-gia', 'price'],
  settings: ['setting', 'cai-dat', 'config'],
  permissions: ['permission', 'phan-quyen'],
  credentials: ['credential', 'auth', 'password', 'tai-khoan'],
}

function shouldSkipStorageKey(key) {
  if (!key) return true
  if (SKIP_KEY_EXACT.has(key)) return true
  return SKIP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function simpleHash(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function pickField(item, ...keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== '') {
      return item[key]
    }
  }
  return ''
}

export function buildInvoiceFingerprint(raw) {
  const servicePart = JSON.stringify(
    raw.serviceIds
      ?? raw.service_ids
      ?? (Array.isArray(raw.services) ? raw.services.map((s) => s.id ?? s.serviceId ?? s.name) : []),
  )
  const parts = [
    pickField(raw, 'date'),
    pickField(raw, 'branchId', 'branch_id'),
    pickField(raw, 'employeeId', 'employee_id'),
    servicePart,
    String(raw.total ?? raw.serviceTotal ?? raw.service_total ?? 0),
    String(raw.tips ?? raw.tip ?? 0),
    String(pickField(raw, 'customerName', 'customer_name')).trim(),
  ]
  return `legacy-inv-${simpleHash(parts.join('|'))}`
}

export function buildEmployeeFingerprint(raw) {
  const parts = [
    pickField(raw, 'name'),
    pickField(raw, 'branchId', 'branch_id'),
    pickField(raw, 'phone'),
    pickField(raw, 'cccd'),
  ]
  return `legacy-emp-${simpleHash(parts.join('|'))}`
}

export function buildExpenseFingerprint(raw) {
  const parts = [
    pickField(raw, 'date'),
    pickField(raw, 'branchId', 'branch_id'),
    String(raw.amount ?? 0),
    pickField(raw, 'content', 'expenseType', 'expense_type'),
    pickField(raw, 'enteredBy', 'entered_by'),
  ]
  return `legacy-exp-${simpleHash(parts.join('|'))}`
}

export function normalizeLegacyInvoice(raw) {
  const camel = rowToCamel(raw)
  const tips = Number(camel.tips ?? camel.tip ?? 0)
  const services = Array.isArray(camel.services) ? camel.services : []
  const serviceIds = Array.isArray(camel.serviceIds)
    ? camel.serviceIds
    : (Array.isArray(camel.service_ids) ? camel.service_ids : services.map((s) => s.id).filter(Boolean))

  return {
    id: camel.id || buildInvoiceFingerprint(camel),
    date: camel.date ?? '',
    invoiceTime: camel.invoiceTime ?? camel.invoice_time ?? '',
    branchId: camel.branchId ?? camel.branch_id ?? '',
    branchName: camel.branchName ?? camel.branch_name ?? '',
    employeeId: camel.employeeId ?? camel.employee_id ?? '',
    employeeName: camel.employeeName ?? camel.employee_name ?? '',
    supportEmployeeId: camel.supportEmployeeId ?? camel.support_employee_id ?? '',
    supportEmployeeName: camel.supportEmployeeName ?? camel.support_employee_name ?? '',
    customerName: camel.customerName ?? camel.customer_name ?? '',
    customerPhone: camel.customerPhone ?? camel.customer_phone ?? '',
    serviceIds,
    services,
    tips: Number.isFinite(tips) ? tips : 0,
    paymentMethod: camel.paymentMethod ?? camel.payment_method ?? 'cash',
    note: camel.note ?? '',
    serviceTotal: Number(camel.serviceTotal ?? camel.service_total ?? 0),
    total: Number(camel.total ?? 0),
    commission: Number(camel.commission ?? 0),
    createdAt: camel.createdAt ?? camel.created_at ?? new Date().toISOString(),
  }
}

function normalizeLegacyEmployee(raw) {
  const camel = rowToCamel(raw)
  return normalizeEmployee({
    ...camel,
    id: camel.id || buildEmployeeFingerprint(camel),
  })
}

function normalizeLegacyExpense(raw) {
  const camel = rowToCamel(raw)
  return normalizeExpense({
    ...camel,
    id: camel.id || buildExpenseFingerprint(camel),
  })
}

function normalizeLegacyBranch(raw) {
  const camel = rowToCamel(raw)
  return normalizeBranch({ ...camel, id: camel.id })
}

function normalizeLegacyService(raw) {
  const camel = rowToCamel(raw)
  return normalizeService({ ...camel, id: camel.id })
}

function looksLikeEmployee(item) {
  if (!item || typeof item !== 'object') return false
  return Boolean(pickField(item, 'name') && pickField(item, 'branchId', 'branch_id'))
}

function looksLikeInvoice(item) {
  if (!item || typeof item !== 'object') return false
  const date = pickField(item, 'date')
  const branch = pickField(item, 'branchId', 'branch_id')
  const hasMoney = item.total != null || item.serviceTotal != null || item.service_total != null
  const hasServices =
    (Array.isArray(item.services) && item.services.length > 0)
    || (Array.isArray(item.serviceIds) && item.serviceIds.length > 0)
    || (Array.isArray(item.service_ids) && item.service_ids.length > 0)
  return Boolean(date && branch && (hasMoney || hasServices))
}

function looksLikeExpense(item) {
  if (!item || typeof item !== 'object') return false
  return Boolean(pickField(item, 'date') && item.amount != null)
}

function looksLikeService(item) {
  if (!item || typeof item !== 'object') return false
  return Boolean(pickField(item, 'name') && (item.priceLists || item.price_lists))
}

function looksLikeBranch(item) {
  if (!item || typeof item !== 'object') return false
  return Boolean(item.id && pickField(item, 'name'))
}

function looksLikeBranchPricingMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return Object.entries(obj).some(([, value]) => {
    if (!value || typeof value !== 'object') return false
    return 'useCustom' in value || 'use_custom' in value || 'overrides' in value
  })
}

function classifyArray(key, array) {
  if (!Array.isArray(array) || array.length === 0) return null
  const sample = array.find((item) => item && typeof item === 'object')
  if (!sample) return null

  if (looksLikeInvoice(sample)) return { type: 'invoices', items: array }
  if (looksLikeEmployee(sample)) return { type: 'employees', items: array }
  if (looksLikeExpense(sample)) return { type: 'expenses', items: array }
  if (looksLikeService(sample)) return { type: 'services', items: array }
  if (looksLikeBranch(sample)) return { type: 'branches', items: array }

  const keyLower = key.toLowerCase()
  for (const [type, hints] of Object.entries(KNOWN_KEY_HINTS)) {
    if (hints.some((hint) => keyLower.includes(hint))) {
      if (['invoices', 'employees', 'expenses', 'services', 'branches'].includes(type)) {
        return { type, items: array }
      }
    }
  }
  return null
}

function mergeUniqueById(targetList, incomingList, normalizeFn) {
  const map = new Map()
  for (const item of targetList) {
    if (item?.id) map.set(item.id, item)
  }
  for (const raw of incomingList) {
    try {
      const normalized = normalizeFn(raw)
      if (normalized?.id) map.set(normalized.id, normalized)
    } catch {
      // bỏ qua bản ghi lỗi khi quét
    }
  }
  return [...map.values()]
}

function mergeBranchPricing(target, incoming) {
  const next = { ...target }
  for (const [branchId, record] of Object.entries(incoming ?? {})) {
    const camel = rowToCamel(record)
    next[branchId] = {
      useCustom: Boolean(camel.useCustom ?? camel.use_custom),
      overrides: camel.overrides ?? {},
    }
  }
  return next
}

function extractFromObject(key, data, bucket) {
  if (!data || typeof data !== 'object') return

  if (Array.isArray(data.invoices)) {
    bucket.invoices = mergeUniqueById(bucket.invoices, data.invoices, normalizeLegacyInvoice)
  }
  if (Array.isArray(data.tours)) {
    bucket.invoices = mergeUniqueById(bucket.invoices, data.tours, normalizeLegacyInvoice)
  }
  if (Array.isArray(data.employees)) {
    bucket.employees = mergeUniqueById(bucket.employees, data.employees, normalizeLegacyEmployee)
  }
  if (Array.isArray(data.expenses)) {
    bucket.expenses = mergeUniqueById(bucket.expenses, data.expenses, normalizeLegacyExpense)
  }
  if (Array.isArray(data.services)) {
    bucket.services = mergeUniqueById(bucket.services, data.services, normalizeLegacyService)
  }
  if (Array.isArray(data.branches)) {
    bucket.branches = mergeUniqueById(bucket.branches, data.branches, normalizeLegacyBranch)
  }
  if (data.branchPricing && typeof data.branchPricing === 'object') {
    bucket.branchPricing = mergeBranchPricing(bucket.branchPricing, data.branchPricing)
  }
  if (data.systemSettings && typeof data.systemSettings === 'object') {
    bucket.systemSettings = data.systemSettings
  }
  if (data.permissions && typeof data.permissions === 'object') {
    bucket.permissions = data.permissions
  }
  if (data.credentials && typeof data.credentials === 'object') {
    bucket.credentials = data.credentials
  }

  if (Array.isArray(data)) {
    const classified = classifyArray(key, data)
    if (!classified) return
    if (classified.type === 'invoices') {
      bucket.invoices = mergeUniqueById(bucket.invoices, classified.items, normalizeLegacyInvoice)
    } else if (classified.type === 'employees') {
      bucket.employees = mergeUniqueById(bucket.employees, classified.items, normalizeLegacyEmployee)
    } else if (classified.type === 'expenses') {
      bucket.expenses = mergeUniqueById(bucket.expenses, classified.items, normalizeLegacyExpense)
    } else if (classified.type === 'services') {
      bucket.services = mergeUniqueById(bucket.services, classified.items, normalizeLegacyService)
    } else if (classified.type === 'branches') {
      bucket.branches = mergeUniqueById(bucket.branches, classified.items, normalizeLegacyBranch)
    }
    return
  }

  if (looksLikeBranchPricingMap(data)) {
    bucket.branchPricing = mergeBranchPricing(bucket.branchPricing, data)
  }

  for (const [childKey, childValue] of Object.entries(data)) {
    if (!Array.isArray(childValue)) continue
    const classified = classifyArray(`${key}.${childKey}`, childValue)
    if (!classified) continue
    if (classified.type === 'invoices') {
      bucket.invoices = mergeUniqueById(bucket.invoices, classified.items, normalizeLegacyInvoice)
    } else if (classified.type === 'employees') {
      bucket.employees = mergeUniqueById(bucket.employees, classified.items, normalizeLegacyEmployee)
    } else if (classified.type === 'expenses') {
      bucket.expenses = mergeUniqueById(bucket.expenses, classified.items, normalizeLegacyExpense)
    } else if (classified.type === 'services') {
      bucket.services = mergeUniqueById(bucket.services, classified.items, normalizeLegacyService)
    } else if (classified.type === 'branches') {
      bucket.branches = mergeUniqueById(bucket.branches, classified.items, normalizeLegacyBranch)
    }
  }
}

export function listAllLocalStorageKeys(storage = localStorage) {
  const keys = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key) keys.push(key)
  }
  return keys.sort()
}

export function scanLocalStorageForLegacyData({ jsonPayload = null, storage = localStorage } = {}) {
  const bucket = {
    branches: [],
    employees: [],
    invoices: [],
    expenses: [],
    services: [],
    branchPricing: {},
    systemSettings: null,
    permissions: null,
    credentials: null,
  }

  const keyReports = []

  const ingestKey = (key, rawValue) => {
    if (rawValue == null || rawValue === '') {
      keyReports.push({ key, hasData: false, byteSize: 0, detectedTypes: [], parseError: null })
      return
    }

    try {
      const parsed = JSON.parse(rawValue)
      const before = snapshotCounts(bucket)
      extractFromObject(key, parsed, bucket)
      const after = snapshotCounts(bucket)
      const detectedTypes = Object.entries(after)
        .filter(([name, count]) => count > (before[name] ?? 0))
        .map(([name]) => name)

      keyReports.push({
        key,
        hasData: true,
        byteSize: rawValue.length,
        detectedTypes,
        parseError: null,
      })
    } catch (error) {
      keyReports.push({
        key,
        hasData: rawValue.length > 0,
        byteSize: rawValue.length,
        detectedTypes: [],
        parseError: error?.message ?? 'Không parse được JSON',
      })
    }
  }

  for (const key of listAllLocalStorageKeys(storage)) {
    if (shouldSkipStorageKey(key)) continue
    ingestKey(key, storage.getItem(key))
  }

  if (jsonPayload) {
    if (jsonPayload.raw && typeof jsonPayload.raw === 'object') {
      for (const [rawKey, rawValue] of Object.entries(jsonPayload.raw)) {
        extractFromObject(`(file:${rawKey})`, rawValue, bucket)
      }
    }
    const before = snapshotCounts(bucket)
    extractFromObject('(uploaded-json)', jsonPayload, bucket)
    const after = snapshotCounts(bucket)
    keyReports.push({
      key: '(uploaded-json)',
      hasData: true,
      byteSize: JSON.stringify(jsonPayload).length,
      detectedTypes: Object.entries(after)
        .filter(([name, count]) => count > (before[name] ?? 0))
        .map(([name]) => name),
      parseError: null,
    })
  }

  const counts = snapshotCounts(bucket)
  const totalRecords =
    counts.employees +
    counts.invoices +
    counts.expenses +
    counts.services +
    counts.branches +
    counts.branchPricing +
    counts.systemSettings +
    counts.permissions +
    counts.credentials

  return {
    totalKeys: listAllLocalStorageKeys(storage).length,
    scannedKeys: keyReports.length,
    keyReports,
    snapshot: bucket,
    counts,
    hasLegacyData: totalRecords > 0,
    totalRecords,
  }
}

function snapshotCounts(bucket) {
  return {
    employees: bucket.employees.length,
    invoices: bucket.invoices.length,
    expenses: bucket.expenses.length,
    services: bucket.services.length,
    branches: bucket.branches.length,
    branchPricing: Object.keys(bucket.branchPricing ?? {}).length,
    systemSettings: bucket.systemSettings ? 1 : 0,
    permissions: bucket.permissions ? 1 : 0,
    credentials: bucket.credentials ? 1 : 0,
  }
}

export function exportLegacyScanRaw(storage = localStorage) {
  const keys = listAllLocalStorageKeys(storage).filter((key) => !shouldSkipStorageKey(key))
  const raw = {}
  for (const key of keys) {
    const value = storage.getItem(key)
    if (!value) continue
    try {
      raw[key] = JSON.parse(value)
    } catch {
      raw[key] = value
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    source: 'legacy-localStorage-export',
    keys: keys.length,
    raw,
    scan: scanLocalStorageForLegacyData({ storage }),
  }
}

export function downloadLegacyExport(storage = localStorage) {
  const payload = exportLegacyScanRaw(storage)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `spa-manager-du-lieu-cu-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  return payload
}

export function isLegacyImportCompleted(storage = localStorage) {
  return storage.getItem(LEGACY_IMPORT_COMPLETED_KEY) === 'true'
}

export function markLegacyImportCompleted(report, storage = localStorage) {
  storage.setItem(LEGACY_IMPORT_COMPLETED_KEY, 'true')
  const logs = loadLegacyImportLogs(storage)
  logs.unshift({ at: new Date().toISOString(), ...report })
  storage.setItem(LEGACY_IMPORT_LOG_KEY, JSON.stringify(logs.slice(0, 20)))
}

export function loadLegacyImportLogs(storage = localStorage) {
  try {
    const raw = storage.getItem(LEGACY_IMPORT_LOG_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
