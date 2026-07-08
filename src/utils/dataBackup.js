import { loadBranches } from './branchStorage'
import { loadBranchPricingMap } from './branchPricingStorage'
import { loadCommissionPolicyMap } from './commissionPolicyStorage'
import { loadEmployees } from './employeeStorage'
import { loadCredentials } from './credentialsStorage'
import { loadExpenses } from './expenseStorage'
import { loadInvoices } from './invoiceStorage'
import { collectPermissionsSnapshot, applyPermissionsSnapshot } from './permissionsStorage'
import { loadAccountMetadata } from './accountMetadataStorage'
import { loadServices } from './serviceStorage'
import { loadSystemSettings } from './systemSettingsStorage'

const BACKUP_BEFORE_IMPORT_KEY = 'spa-manager-pre-import-backup'

export function collectAllData() {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    invoices: loadInvoices(),
    expenses: loadExpenses(),
    employees: loadEmployees(),
    services: loadServices(),
    branches: loadBranches(),
    branchPricing: loadBranchPricingMap(),
    commissionPolicies: loadCommissionPolicyMap(),
    credentials: loadCredentials(),
    permissions: collectPermissionsSnapshot(),
    accountMetadata: loadAccountMetadata(),
    systemSettings: loadSystemSettings(),
  }
}

export function exportAllData() {
  const data = collectAllData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `spa-manager-backup-${date}.json`
  link.click()
  URL.revokeObjectURL(url)
  return data
}

export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'File JSON không hợp lệ' }
  }
  if (!Array.isArray(payload.invoices)) {
    return { ok: false, error: 'Thiếu hoặc sai định dạng invoices' }
  }
  if (!Array.isArray(payload.expenses)) {
    return { ok: false, error: 'Thiếu hoặc sai định dạng expenses' }
  }
  return { ok: true }
}

export function importAllData(payload, { skipBackup = false } = {}) {
  const validation = validateImportPayload(payload)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  if (!skipBackup) {
    localStorage.setItem(BACKUP_BEFORE_IMPORT_KEY, JSON.stringify(collectAllData()))
  }

  const setJson = (key, value) => {
    if (value !== undefined) {
      localStorage.setItem(key, JSON.stringify(value))
    }
  }

  setJson('spa-manager-invoices', payload.invoices ?? [])
  setJson('spa-manager-expenses', payload.expenses ?? [])
  if (payload.employees) setJson('spa-manager-employees', payload.employees)
  if (payload.services) setJson('spa-manager-services', payload.services)
  if (payload.branches) setJson('spa-manager-branches', payload.branches)
  setJson('spa-manager-branch-pricing', payload.branchPricing ?? {})
  setJson('spa-manager-commission-policies', payload.commissionPolicies ?? {})
  if (payload.credentials) setJson('spa-manager-credentials', payload.credentials)
  if (payload.permissions) {
    if (payload.permissions.global || payload.permissions.branch || payload.permissions.employee) {
      applyPermissionsSnapshot(payload.permissions)
    } else {
      setJson('spa-manager-permissions', payload.permissions)
    }
  }
  if (payload.accountMetadata) setJson('spa-manager-account-metadata', payload.accountMetadata)
  if (payload.systemSettings) setJson('spa-manager-system-settings', payload.systemSettings)

  if (payload.services) {
    localStorage.setItem('spa-manager-services-version', '2')
  }

  return true
}

export function restorePreImportBackup() {
  const raw = localStorage.getItem(BACKUP_BEFORE_IMPORT_KEY)
  if (!raw) return false
  importAllData(JSON.parse(raw), { skipBackup: true })
  return true
}

export function getClearDemoDataSummary() {
  return {
    removed: ['Tất cả hóa đơn', 'Tất cả chi phí', 'Danh sách nhân viên (reset về mặc định)'],
    kept: [
      'Chi nhánh & mật khẩu quản lý',
      'Catalog dịch vụ & bảng giá nhóm',
      'Bảng giá riêng từng chi nhánh',
      'Tài khoản, phân quyền & cài đặt hệ thống',
    ],
  }
}

export function clearDemoData() {
  localStorage.setItem('spa-manager-invoices', JSON.stringify([]))
  localStorage.setItem('spa-manager-expenses', JSON.stringify([]))
  localStorage.removeItem('spa-manager-employees')
  loadEmployees()
  return { success: true, summary: getClearDemoDataSummary() }
}

export function createBackupSnapshot() {
  return collectAllData()
}

export function restoreFromSnapshot(snapshot) {
  return importAllData(snapshot, { skipBackup: true })
}
