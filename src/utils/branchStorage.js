import { PRICE_GROUP_IDS } from '../constants/priceGroupIds'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranches } from '../repositories/branchesRepository'

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

const DEFAULT_BRANCHES = [
  { id: 'vinh-long', name: 'Vĩnh Long', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
  { id: 'tra-vinh', name: 'Trà Vinh', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
  { id: 'bac-lieu', name: 'Bạc Liêu', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
  { id: 'soc-trang', name: 'Sóc Trăng', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: true },
  { id: 'tram-spa', name: 'Trạm Spa', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.TRAM_SPA, supportEnabled: true },
  { id: 'song-khoe-spa', name: 'Sống Khoẻ Spa', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.SONG_KHOE_SPA, supportEnabled: true },
  { id: 'gia-lai-1', name: 'Gia Lai 1', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
  { id: 'gia-lai-2', name: 'Gia Lai 2', status: BRANCH_STATUS.ACTIVE, priceGroupId: PRICE_GROUP_IDS.STANDARD, supportEnabled: false },
]

export function normalizeBranch(branch) {
  return {
    id: branch.id,
    name: branch.name?.trim() ?? '',
    status: branch.status === BRANCH_STATUS.LOCKED ? BRANCH_STATUS.LOCKED : BRANCH_STATUS.ACTIVE,
    priceGroupId: branch.priceGroupId ?? PRICE_GROUP_IDS.STANDARD,
    supportEnabled: Boolean(branch.supportEnabled),
  }
}

function seedDefaultBranches() {
  const defaults = DEFAULT_BRANCHES.map(normalizeBranch)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
  return defaults
}

export function loadBranches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedDefaultBranches()

    const data = JSON.parse(raw)
    if (!Array.isArray(data) || data.length === 0) return seedDefaultBranches()

    const normalized = data.map(normalizeBranch)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    return normalized
  } catch {
    return seedDefaultBranches()
  }
}

export function saveBranches(branches, { skipRemoteSync = false } = {}) {
  const normalized = branches.map(normalizeBranch)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushBranchesToSupabase(normalized)
  return normalized
}

/**
 * Bổ sung các chi nhánh mặc định mới (vd. khi hệ thống thêm chi nhánh mới
 * qua code) vào danh sách đã lưu trong localStorage của người dùng cũ,
 * mà không đụng tới hay xoá bất kỳ chi nhánh nào đã có sẵn.
 */
export function syncMissingDefaultBranches() {
  const branches = loadBranches()
  const existingIds = new Set(branches.map((branch) => branch.id))
  const missing = DEFAULT_BRANCHES.filter((branch) => !existingIds.has(branch.id))
  if (missing.length === 0) return branches

  const merged = [...branches, ...missing.map(normalizeBranch)]
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
  return getBranchById(branchId)?.name ?? '—'
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
  const index = branches.findIndex((branch) => branch.id === id)
  if (index === -1) return null

  const current = branches[index]
  if (data.name !== undefined) current.name = data.name?.trim() ?? current.name
  if (data.status !== undefined) {
    current.status = data.status === BRANCH_STATUS.LOCKED
      ? BRANCH_STATUS.LOCKED
      : BRANCH_STATUS.ACTIVE
  }
  if (data.priceGroupId !== undefined) current.priceGroupId = data.priceGroupId
  if (data.supportEnabled !== undefined) current.supportEnabled = Boolean(data.supportEnabled)

  branches[index] = normalizeBranch(current)
  saveBranches(branches)
  return branches[index]
}
