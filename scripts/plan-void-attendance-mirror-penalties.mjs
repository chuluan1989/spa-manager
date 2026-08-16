/**
 * Preview plan — void 4 nhóm B (phạt off mirror). KHÔNG ghi Production trừ APPLY=1.
 *
 * Re-audit + dry-run:
 *   node_modules/.bin/vite-node scripts/plan-void-attendance-mirror-penalties.mjs
 *
 * Apply (sau duyệt riêng):
 *   APPLY=1 node_modules/.bin/vite-node scripts/plan-void-attendance-mirror-penalties.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import {
  VOID_ATTENDANCE_MIRROR_PENALTY_REASON,
  looksLikeAttendanceMirrorPenalty,
} from '../src/utils/payrollPenaltyPolicy.js'

const APPLY = String(process.env.APPLY || '') === '1'
const OUT = 'docs/uat-evidence/VOID_ATTENDANCE_MIRROR_PENALTIES_PLAN.json'

const TARGET_IDS = [
  'payadj-1786800377253-nbeu8b', // Thu Hương 08-06
  'payadj-1786800394617-1l6bpo', // Thu Hương 08-07
  'payadj-1786800211581-6opqia', // Cherry 08-06
  'payadj-1786800229645-v048cg', // Cherry 08-07
]
const PROTECTED_ID = 'payadj-1786800135828-rsb024' // Cherry 500k

const { url, key } = await loadProductionSupabaseEnv()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: rows, error } = await sb.from('payroll_adjustments').select('*').in('id', [...TARGET_IDS, PROTECTED_ID])
if (error) throw error

const byId = Object.fromEntries((rows || []).map((r) => [r.id, r]))
const plan = []
const failures = []

for (const id of TARGET_IDS) {
  const row = byId[id]
  if (!row) {
    failures.push({ id, error: 'NOT_FOUND' })
    continue
  }
  const mirror = looksLikeAttendanceMirrorPenalty({
    type: row.type,
    reason: row.reason,
    note: row.note,
    category: row.category,
  })
  const okType = row.type === 'penalty'
  const okAmount = Number(row.amount) === 100000
  const confirmed = okType && okAmount && mirror
  plan.push({
    id,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    date: row.date,
    amount: row.amount,
    reason: row.reason,
    note: row.note,
    mirrorTextMatch: mirror,
    confirmedForVoid: confirmed,
    action: confirmed ? 'ZERO_VIA_UPDATE' : 'SKIP',
    voidReason: VOID_ATTENDANCE_MIRROR_PENALTY_REASON,
    before: row,
  })
  if (!confirmed) failures.push({ id, error: 'NOT_CONFIRMED_MIRROR', row })
}

const protectedRow = byId[PROTECTED_ID]
const protectedOk = protectedRow
  && Number(protectedRow.amount) === 500000
  && /làm khách|lam khach/i.test(`${protectedRow.reason || ''} ${protectedRow.note || ''}`)

const report = {
  at: new Date().toISOString(),
  apply: APPLY,
  applied: false,
  protected: {
    id: PROTECTED_ID,
    untouched: true,
    amount: protectedRow?.amount,
    note: protectedRow?.note,
    confirmedManualService: protectedOk,
  },
  plan,
  failures,
  note: APPLY
    ? 'APPLY=1 — sẽ zero từng dòng + audit'
    : 'DRY-RUN — chưa ghi Production. Chờ duyệt APPLY.',
}

if (APPLY) {
  if (failures.length) {
    console.error('ABORT APPLY — có dòng chưa xác nhận', failures)
    writeFileSync(OUT, JSON.stringify(report, null, 2))
    process.exit(2)
  }
  // Soft apply only when explicitly requested — still uses anon key path like app.
  // Prefer app service after approve; this block is gated.
  const appliedRows = []
  for (const item of plan) {
    const before = item.before
    const after = {
      ...before,
      amount: 0,
      reason: VOID_ATTENDANCE_MIRROR_PENALTY_REASON,
      note: `${before.note || ''} | voided`.trim(),
      updated_at: new Date().toISOString(),
    }
    const { data, error: upErr } = await sb
      .from('payroll_adjustments')
      .update({
        amount: 0,
        reason: VOID_ATTENDANCE_MIRROR_PENALTY_REASON,
        note: after.note,
        updated_at: after.updated_at,
      })
      .eq('id', item.id)
      .select('*')
      .single()
    if (upErr) throw upErr
    const audit = {
      id: `payaudit-void-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      entity_type: 'payroll_adjustment',
      entity_id: item.id,
      action: 'update',
      editor_id: 'admin',
      editor_name: 'Admin',
      old_value: before,
      new_value: data,
      reason: VOID_ATTENDANCE_MIRROR_PENALTY_REASON,
      created_at: new Date().toISOString(),
    }
    const { error: audErr } = await sb.from('payroll_audit_logs').insert(audit)
    if (audErr) throw audErr
    appliedRows.push({ id: item.id, beforeAmount: before.amount, afterAmount: data.amount, auditId: audit.id })
  }
  report.applied = true
  report.appliedRows = appliedRows
}

writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(JSON.stringify({
  apply: APPLY,
  applied: report.applied,
  confirmed: plan.filter((p) => p.confirmedForVoid).length,
  failures: failures.length,
  protectedOk,
  out: OUT,
}, null, 2))
for (const p of plan) {
  console.log(
    `${p.confirmedForVoid ? 'OK' : 'SKIP'} ${p.id} ${p.employee_name} ${p.date} ${p.amount} mirror=${p.mirrorTextMatch}`,
  )
}
if (!APPLY) console.log('\nDRY-RUN only — CHƯA APPLY Production.')
