import {
  DEFAULT_KPI_TARGETS,
  KPI_POLICY_STATUS,
  isKpiScopeBranch,
} from '../constants/kpiPolicy'
import { assertNoPolicyOverlap, closePreviousPolicy, validatePolicyTargets } from '../utils/employeeKpiEngine'

export const KPI_POLICY_STORAGE_KEY = 'spa-manager-kpi-branch-policies'
export const KPI_POLICY_LOG_STORAGE_KEY = 'spa-manager-kpi-policy-change-logs'

function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  globalThis.localStorage?.setItem(key, JSON.stringify(value))
}

export function loadLocalKpiPolicies() {
  return readJson(KPI_POLICY_STORAGE_KEY, [])
}

export function loadLocalKpiPolicyLogs() {
  return readJson(KPI_POLICY_LOG_STORAGE_KEY, [])
}

export function saveLocalKpiPolicies(policies) {
  const check = assertNoPolicyOverlap(policies)
  if (!check.ok) throw new Error(check.error)
  writeJson(KPI_POLICY_STORAGE_KEY, policies)
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function appendKpiPolicyVersion({
  existing = loadLocalKpiPolicies(),
  logs = loadLocalKpiPolicyLogs(),
  branchId,
  effectiveFrom,
  effectiveTo = null,
  targets,
  actorId = '',
  reason = '',
}) {
  if (!isKpiScopeBranch(branchId)) {
    throw new Error('KPI policy chỉ áp dụng 6 chi nhánh trong scope')
  }
  const valid = validatePolicyTargets(targets)
  if (!valid.ok) throw new Error(valid.error)

  const next = {
    id: newId('kpi-pol'),
    branchId,
    effectiveFrom,
    effectiveTo,
    addonTarget: targets.addon,
    advancedTarget: targets.advanced,
    comboTarget: targets.combo,
    requestedTarget: targets.requested,
    status: KPI_POLICY_STATUS.ACTIVE,
    createdBy: actorId,
    createdAt: new Date().toISOString(),
    updatedBy: actorId,
    updatedAt: new Date().toISOString(),
    changeReason: reason,
  }

  const closed = closePreviousPolicy(existing, next)
  const all = [...closed, next]
  const overlap = assertNoPolicyOverlap(all)
  if (!overlap.ok) throw new Error(overlap.error)

  const prev = existing.filter((p) => p.branchId === branchId && p.status === KPI_POLICY_STATUS.ACTIVE)
  const log = {
    id: newId('kpi-log'),
    branchId,
    oldPolicy: prev[0] || null,
    newPolicy: next,
    effectiveFrom,
    effectiveTo,
    actorId,
    reason,
    timestamp: new Date().toISOString(),
  }

  saveLocalKpiPolicies(all)
  writeJson(KPI_POLICY_LOG_STORAGE_KEY, [...logs, log])
  return { policies: all, log }
}

export function defaultFallbackPolicy(branchId) {
  return {
    id: `fallback:${branchId}`,
    branchId,
    addonTarget: DEFAULT_KPI_TARGETS.addon,
    advancedTarget: DEFAULT_KPI_TARGETS.advanced,
    comboTarget: DEFAULT_KPI_TARGETS.combo,
    requestedTarget: DEFAULT_KPI_TARGETS.requested,
    source: 'fallback',
  }
}
