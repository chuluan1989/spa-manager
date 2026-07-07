import { isSupabaseConfigured } from '../lib/supabaseClient'
import { ROLES } from '../constants/roles'
import { pullAllFromSupabase } from './supabaseSync'
import { notifyDataSynced } from './dataSyncEvents'
import {
  markLegacyImportCompleted,
  scanLocalStorageForLegacyData,
} from './legacyStorageScanner'

import { fetchBranches, upsertBranches } from '../repositories/branchesRepository'
import { fetchEmployees, upsertEmployees } from '../repositories/employeesRepository'
import { fetchInvoices, upsertInvoices } from '../repositories/invoicesRepository'
import { fetchExpenses, upsertExpenses } from '../repositories/expensesRepository'
import { fetchServices, upsertServices } from '../repositories/servicesRepository'
import {
  fetchBranchPricingMap,
  upsertBranchPricingMap,
} from '../repositories/branchPricingRepository'
import { upsertCredentials } from '../repositories/credentialsRepository'
import { upsertPermissions } from '../repositories/permissionsRepository'
import { upsertSettings } from '../repositories/settingsRepository'

function emptySnapshot() {
  return {
    branches: [],
    services: [],
    branchPricing: {},
    employees: [],
    invoices: [],
    expenses: [],
    includeAuth: false,
  }
}

export function scopeLegacySnapshot(snapshot, user) {
  if (!user?.role) return emptySnapshot()

  if (user.role === ROLES.ADMIN) {
    return {
      branches: snapshot.branches ?? [],
      services: snapshot.services ?? [],
      branchPricing: snapshot.branchPricing ?? {},
      employees: snapshot.employees ?? [],
      invoices: snapshot.invoices ?? [],
      expenses: snapshot.expenses ?? [],
      includeAuth: true,
      credentials: snapshot.credentials,
      permissions: snapshot.permissions,
      systemSettings: snapshot.systemSettings,
    }
  }

  if (user.role === ROLES.BRANCH_MANAGER) {
    const branchId = user.branch ?? ''
    const branchPricing = {}
    if (branchId && snapshot.branchPricing?.[branchId]) {
      branchPricing[branchId] = snapshot.branchPricing[branchId]
    }
    return {
      branches: [],
      services: [],
      branchPricing,
      employees: (snapshot.employees ?? []).filter((item) => item.branchId === branchId),
      invoices: (snapshot.invoices ?? []).filter((item) => item.branchId === branchId),
      expenses: (snapshot.expenses ?? []).filter((item) => item.branchId === branchId),
      includeAuth: false,
    }
  }

  const employeeId = user.employeeId ?? ''
  return {
    branches: [],
    services: [],
    branchPricing: {},
    employees: (snapshot.employees ?? []).filter((item) => item.id === employeeId),
    invoices: (snapshot.invoices ?? []).filter((item) => item.employeeId === employeeId),
    expenses: [],
    includeAuth: false,
  }
}

function toIdSet(items, getId = (item) => item?.id) {
  const set = new Set()
  for (const item of items ?? []) {
    const id = getId(item)
    if (id) set.add(id)
  }
  return set
}

function toBranchIdSet(map) {
  return new Set(Object.keys(map ?? {}))
}

async function fetchRemoteIdSets() {
  const [branches, employees, services, invoices, expenses, branchPricing] = await Promise.all([
    fetchBranches(),
    fetchEmployees(),
    fetchServices(),
    fetchInvoices(),
    fetchExpenses(),
    fetchBranchPricingMap(),
  ])

  return {
    branches: toIdSet(branches),
    employees: toIdSet(employees),
    services: toIdSet(services),
    invoices: toIdSet(invoices),
    expenses: toIdSet(expenses),
    branchPricing: toBranchIdSet(branchPricing),
  }
}

function partitionByRemote(scoped, remoteIds) {
  const pick = (items, remoteSet) => {
    const toImport = []
    let skipped = 0
    for (const item of items ?? []) {
      if (!item?.id) continue
      if (remoteSet.has(item.id)) {
        skipped += 1
      } else {
        toImport.push(item)
      }
    }
    return { toImport, skipped }
  }

  const branchPricingKeys = Object.keys(scoped.branchPricing ?? {})
  const branchPricingToImport = {}
  let branchPricingSkipped = 0
  for (const branchId of branchPricingKeys) {
    if (remoteIds.branchPricing.has(branchId)) {
      branchPricingSkipped += 1
    } else {
      branchPricingToImport[branchId] = scoped.branchPricing[branchId]
    }
  }

  const branches = pick(scoped.branches, remoteIds.branches)
  const employees = pick(scoped.employees, remoteIds.employees)
  const services = pick(scoped.services, remoteIds.services)
  const invoices = pick(scoped.invoices, remoteIds.invoices)
  const expenses = pick(scoped.expenses, remoteIds.expenses)

  return {
    payload: {
      ...scoped,
      branches: branches.toImport,
      employees: employees.toImport,
      services: services.toImport,
      invoices: invoices.toImport,
      expenses: expenses.toImport,
      branchPricing: branchPricingToImport,
    },
    skipped: {
      branches: branches.skipped,
      employees: employees.skipped,
      services: services.skipped,
      invoices: invoices.skipped,
      expenses: expenses.skipped,
      branchPricing: branchPricingSkipped,
    },
  }
}

/** Chỉ quét localStorage — không ghi Supabase. */
export function checkLegacyData(user, { jsonPayload = null } = {}) {
  const scan = scanLocalStorageForLegacyData({ jsonPayload })
  const scoped = scopeLegacySnapshot(scan.snapshot, user)

  const scopedCounts = {
    employees: scoped.employees.length,
    invoices: scoped.invoices.length,
    expenses: scoped.expenses.length,
    services: scoped.services.length,
    branches: scoped.branches.length,
    branchPricing: Object.keys(scoped.branchPricing ?? {}).length,
    systemSettings: scoped.systemSettings ? 1 : 0,
    permissions: scoped.permissions ? 1 : 0,
    credentials: scoped.credentials ? 1 : 0,
  }
  const scopedTotal =
    scopedCounts.employees +
    scopedCounts.invoices +
    scopedCounts.expenses +
    scopedCounts.services +
    scopedCounts.branches +
    scopedCounts.branchPricing

  return {
    scan,
    scopedCounts,
    hasLegacyData: scopedTotal > 0,
  }
}

async function importEntityBatch(name, items, upsertFn) {
  if (!items?.length) {
    return { imported: 0, skipped: 0, errors: [] }
  }
  try {
    await upsertFn(items)
    return { imported: items.length, skipped: 0, errors: [] }
  } catch (error) {
    return {
      imported: 0,
      skipped: 0,
      errors: [{ entity: name, message: error?.message ?? String(error), count: items.length }],
    }
  }
}

async function pushImportPayload(payload) {
  const results = {}
  const errors = []

  const listSteps = [
    ['branches', payload.branches, upsertBranches],
    ['services', payload.services, upsertServices],
    ['employees', payload.employees, upsertEmployees],
    ['invoices', payload.invoices, upsertInvoices],
    ['expenses', payload.expenses, upsertExpenses],
  ]

  for (const [name, items, fn] of listSteps) {
    if (!items?.length) {
      results[name] = { imported: 0 }
      continue
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await importEntityBatch(name, items, fn)
    results[name] = { imported: result.imported }
    if (result.errors.length) errors.push(...result.errors)
  }

  const pricingKeys = Object.keys(payload.branchPricing ?? {})
  if (pricingKeys.length > 0) {
    try {
      await upsertBranchPricingMap(payload.branchPricing)
      results.branchPricing = { imported: pricingKeys.length }
    } catch (error) {
      errors.push({
        entity: 'branchPricing',
        message: error?.message ?? String(error),
        count: pricingKeys.length,
      })
      results.branchPricing = { imported: 0 }
    }
  } else {
    results.branchPricing = { imported: 0 }
  }

  if (payload.includeAuth) {
    if (payload.credentials) {
      try {
        await upsertCredentials(payload.credentials)
        results.credentials = { imported: 1, skipped: 0 }
      } catch (error) {
        errors.push({ entity: 'credentials', message: error?.message ?? String(error), count: 1 })
      }
    }
    if (payload.permissions) {
      try {
        await upsertPermissions(payload.permissions)
        results.permissions = { imported: 1, skipped: 0 }
      } catch (error) {
        errors.push({ entity: 'permissions', message: error?.message ?? String(error), count: 1 })
      }
    }
    if (payload.systemSettings) {
      try {
        await upsertSettings(payload.systemSettings)
        results.settings = { imported: 1, skipped: 0 }
      } catch (error) {
        errors.push({ entity: 'settings', message: error?.message ?? String(error), count: 1 })
      }
    }
  }

  return { results, errors }
}

/**
 * Import dữ liệu cũ lên Supabase.
 * Không xóa localStorage — chỉ đánh dấu legacy_import_completed và ghi log.
 */
export async function importLegacyDataToCloud(user, { jsonPayload = null } = {}) {
  if (!isSupabaseConfigured) {
    return { success: false, reason: 'not_configured' }
  }
  if (!user?.role) {
    return { success: false, reason: 'not_logged_in' }
  }

  const scan = scanLocalStorageForLegacyData({ jsonPayload })
  const scopedFull = scopeLegacySnapshot(scan.snapshot, user)

  const detected = {
    employees: scopedFull.employees.length,
    invoices: scopedFull.invoices.length,
    expenses: scopedFull.expenses.length,
    services: scopedFull.services.length,
    branches: scopedFull.branches.length,
    branchPricing: Object.keys(scopedFull.branchPricing ?? {}).length,
    total:
      scopedFull.employees.length +
      scopedFull.invoices.length +
      scopedFull.expenses.length +
      scopedFull.services.length +
      scopedFull.branches.length +
      Object.keys(scopedFull.branchPricing ?? {}).length,
  }

  if (detected.total === 0) {
    return {
      success: true,
      empty: true,
      message: 'Không tìm thấy dữ liệu cũ trên thiết bị này.',
      scan,
      detected,
      imported: {},
      skipped: {},
      errorCount: 0,
      errors: [],
    }
  }

  const remoteIds = await fetchRemoteIdSets()
  const { payload, skipped } = partitionByRemote(scopedFull, remoteIds)
  const { results, errors } = await pushImportPayload(payload)

  const imported = {
    branches: results.branches?.imported ?? 0,
    services: results.services?.imported ?? 0,
    branchPricing: results.branchPricing?.imported ?? 0,
    employees: results.employees?.imported ?? 0,
    invoices: results.invoices?.imported ?? 0,
    expenses: results.expenses?.imported ?? 0,
    credentials: results.credentials?.imported ?? 0,
    permissions: results.permissions?.imported ?? 0,
    settings: results.settings?.imported ?? 0,
  }

  const skippedTotal =
    skipped.branches +
    skipped.employees +
    skipped.services +
    skipped.invoices +
    skipped.expenses +
    skipped.branchPricing

  const importedTotal = Object.values(imported).reduce((sum, n) => sum + n, 0)

  if (errors.length === 0) {
    markLegacyImportCompleted({
      detected,
      imported,
      skipped,
      importedTotal,
      skippedTotal,
      errorCount: 0,
      role: user.role,
    })
    await pullAllFromSupabase()
    notifyDataSynced(['employees', 'invoices', 'expenses', 'services', 'branches'])
  }

  return {
    success: errors.length === 0,
    scan,
    detected,
    imported,
    skipped,
    skippedTotal,
    importedTotal,
    errorCount: errors.length,
    errors,
  }
}

/** @deprecated Dùng checkLegacyData / importLegacyDataToCloud */
export async function detectPendingLegacyData(user) {
  const result = checkLegacyData(user)
  return {
    hasPending: result.hasLegacyData,
    totals: result.scopedCounts,
    error: null,
  }
}

/** @deprecated Dùng importLegacyDataToCloud */
export async function syncLegacyDataToCloud(user) {
  return importLegacyDataToCloud(user)
}

export function shouldShowLegacySyncBanner() {
  return false
}

export { scanLocalStorageForLegacyData, downloadLegacyExport } from './legacyStorageScanner'
