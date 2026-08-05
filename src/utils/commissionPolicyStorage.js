import { isSupabaseConfigured } from '../lib/supabaseClient'
import { buildDefaultCommissionPolicy, buildDefaultCommissionPolicyMap } from '../constants/defaultCommissionPolicies'
import { loadBranches } from './branchStorage'
import { upsertCommissionPolicyMap } from '../repositories/commissionPolicyRepository'

const STORAGE_KEY = 'spa-manager-commission-policies'
const VERSION_KEY = 'spa-manager-commission-policies-version'
/** v3: thêm body-75 vào 0%; Bạc Liêu 20% + Chuyên sâu 30%. */
const POLICY_DATA_VERSION = 3

function normalizeGroup(group = {}) {
  return {
    id: group.id || `group-${Date.now()}`,
    label: group.label ?? `${group.rate ?? 0}%`,
    rate: Number(group.rate ?? 0),
    serviceIds: Array.isArray(group.serviceIds) ? group.serviceIds.filter(Boolean) : [],
    serviceNames: Array.isArray(group.serviceNames) ? group.serviceNames.filter(Boolean) : [],
  }
}

export function normalizeCommissionPolicy(policy = {}) {
  const branchId = policy.branchId ?? ''
  const defaults = buildDefaultCommissionPolicy(branchId)

  return {
    branchId,
    policyType: policy.policyType ?? defaults.policyType,
    flatRate: policy.flatRate ?? defaults.flatRate,
    defaultRate: Number.isFinite(Number(policy.defaultRate))
      ? Number(policy.defaultRate)
      : defaults.defaultRate,
    groups: Array.isArray(policy.groups)
      ? policy.groups.map(normalizeGroup)
      : defaults.groups,
    updatedAt: policy.updatedAt ?? new Date().toISOString(),
  }
}

export function loadCommissionPolicyMap() {
  try {
    const branchIds = loadBranches().map((branch) => branch.id)
    const defaults = buildDefaultCommissionPolicyMap(branchIds)
    const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0)

    // Reset về default khi nâng version công thức (tránh localStorage giữ flat BL / thiếu body-75).
    if (storedVersion < POLICY_DATA_VERSION) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      localStorage.setItem(VERSION_KEY, String(POLICY_DATA_VERSION))
      return defaults
    }

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      localStorage.setItem(VERSION_KEY, String(POLICY_DATA_VERSION))
      return defaults
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      localStorage.setItem(VERSION_KEY, String(POLICY_DATA_VERSION))
      return defaults
    }

    const merged = { ...defaults }
    for (const branchId of branchIds) {
      merged[branchId] = normalizeCommissionPolicy({
        ...defaults[branchId],
        ...(parsed[branchId] ?? {}),
        branchId,
      })
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    localStorage.setItem(VERSION_KEY, String(POLICY_DATA_VERSION))
    return merged
  } catch {
    const branchIds = loadBranches().map((branch) => branch.id)
    const defaults = buildDefaultCommissionPolicyMap(branchIds)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    localStorage.setItem(VERSION_KEY, String(POLICY_DATA_VERSION))
    return defaults
  }
}

export function saveCommissionPolicyMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  if (isSupabaseConfigured) {
    upsertCommissionPolicyMap(map).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ chính sách hoa hồng:', error?.message)
    })
  }
  return map
}

export function getBranchCommissionPolicy(branchId) {
  const map = loadCommissionPolicyMap()
  return map[branchId] ?? buildDefaultCommissionPolicy(branchId)
}

export function updateBranchCommissionPolicy(branchId, patch) {
  const map = loadCommissionPolicyMap()
  const current = map[branchId] ?? buildDefaultCommissionPolicy(branchId)
  map[branchId] = normalizeCommissionPolicy({
    ...current,
    ...patch,
    branchId,
    updatedAt: new Date().toISOString(),
  })
  return saveCommissionPolicyMap(map)
}

export function applyRemoteCommissionPolicyMap(remoteMap) {
  if (!remoteMap || typeof remoteMap !== 'object') return loadCommissionPolicyMap()

  let localRaw = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) localRaw = JSON.parse(raw) ?? {}
  } catch {
    localRaw = {}
  }

  const branchIds = loadBranches().map((branch) => branch.id)
  const defaults = buildDefaultCommissionPolicyMap(branchIds)
  const merged = { ...defaults }

  for (const branchId of branchIds) {
    const localPolicy = localRaw[branchId]
    const remotePolicy = remoteMap[branchId]
    const localTime = Date.parse(localPolicy?.updatedAt ?? 0)
    const remoteTime = Date.parse(remotePolicy?.updatedAt ?? 0)

    let winner = remotePolicy
    if (localPolicy && (!remotePolicy || localTime > remoteTime)) {
      winner = localPolicy
    }

    merged[branchId] = normalizeCommissionPolicy({
      ...defaults[branchId],
      ...(winner ?? {}),
      branchId,
    })
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  return merged
}

export function listCommissionPolicies() {
  const map = loadCommissionPolicyMap()
  return loadBranches().map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    policy: map[branch.id] ?? buildDefaultCommissionPolicy(branch.id),
  }))
}
