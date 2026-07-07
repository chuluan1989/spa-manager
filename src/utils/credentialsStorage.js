import { ADMIN_BRANCH } from '../constants/roles'
import { loadBranches } from './branchStorage'
import { hashPassword, isPasswordHash, verifyPassword } from './passwordHash'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertCredentials } from '../repositories/credentialsRepository'

const STORAGE_KEY = 'spa-manager-credentials'

function pushCredentialsToSupabase(credentials) {
  if (!isSupabaseConfigured) return
  upsertCredentials(credentials).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
  })
}

export const DEFAULT_ADMIN_PASSWORD = 'admin123'

export const DEFAULT_BRANCH_PASSWORDS = {
  'vinh-long': 'khoespavinhlong',
  'tra-vinh': 'khoespatravinh',
  'bac-lieu': 'khoespabaclieu',
  'soc-trang': 'khoespasoctrang',
  'tram-spa': 'tramspa',
  'song-khoe-spa': 'songkhoespa',
  'gia-lai-1': 'khoespagialai1',
  'gia-lai-2': 'khoespagialai2',
  'gia-lai-3': 'khoespagialai3',
}

function buildDefaultCredentials() {
  return {
    admin: DEFAULT_ADMIN_PASSWORD,
    branches: { ...DEFAULT_BRANCH_PASSWORDS },
  }
}

async function normalizeStoredPassword(value) {
  if (!value) return value
  if (isPasswordHash(value)) return value
  return hashPassword(value)
}

async function normalizeCredentials(data) {
  const admin = await normalizeStoredPassword(data.admin ?? DEFAULT_ADMIN_PASSWORD)
  const branches = {}

  for (const [branchId, password] of Object.entries({
    ...DEFAULT_BRANCH_PASSWORDS,
    ...(data.branches ?? {}),
  })) {
    branches[branchId] = await normalizeStoredPassword(password)
  }

  return { admin, branches }
}

export function loadCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults = buildDefaultCredentials()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    const data = JSON.parse(raw)
    return {
      admin: data.admin ?? DEFAULT_ADMIN_PASSWORD,
      branches: { ...DEFAULT_BRANCH_PASSWORDS, ...(data.branches ?? {}) },
    }
  } catch {
    return buildDefaultCredentials()
  }
}

export async function ensureCredentialsHashed() {
  const current = loadCredentials()
  const needsHash = !isPasswordHash(current.admin)
    || Object.values(current.branches).some((password) => !isPasswordHash(password))

  if (!needsHash) return current

  const normalized = await normalizeCredentials(current)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function saveCredentials(credentials, { skipRemoteSync = false } = {}) {
  const normalized = {
    admin: credentials.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: { ...loadCredentials().branches, ...(credentials.branches ?? {}) },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushCredentialsToSupabase(normalized)
  return normalized
}

export async function saveCredentialsHashed(credentials, { skipRemoteSync = false } = {}) {
  const normalized = await normalizeCredentials({
    admin: credentials.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: { ...loadCredentials().branches, ...(credentials.branches ?? {}) },
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushCredentialsToSupabase(normalized)
  return normalized
}

export function getAdminPassword() {
  return loadCredentials().admin
}

export function getBranchPassword(branchId) {
  return loadCredentials().branches[branchId] ?? ''
}

export async function verifyAdminPassword(password) {
  const credentials = await ensureCredentialsHashed()
  return verifyPassword(password, credentials.admin)
}

export async function verifyBranchPassword(branchId, password) {
  const credentials = await ensureCredentialsHashed()
  return verifyPassword(password, credentials.branches[branchId] ?? '')
}

export async function updateAdminPassword(password) {
  const credentials = loadCredentials()
  credentials.admin = await hashPassword(password)
  return saveCredentials(credentials)
}

export async function updateBranchPassword(branchId, password) {
  const credentials = loadCredentials()
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(password),
  }
  return saveCredentials(credentials)
}

export async function syncMissingBranchCredentials() {
  const branches = loadBranches()
  const credentials = await ensureCredentialsHashed()
  let changed = false

  for (const branch of branches) {
    if (!credentials.branches[branch.id]) {
      credentials.branches[branch.id] = await hashPassword(`spa-${branch.id}`)
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return credentials
}

export async function registerBranchCredential(branchId, password) {
  const credentials = loadCredentials()
  const value = password?.trim() || `spa-${branchId}`
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(value),
  }
  return saveCredentials(credentials)
}

export function getAccountList() {
  const credentials = loadCredentials()
  const mask = (value) => (isPasswordHash(value) ? '••••••••' : value)

  return [
    { id: 'admin', label: 'Admin', branchId: ADMIN_BRANCH, password: mask(credentials.admin) },
    ...loadBranches().map((branch) => ({
      id: branch.id,
      label: branch.name,
      branchId: branch.id,
      branchName: branch.name,
      password: mask(credentials.branches[branch.id] ?? ''),
    })),
  ]
}
