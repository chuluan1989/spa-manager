import { isSupabaseConfigured } from '../lib/supabaseClient'
import { buildDefaultCommissionPolicy, buildDefaultCommissionPolicyMap } from '../constants/defaultCommissionPolicies'
import { loadBranches } from './branchStorage'
import { upsertCommissionPolicyMap } from '../repositories/commissionPolicyRepository'

const STORAGE_KEY = 'spa-manager-commission-policies'

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
    const raw = localStorage.getItem(STORAGE_KEY)
    const branchIds = loadBranches().map((branch) => branch.id)
    const defaults = buildDefaultCommissionPolicyMap(branchIds)

    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
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
    return merged
  } catch {
    const branchIds = loadBranches().map((branch) => branch.id)
    const defaults = buildDefaultCommissionPolicyMap(branchIds)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
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
  const branchIds = loadBranches().map((branch) => branch.id)
  const defaults = buildDefaultCommissionPolicyMap(branchIds)
  const merged = { ...defaults }

  for (const branchId of branchIds) {
    merged[branchId] = normalizeCommissionPolicy({
      ...defaults[branchId],
      ...(remoteMap[branchId] ?? {}),
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
