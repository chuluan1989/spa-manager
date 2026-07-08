import {
  BRANCH_ID_MIGRATION,
  CANONICAL_BRANCHES,
  CANONICAL_BRANCH_IDS,
  DEPRECATED_BRANCH_IDS,
  getCanonicalBranchName,
  resolveCanonicalBranchId,
} from '../constants/canonicalBranches'
import { buildDefaultCommissionPolicyMap } from '../constants/defaultCommissionPolicies'
import { createBackupSnapshot } from './dataBackup'
import {
  loadBranchesRaw,
  normalizeBranch,
  saveBranches,
  sortBranchesForDisplay,
} from './branchStorage'
import { loadBranchPricingMap, saveBranchPricingMap } from './branchPricingStorage'
import { saveCommissionPolicyMap } from './commissionPolicyStorage'
import { loadCredentials, saveCredentials } from './credentialsStorage'
import { loadEmployees, saveEmployees } from './employeeStorage'
import { loadExpenses, saveExpenses } from './expenseStorage'
import { loadInvoices, replaceAllInvoices } from './invoiceStorage'
import {
  loadBranchCatalogsMap,
  loadBranchServicePricesV2,
  saveBranchCatalogsMap,
  saveBranchServicePricesV2,
} from './serviceCatalogV2Storage'

export const CANONICAL_REPAIR_BACKUP_KEY = 'spa-manager-canonical-repair-backup'

function isEmptyValue(value) {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/** Gộp map theo branch_id — ưu tiên dữ liệu đích, bổ sung key còn thiếu từ nguồn. */
function mergeBranchKeyedMap(target = {}, source = {}) {
  const result = { ...target }
  for (const [branchId, value] of Object.entries(source)) {
    const resolvedId = resolveCanonicalBranchId(branchId)
    if (DEPRECATED_BRANCH_IDS.includes(branchId)) {
      if (!result[resolvedId] || isEmptyValue(result[resolvedId])) {
        result[resolvedId] = value
      } else if (!isEmptyValue(value) && typeof value === 'object' && typeof result[resolvedId] === 'object') {
        result[resolvedId] = { ...value, ...result[resolvedId] }
      }
      continue
    }
    if (!result[resolvedId]) {
      result[resolvedId] = value
    }
  }
  for (const deprecatedId of DEPRECATED_BRANCH_IDS) {
    delete result[deprecatedId]
  }
  return result
}

function mergePriceRows(target = {}, source = {}) {
  const result = { ...target }
  for (const [durationId, row] of Object.entries(source)) {
    if (!result[durationId]) {
      result[durationId] = row
    }
  }
  return result
}

function mergeBranchServicePrices(prices = {}) {
  const merged = {}
  for (const [branchId, rows] of Object.entries(prices)) {
    const resolvedId = resolveCanonicalBranchId(branchId)
    merged[resolvedId] = mergePriceRows(merged[resolvedId], rows)
  }
  for (const deprecatedId of DEPRECATED_BRANCH_IDS) {
    delete merged[deprecatedId]
  }
  return merged
}

function buildCanonicalBranchList(existingById = {}) {
  return sortBranchesForDisplay(
    CANONICAL_BRANCHES.map((definition) => {
      const existing = existingById[definition.id]
      return normalizeBranch({
        id: definition.id,
        name: definition.name,
        address: existing?.address?.trim() || definition.address,
        hotline: existing?.hotline?.trim() || definition.phone,
        sortOrder: definition.sortOrder,
        priceGroupId: definition.priceGroupId,
        supportEnabled: definition.supportEnabled,
        status: existing?.status,
        updatedAt: existing?.updatedAt,
      })
    }),
  )
}

function repairEmployees() {
  let changed = false
  const employees = loadEmployees().map((employee) => {
    const nextBranchId = resolveCanonicalBranchId(employee.branchId)
    if (nextBranchId === employee.branchId) return employee
    changed = true
    return { ...employee, branchId: nextBranchId }
  })
  if (changed) {
    saveEmployees(employees, { skipRemoteSync: true })
  }
  return changed ? employees.length : 0
}

function repairInvoicesAndExpenses() {
  let invoiceChanges = 0
  const invoices = loadInvoices().map((invoice) => {
    if (!invoice.branchId) return invoice
    const nextBranchId = resolveCanonicalBranchId(invoice.branchId)
    const nextBranchName = getCanonicalBranchName(nextBranchId)
    if (nextBranchId === invoice.branchId && invoice.branchName === nextBranchName) return invoice
    invoiceChanges += 1
    return { ...invoice, branchId: nextBranchId, branchName: nextBranchName }
  })
  if (invoiceChanges > 0) {
    replaceAllInvoices(invoices)
  }

  let expenseChanges = 0
  const expenses = loadExpenses().map((expense) => {
    if (!expense.branchId) return expense
    const nextBranchId = resolveCanonicalBranchId(expense.branchId)
    const nextBranchName = getCanonicalBranchName(nextBranchId)
    if (nextBranchId === expense.branchId && expense.branchName === nextBranchName) return expense
    expenseChanges += 1
    return { ...expense, branchId: nextBranchId, branchName: nextBranchName }
  })
  if (expenseChanges > 0) {
    saveExpenses(expenses)
  }

  return { invoiceChanges, expenseChanges }
}

function repairPricingAndCatalogs() {
  const pricing = mergeBranchKeyedMap(loadBranchPricingMap())
  saveBranchPricingMap(pricing)

  const catalogs = mergeBranchKeyedMap(loadBranchCatalogsMap())
  saveBranchCatalogsMap(catalogs, { skipRemoteSync: true, notify: false })

  const prices = mergeBranchServicePrices(loadBranchServicePricesV2())
  saveBranchServicePricesV2(prices, { skipRemoteSync: true, notify: false })

  return {
    pricingBranches: Object.keys(pricing).length,
    catalogBranches: Object.keys(catalogs).length,
    priceBranches: Object.keys(prices).length,
  }
}

function repairCommissionPolicies() {
  const defaults = buildDefaultCommissionPolicyMap(CANONICAL_BRANCH_IDS)
  saveCommissionPolicyMap(defaults)
  return Object.keys(defaults).length
}

function repairCredentials() {
  const credentials = loadCredentials()
  let changed = false

  const branches = { ...credentials.branches }
  for (const definition of CANONICAL_BRANCHES) {
    const fromDeprecated = DEPRECATED_BRANCH_IDS
      .map((id) => branches[id])
      .find(Boolean)
    if (!branches[definition.id] && fromDeprecated) {
      branches[definition.id] = fromDeprecated
      changed = true
    }
    if (!branches[definition.id] && definition.managerPassword) {
      branches[definition.id] = definition.managerPassword
      changed = true
    }
  }
  for (const deprecatedId of DEPRECATED_BRANCH_IDS) {
    if (branches[deprecatedId]) {
      delete branches[deprecatedId]
      changed = true
    }
  }

  const employees = { ...credentials.employees }
  for (const [employeeId, entry] of Object.entries(employees)) {
    if (!entry) continue
    const nextBranchId = resolveCanonicalBranchId(entry.branchId)
    if (nextBranchId !== entry.branchId) {
      employees[employeeId] = { ...entry, branchId: nextBranchId }
      changed = true
    }
  }

  if (changed) {
    saveCredentials({ ...credentials, branches, employees }, { skipRemoteSync: true })
  }
  return changed
}

/**
 * Sửa mapping dữ liệu gốc theo 8 chi nhánh chuẩn.
 * - Backup trước khi sửa
 * - Chỉ cập nhật branch_id / branchName — không ghi đè hồ sơ nhân viên
 * - Gộp bảng giá/catalog từ chi nhánh lỗi (gia-lai-3) sang gia-lai-2
 */
export function repairCanonicalBranchMapping() {
  localStorage.setItem(
    CANONICAL_REPAIR_BACKUP_KEY,
    JSON.stringify(createBackupSnapshot()),
  )

  const existingById = Object.fromEntries(loadBranchesRaw().map((branch) => [branch.id, branch]))
  for (const deprecatedId of DEPRECATED_BRANCH_IDS) {
    const targetId = BRANCH_ID_MIGRATION[deprecatedId]
    if (existingById[deprecatedId] && !existingById[targetId]?.address?.trim()) {
      existingById[targetId] = {
        ...existingById[targetId],
        address: existingById[deprecatedId].address,
        hotline: existingById[deprecatedId].hotline,
      }
    }
  }

  saveBranches(buildCanonicalBranchList(existingById), { skipRemoteSync: true })

  const summary = {
    employeesUpdated: repairEmployees(),
    ...repairInvoicesAndExpenses(),
    pricing: repairPricingAndCatalogs(),
    commissionPolicies: repairCommissionPolicies(),
    credentialsUpdated: repairCredentials(),
    branchCount: CANONICAL_BRANCH_IDS.length,
  }

  return summary
}

/** Kiểm tra mapping — trả về danh sách lỗi nếu có. */
export function auditCanonicalBranchMapping() {
  const issues = []
  const branchIds = new Set(loadBranchesRaw().map((branch) => branch.id))

  if (branchIds.size !== CANONICAL_BRANCH_IDS.length) {
    issues.push({ type: 'branch_count', expected: 8, actual: branchIds.size })
  }
  for (const deprecatedId of DEPRECATED_BRANCH_IDS) {
    if (branchIds.has(deprecatedId)) {
      issues.push({ type: 'deprecated_branch', branchId: deprecatedId })
    }
  }
  for (const branchId of CANONICAL_BRANCH_IDS) {
    if (!branchIds.has(branchId)) {
      issues.push({ type: 'missing_branch', branchId })
    }
  }

  for (const employee of loadEmployees()) {
    if (employee.branchId && DEPRECATED_BRANCH_IDS.includes(employee.branchId)) {
      issues.push({ type: 'employee_wrong_branch', id: employee.id, branchId: employee.branchId })
    }
  }

  return { valid: issues.length === 0, issues }
}
