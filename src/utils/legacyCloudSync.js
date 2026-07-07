import { isSupabaseConfigured } from '../lib/supabaseClient'
import { ROLES } from '../constants/roles'
import { collectAllData } from './dataBackup'
import { pullAllFromSupabase } from './supabaseSync'

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

const LEGACY_SYNC_FLAG_PREFIX = 'spa-manager-legacy-cloud-sync-v1:'

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

/** Khóa theo tài khoản đăng nhập trên thiết bị này (admin / QL chi nhánh / NV). */
export function getLegacySyncUserKey(user) {
  if (!user?.role) return ''
  if (user.role === ROLES.EMPLOYEE) {
    return `employee:${user.branch}:${user.employeeId ?? ''}`
  }
  if (user.role === ROLES.BRANCH_MANAGER) {
    return `manager:${user.branch ?? ''}`
  }
  return 'admin'
}

function getLegacySyncFlagKey(user) {
  return `${LEGACY_SYNC_FLAG_PREFIX}${getLegacySyncUserKey(user)}`
}

export function hasUserCompletedLegacySync(user) {
  try {
    return localStorage.getItem(getLegacySyncFlagKey(user)) === 'done'
  } catch {
    return false
  }
}

export function markLegacySyncComplete(user) {
  try {
    localStorage.setItem(getLegacySyncFlagKey(user), 'done')
  } catch {
    // bỏ qua
  }
}

/** Lọc dữ liệu LocalStorage theo phạm vi tài khoản trước khi đẩy lên Cloud. */
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

/** Đếm bản ghi local (theo phạm vi user) chưa có trên Supabase. */
export function countPendingLegacyItems(scoped, remoteIds) {
  const pendingEmployees = scoped.employees.filter((item) => !remoteIds.employees.has(item.id))
  const pendingInvoices = scoped.invoices.filter((item) => !remoteIds.invoices.has(item.id))
  const pendingExpenses = scoped.expenses.filter((item) => !remoteIds.expenses.has(item.id))
  const pendingServices = scoped.services.filter((item) => !remoteIds.services.has(item.id))
  const pendingBranches = scoped.branches.filter((item) => !remoteIds.branches.has(item.id))
  const pendingBranchPricing = Object.keys(scoped.branchPricing ?? {}).filter(
    (branchId) => !remoteIds.branchPricing.has(branchId),
  )

  const totals = {
    employees: pendingEmployees.length,
    invoices: pendingInvoices.length,
    expenses: pendingExpenses.length,
    services: pendingServices.length,
    branches: pendingBranches.length,
    branchPricing: pendingBranchPricing.length,
  }

  const totalCount =
    totals.employees +
    totals.invoices +
    totals.expenses +
    totals.services +
    totals.branches +
    totals.branchPricing

  return {
    ...totals,
    totalCount,
    hasPending: totalCount > 0,
    pendingEmployees,
    pendingInvoices,
    pendingExpenses,
    pendingServices,
    pendingBranches,
    pendingBranchPricing,
  }
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

/**
 * Kiểm tra xem thiết bị này còn dữ liệu cũ (LocalStorage) chưa có trên Supabase không.
 * Dùng để hiển thị banner "Đồng bộ dữ liệu cũ".
 */
export async function detectPendingLegacyData(user) {
  if (!isSupabaseConfigured || !user?.role) {
    return { hasPending: false, totals: null, error: null }
  }

  try {
    const snapshot = collectAllData()
    const scoped = scopeLegacySnapshot(snapshot, user)
    const remoteIds = await fetchRemoteIdSets()
    const pending = countPendingLegacyItems(scoped, remoteIds)

    return {
      hasPending: pending.hasPending,
      totals: {
        employees: pending.employees,
        invoices: pending.invoices,
        expenses: pending.expenses,
        services: pending.services,
        branches: pending.branches,
        branchPricing: pending.branchPricing,
        total: pending.totalCount,
      },
      error: null,
    }
  } catch (error) {
    return {
      hasPending: false,
      totals: null,
      error: error?.message ?? String(error),
    }
  }
}

export function shouldShowLegacySyncBanner(user, pendingResult) {
  if (!isSupabaseConfigured || !user?.role) return false
  if (!pendingResult || pendingResult.error) return false
  return Boolean(pendingResult.hasPending)
}

async function pushScopedLegacyPayload(scoped) {
  const errors = []
  const synced = {
    branches: 0,
    services: 0,
    branchPricing: 0,
    employees: 0,
    invoices: 0,
    expenses: 0,
  }

  const tasks = [
    {
      name: 'branches',
      count: scoped.branches.length,
      run: () => upsertBranches(scoped.branches),
    },
    {
      name: 'services',
      count: scoped.services.length,
      run: () => upsertServices(scoped.services),
    },
    {
      name: 'branchPricing',
      count: Object.keys(scoped.branchPricing ?? {}).length,
      run: () => upsertBranchPricingMap(scoped.branchPricing),
    },
    {
      name: 'employees',
      count: scoped.employees.length,
      run: () => upsertEmployees(scoped.employees),
    },
    {
      name: 'invoices',
      count: scoped.invoices.length,
      run: () => upsertInvoices(scoped.invoices),
    },
    {
      name: 'expenses',
      count: scoped.expenses.length,
      run: () => upsertExpenses(scoped.expenses),
    },
  ]

  if (scoped.includeAuth) {
    if (scoped.credentials) {
      tasks.push({
        name: 'credentials',
        count: 1,
        run: () => upsertCredentials(scoped.credentials),
      })
    }
    if (scoped.permissions) {
      tasks.push({
        name: 'permissions',
        count: 1,
        run: () => upsertPermissions(scoped.permissions),
      })
    }
    if (scoped.systemSettings) {
      tasks.push({
        name: 'settings',
        count: 1,
        run: () => upsertSettings(scoped.systemSettings),
      })
    }
  }

  for (const task of tasks) {
    if (task.count === 0) continue
    try {
      // eslint-disable-next-line no-await-in-loop
      await task.run()
      if (Object.prototype.hasOwnProperty.call(synced, task.name)) {
        synced[task.name] = task.count
      }
    } catch (error) {
      errors.push({ entity: task.name, message: error?.message ?? String(error) })
    }
  }

  return { synced, errors, errorCount: errors.length }
}

/**
 * Đẩy dữ liệu cũ từ LocalStorage lên Supabase (upsert theo id — không trùng).
 * Không xóa LocalStorage; chỉ đánh dấu hoàn tất khi toàn bộ bước thành công.
 */
export async function syncLegacyDataToCloud(user) {
  if (!isSupabaseConfigured) {
    return { success: false, reason: 'not_configured' }
  }
  if (!user?.role) {
    return { success: false, reason: 'not_logged_in' }
  }

  const snapshot = collectAllData()
  const remoteIds = await fetchRemoteIdSets()
  const scopedFull = scopeLegacySnapshot(snapshot, user)
  const pending = countPendingLegacyItems(scopedFull, remoteIds)

  const scoped = {
    ...scopedFull,
    branches: pending.pendingBranches,
    services: pending.pendingServices,
    branchPricing: Object.fromEntries(
      pending.pendingBranchPricing.map((branchId) => [branchId, scopedFull.branchPricing[branchId]]),
    ),
    employees: pending.pendingEmployees,
    invoices: pending.pendingInvoices,
    expenses: pending.pendingExpenses,
  }

  if (pending.totalCount === 0) {
    markLegacySyncComplete(user)
    return {
      success: true,
      skipped: true,
      synced: { employees: 0, invoices: 0, expenses: 0, services: 0, branches: 0, branchPricing: 0 },
      errorCount: 0,
      errors: [],
    }
  }

  const { synced, errors, errorCount } = await pushScopedLegacyPayload(scoped)

  if (errorCount > 0) {
    return {
      success: false,
      synced,
      errorCount,
      errors,
    }
  }

  markLegacySyncComplete(user)
  await pullAllFromSupabase()

  return {
    success: true,
    synced,
    errorCount: 0,
    errors: [],
  }
}
