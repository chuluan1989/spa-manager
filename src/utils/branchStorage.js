import { PRICE_GROUP_IDS } from '../constants/priceGroupIds'
import {
  CANONICAL_BRANCHES,
  CANONICAL_BRANCH_IDS,
  getCanonicalBranchName,
  getPasswordBranchName,
  getDefaultBranchId,
  isCanonicalBranchId,
} from '../constants/canonicalBranches'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranches } from '../repositories/branchesRepository'

export {
  CANONICAL_BRANCH_IDS,
  getCanonicalBranchName,
  getPasswordBranchName,
  getDefaultBranchId,
  isCanonicalBranchId,
}

function pushBranchesToSupabase(branches) {
  if (!isSupabaseConfigured) return
  upsertBranches(branches).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ chi nhánh:', error?.message)
  })
}

export const BRANCH_STATUS = {
  ACTIVE: 'active',
  LOCKED: 'locked',
}

const STORAGE_KEY = 'spa-manager-branches'

const DEFAULT_BRANCH_DEFINITIONS = CANONICAL_BRANCHES.map((branch) => ({
  id: branch.id,
  name: branch.name,
  priceGroupId: branch.priceGroupId,
  supportEnabled: branch.supportEnabled,
  address: branch.address,
  hotline: branch.phone,
  sortOrder: branch.sortOrder,
}))

function buildDefaultBranch(definition) {
  return normalizeBranch({
    ...definition,
    status: BRANCH_STATUS.ACTIVE,
  })
}

const DEFAULT_BRANCHES = DEFAULT_BRANCH_DEFINITIONS.map(buildDefaultBranch)

export function normalizeBranch(branch) {
  const branchId = branch?.id ?? ''
  const canonical = CANONICAL_BRANCHES.find((item) => item.id === branchId)
  return {
    id: branchId,
    name: branch?.name?.trim() || canonical?.name || '',
    address: branch?.address?.trim() || canonical?.address || '',
    hotline: branch?.hotline?.trim() || canonical?.phone || '',
    sortOrder: Number.isFinite(Number(branch?.sortOrder))
      ? Number(branch.sortOrder)
      : (canonical?.sortOrder ?? 99),
    status: branch?.status === BRANCH_STATUS.LOCKED ? BRANCH_STATUS.LOCKED : BRANCH_STATUS.ACTIVE,
    priceGroupId: branch?.priceGroupId ?? canonical?.priceGroupId ?? PRICE_GROUP_IDS.STANDARD,
    supportEnabled: Boolean(branch?.supportEnabled ?? canonical?.supportEnabled),
    updatedAt: branch?.updatedAt ?? new Date().toISOString(),
  }
}

export function sortBranchesForDisplay(branches) {
  return [...branches].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 99) - (b.sortOrder ?? 99)
    if (orderDiff !== 0) return orderDiff
    return (a.name ?? '').localeCompare(b.name ?? '', 'vi')
  })
}

function seedDefaultBranches() {
  const defaults = sortBranchesForDisplay(DEFAULT_BRANCHES.map(normalizeBranch))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
  return defaults
}

export function loadBranchesRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedDefaultBranches()

    const data = JSON.parse(raw)
    if (!Array.isArray(data) || data.length === 0) return seedDefaultBranches()

    return sortBranchesForDisplay(data.map(normalizeBranch))
  } catch {
    return seedDefaultBranches()
  }
}

export function loadBranches() {
  const normalized = loadBranchesRaw()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function saveBranches(branches, { skipRemoteSync = false } = {}) {
  const normalized = sortBranchesForDisplay(
    branches.map((branch) => normalizeBranch({
      ...branch,
      updatedAt: new Date().toISOString(),
    })),
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushBranchesToSupabase(normalized)
  return normalized
}

/**
 * Bổ sung chi nhánh mặc định còn thiếu — không ghi đè chi nhánh đã có.
 */
export function syncMissingDefaultBranches() {
  const branches = loadBranches()
  const existingIds = new Set(branches.map((branch) => branch.id))
  const missing = DEFAULT_BRANCHES.filter((branch) => !existingIds.has(branch.id))
  if (missing.length === 0) return branches

  const merged = sortBranchesForDisplay([...branches, ...missing.map(normalizeBranch)])
  saveBranches(merged)
  return merged
}

export function getBranchById(branchId) {
  return loadBranches().find((branch) => branch.id === branchId) ?? null
}

export function getBranchMap() {
  return Object.fromEntries(loadBranches().map((branch) => [branch.id, branch]))
}

export function getBranchName(branchId) {
  return getBranchById(branchId)?.name ?? getCanonicalBranchName(branchId) ?? '—'
}

export function getActiveBranches() {
  return loadBranches().filter((branch) => branch.status === BRANCH_STATUS.ACTIVE)
}

export function getSupportBranchIds() {
  return loadBranches()
    .filter((branch) => branch.supportEnabled && branch.status === BRANCH_STATUS.ACTIVE)
    .map((branch) => branch.id)
}

export function isSupportBranchEnabled(branchId) {
  const branch = getBranchById(branchId)
  return Boolean(branch?.supportEnabled && branch.status === BRANCH_STATUS.ACTIVE)
}

export function isBranchActive(branchId) {
  const branch = getBranchById(branchId)
  return branch?.status === BRANCH_STATUS.ACTIVE
}

export function createBranchId(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const existing = loadBranches()
  let id = base || `branch-${Date.now()}`
  let counter = 1
  while (existing.some((branch) => branch.id === id)) {
    id = `${base}-${counter}`
    counter += 1
  }
  return id
}

export function getStatusLabel(status) {
  return status === BRANCH_STATUS.LOCKED ? 'Tạm khóa' : 'Đang hoạt động'
}

export function addBranch(data) {
  const branches = loadBranches()
  const branch = normalizeBranch({
    id: data.id || createBranchId(data.name),
    name: data.name,
    address: data.address,
    hotline: data.hotline,
    sortOrder: data.sortOrder ?? branches.length + 1,
    status: data.status ?? BRANCH_STATUS.ACTIVE,
    priceGroupId: data.priceGroupId ?? PRICE_GROUP_IDS.STANDARD,
    supportEnabled: data.supportEnabled ?? false,
  })
  branches.push(branch)
  saveBranches(branches)
  return branch
}

export function updateBranch(id, data) {
  const branches = loadBranches()
  const current = branches.find((branch) => branch.id === id)
  if (!current) return null

  const next = { ...current }
  if (data.name !== undefined) next.name = data.name?.trim() ?? next.name
  if (data.address !== undefined) next.address = data.address?.trim() ?? ''
  if (data.hotline !== undefined) next.hotline = data.hotline?.trim() ?? ''
  if (data.sortOrder !== undefined) next.sortOrder = Number(data.sortOrder) || next.sortOrder
  if (data.status !== undefined) {
    next.status = data.status === BRANCH_STATUS.LOCKED
      ? BRANCH_STATUS.LOCKED
      : BRANCH_STATUS.ACTIVE
  }
  if (data.priceGroupId !== undefined) next.priceGroupId = data.priceGroupId
  if (data.supportEnabled !== undefined) next.supportEnabled = Boolean(data.supportEnabled)

  const updated = normalizeBranch({ ...next, updatedAt: new Date().toISOString() })
  const merged = branches.map((branch) => (branch.id === id ? updated : branch))
  saveBranches(merged)
  return updated
}

export function lockBranch(branchId) {
  return updateBranch(branchId, { status: BRANCH_STATUS.LOCKED })
}

export function unlockBranch(branchId) {
  return updateBranch(branchId, { status: BRANCH_STATUS.ACTIVE })
}
