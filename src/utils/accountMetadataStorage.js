import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertAccountMetadata } from '../repositories/accountMetadataRepository'
import { ADMIN_BRANCH } from '../constants/roles'
import { loadBranches } from './branchStorage'

const STORAGE_KEY = 'spa-manager-account-metadata'

function pushToSupabase(payload) {
  if (!isSupabaseConfigured) return
  upsertAccountMetadata(payload).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ metadata tài khoản:', error?.message)
  })
}

function defaultAccountMeta() {
  return {
    locked: false,
    lastLogin: null,
    assignedRole: null,
  }
}

function buildDefaultMetadata() {
  const meta = {
    admin: defaultAccountMeta(),
  }
  for (const branch of loadBranches()) {
    meta[branch.id] = defaultAccountMeta()
  }
  return meta
}

export function loadAccountMetadata() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults = buildDefaultMetadata()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    const data = JSON.parse(raw)
    const merged = buildDefaultMetadata()
    return { ...merged, ...data }
  } catch {
    return buildDefaultMetadata()
  }
}

export function saveAccountMetadata(metadata, { skipRemoteSync = false } = {}) {
  const normalized = { ...loadAccountMetadata(), ...metadata }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushToSupabase(normalized)
  return normalized
}

export function getAccountMeta(accountKey) {
  return loadAccountMetadata()[accountKey] ?? defaultAccountMeta()
}

export function setAccountLocked(accountKey, locked) {
  const metadata = loadAccountMetadata()
  metadata[accountKey] = { ...defaultAccountMeta(), ...metadata[accountKey], locked: Boolean(locked) }
  return saveAccountMetadata(metadata)
}

export function recordAccountLogin(accountKey) {
  const metadata = loadAccountMetadata()
  metadata[accountKey] = {
    ...defaultAccountMeta(),
    ...metadata[accountKey],
    lastLogin: new Date().toISOString(),
  }
  return saveAccountMetadata(metadata)
}

export function formatLastLogin(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('vi-VN')
  } catch {
    return '—'
  }
}

export function getBranchManagerAssignments() {
  const metadata = loadAccountMetadata()
  const assignments = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (key !== 'admin' && value?.managerName) {
      assignments[key] = value.managerName
    }
  }
  return assignments
}

export function assignBranchManager(branchId, managerName) {
  const metadata = loadAccountMetadata()
  metadata[branchId] = {
    ...defaultAccountMeta(),
    ...metadata[branchId],
    managerName: managerName?.trim() ?? '',
  }
  return saveAccountMetadata(metadata)
}

export function getAccountKeyForUser(user) {
  if (!user) return null
  if (user.role === 'admin') return 'admin'
  if (user.branch && user.branch !== ADMIN_BRANCH) return user.branch
  return null
}

export function isAccountLocked(accountKey) {
  return Boolean(getAccountMeta(accountKey).locked)
}

export function getEmployeeAccountKey(employeeId) {
  return `employee:${employeeId}`
}

export function isEmployeeAccountLocked(employeeId) {
  if (!employeeId) return false
  return isAccountLocked(getEmployeeAccountKey(employeeId))
}

export function setEmployeeAccountLocked(employeeId, locked) {
  if (!employeeId) return loadAccountMetadata()
  return setAccountLocked(getEmployeeAccountKey(employeeId), locked)
}

export function removeAccountMetadataEntry(accountKey) {
  const metadata = loadAccountMetadata()
  if (!metadata[accountKey]) return metadata
  const { [accountKey]: _removed, ...rest } = metadata
  return saveAccountMetadata(rest)
}
