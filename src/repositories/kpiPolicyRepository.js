import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { isMissingSchemaTableError } from './payrollRepository'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'
import { closePreviousPolicy, validatePolicyTargets, assertNoPolicyOverlap } from '../utils/employeeKpiEngine'
import { isKpiScopeBranch } from '../constants/kpiPolicy'
import {
  appendKpiPolicyVersion,
  loadLocalKpiPolicies,
  loadLocalKpiPolicyLogs,
} from '../utils/kpiPolicyStorage'
import { notifyDataSynced } from '../utils/dataSyncEvents'

const POLICIES_TABLE = 'kpi_branch_policies'
const LOGS_TABLE = 'kpi_policy_change_logs'

function normalizePolicyRow(row) {
  if (!row) return row
  return {
    ...row,
    effectiveFrom: String(row.effectiveFrom || row.effective_from || '').slice(0, 10),
    effectiveTo: row.effectiveTo == null && row.effective_to == null
      ? null
      : String(row.effectiveTo ?? row.effective_to).slice(0, 10),
    addonTarget: Number(row.addonTarget ?? row.addon_target),
    advancedTarget: Number(row.advancedTarget ?? row.advanced_target),
    comboTarget: Number(row.comboTarget ?? row.combo_target),
    requestedTarget: Number(row.requestedTarget ?? row.requested_target),
    duration90Target: (() => {
      const raw = row.duration90Target ?? row.duration90_target
      if (raw == null || raw === '') return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    })(),
  }
}

export async function fetchKpiBranchPolicies() {
  if (!isSupabaseConfigured) {
    return loadLocalKpiPolicies().map(normalizePolicyRow)
  }
  const { data, error } = await supabase.from(POLICIES_TABLE).select('*').order('effective_from', { ascending: true })
  if (error) {
    if (isMissingSchemaTableError(error)) return loadLocalKpiPolicies().map(normalizePolicyRow)
    throw error
  }
  return rowsToCamel(data ?? []).map(normalizePolicyRow)
}

export async function fetchKpiPolicyChangeLogs() {
  if (!isSupabaseConfigured) {
    return loadLocalKpiPolicyLogs()
  }
  const { data, error } = await supabase.from(LOGS_TABLE).select('*').order('created_at', { ascending: false })
  if (error) {
    if (isMissingSchemaTableError(error)) return loadLocalKpiPolicyLogs()
    throw error
  }
  return rowsToCamel(data ?? [])
}

export async function insertKpiBranchPolicy({
  branchId,
  effectiveFrom,
  effectiveTo = null,
  targets,
  actorId = '',
  reason = '',
}) {
  if (!isKpiScopeBranch(branchId)) {
    throw new Error('KPI policy không áp dụng chi nhánh ngoài 6 CN')
  }
  const valid = validatePolicyTargets(targets)
  if (!valid.ok) throw new Error(valid.error)

  if (!isSupabaseConfigured) {
    const result = appendKpiPolicyVersion({
      existing: loadLocalKpiPolicies(),
      logs: loadLocalKpiPolicyLogs(),
      branchId,
      effectiveFrom,
      effectiveTo,
      targets,
      actorId,
      reason,
    })
    notifyDataSynced(['kpi-policies'])
    return result.log.newPolicy
  }

  const existing = await fetchKpiBranchPolicies()
  const next = {
    id: `kpi-pol-${crypto.randomUUID()}`,
    branchId,
    effectiveFrom,
    effectiveTo,
    addonTarget: targets.addon,
    advancedTarget: targets.advanced,
    comboTarget: targets.combo,
    requestedTarget: targets.requested,
    duration90Target: targets.duration90 == null || targets.duration90 === ''
      ? null
      : Number(targets.duration90),
    status: 'active',
    createdBy: actorId,
    updatedBy: actorId,
    changeReason: reason,
  }
  const closed = closePreviousPolicy(existing, next)
  const overlap = assertNoPolicyOverlap([...closed, next])
  if (!overlap.ok) throw new Error(overlap.error)

  const existingById = new Map(existing.map((p) => [p.id, p]))
  const toClose = closed.filter((p) => {
    const old = existingById.get(p.id)
    return old && (old.effectiveTo !== p.effectiveTo || old.status !== p.status)
  })
  for (const row of toClose) {
    const { error } = await supabase
      .from(POLICIES_TABLE)
      .update(objectToSnakeRow({
        effectiveTo: row.effectiveTo,
        status: row.status,
        updatedBy: actorId,
        updatedAt: new Date().toISOString(),
      }))
      .eq('id', row.id)
    if (error) throw error
  }

  const { error: insertError } = await supabase.from(POLICIES_TABLE).insert(objectToSnakeRow({
    ...next,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
  if (insertError) throw insertError

  const oldPolicy = existing.find((p) => p.branchId === branchId && p.status === 'active') || null
  const { error: logError } = await supabase.from(LOGS_TABLE).insert({
    id: `kpi-log-${crypto.randomUUID()}`,
    branch_id: branchId,
    old_policy: oldPolicy,
    new_policy: next,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    actor_id: actorId,
    reason,
  })
  if (logError && !isMissingSchemaTableError(logError)) throw logError

  notifyDataSynced(['kpi-policies'])
  return next
}
