/**
 * APPLY void 4 mirror penalties + restore Cherry 12/08 500k.
 *   APPLY=1 node --env-file=.env.local scripts/apply-void-attendance-mirror-penalties.mjs
 *
 * Không hard delete. Có payroll_audit_logs before/after.
 */
import postgres from 'postgres'
import { writeFileSync } from 'node:fs'
import { VOID_ATTENDANCE_MIRROR_PENALTY_REASON } from '../src/utils/payrollPenaltyPolicy.js'

const APPLY = String(process.env.APPLY || '') === '1'
const OUT = 'docs/uat-evidence/VOID_ATTENDANCE_MIRROR_PENALTIES_APPLY.json'
const REASON = VOID_ATTENDANCE_MIRROR_PENALTY_REASON

const MIRROR_IDS = [
  'payadj-1786800377253-nbeu8b', // Thu Hương 08-06
  'payadj-1786800394617-1l6bpo', // Thu Hương 08-07
  'payadj-1786800211581-6opqia', // Cherry 08-06
  'payadj-1786800229645-v048cg', // Cherry 08-07
]
const CHERRY_12 = 'payadj-1786800135828-rsb024'
const CHERRY_15_ERR = 'payadj-1786913796088-nsz4dm'

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })

function auditId() {
  return `payaudit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function load(id) {
  const rows = await sql`select * from payroll_adjustments where id = ${id}`
  return rows[0] || null
}

async function writeAudit(before, after, reason, action = 'update') {
  const id = auditId()
  await sql`
    insert into payroll_audit_logs (
      id, entity_type, entity_id, action, editor_id, editor_name,
      old_value, new_value, reason, created_at
    ) values (
      ${id}, 'payroll_adjustment', ${after.id}, ${action},
      'admin', 'Admin',
      ${sql.json(before)}, ${sql.json(after)},
      ${reason}, now()
    )
  `
  return id
}

async function setAmount(row, { amount, reason, note, category }) {
  const before = { ...row }
  const updated = await sql`
    update payroll_adjustments
    set amount = ${amount},
        reason = ${reason},
        note = ${note},
        category = ${category ?? row.category ?? 'other'},
        source = 'manual',
        updated_at = now()
    where id = ${row.id}
    returning *
  `
  const after = updated[0]
  const audit = await writeAudit(before, after, reason)
  return { before, after, audit }
}

const report = {
  at: new Date().toISOString(),
  apply: APPLY,
  applied: false,
  actions: [],
  errors: [],
}

try {
  if (!APPLY) {
    report.note = 'DRY-RUN — set APPLY=1 to write'
    for (const id of MIRROR_IDS) {
      const row = await load(id)
      report.actions.push({ id, plan: 'void_or_stamp', amount: row?.amount, reason: row?.reason })
    }
    report.actions.push({ id: CHERRY_12, plan: 'restore_500k_if_zero', amount: (await load(CHERRY_12))?.amount })
    report.actions.push({ id: CHERRY_15_ERR, plan: 'zero_if_500_duplicate', amount: (await load(CHERRY_15_ERR))?.amount })
    writeFileSync(OUT, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    process.exit(0)
  }

  // 1) Void / stamp 4 mirrors
  for (const id of MIRROR_IDS) {
    const row = await load(id)
    if (!row) {
      report.errors.push({ id, error: 'NOT_FOUND' })
      continue
    }
    const needAmountZero = Number(row.amount) !== 0
    const needReason = String(row.reason || '') !== REASON
    if (!needAmountZero && !needReason) {
      report.actions.push({ id, action: 'already_voided', amount: 0 })
      continue
    }
    const note = `${row.note || ''} | voided`.replace(/^\s*\|\s*/, '').trim()
    const result = await setAmount(row, {
      amount: 0,
      reason: REASON,
      note,
      category: 'other',
    })
    report.actions.push({
      id,
      action: needAmountZero ? 'zeroed' : 'reason_stamped',
      beforeAmount: Number(result.before.amount),
      afterAmount: Number(result.after.amount),
      audit: result.audit,
    })
  }

  // 2) Restore Cherry 12/08 500k “Phạt lúc làm khách”
  const cherry12 = await load(CHERRY_12)
  if (!cherry12) {
    report.errors.push({ id: CHERRY_12, error: 'NOT_FOUND' })
  } else if (Number(cherry12.amount) !== 500000) {
    const result = await setAmount(cherry12, {
      amount: 500000,
      reason: 'Phạt lúc làm khách',
      note: 'Phạt lúc làm khách 12/8',
      category: 'service',
    })
    report.actions.push({
      id: CHERRY_12,
      action: 'restored_500k',
      beforeAmount: Number(result.before.amount),
      afterAmount: Number(result.after.amount),
      audit: result.audit,
    })
  } else {
    report.actions.push({ id: CHERRY_12, action: 'already_500k', amount: 500000 })
  }

  // 3) Zero erroneous 08/15 500k duplicate (reason nhầm) if present
  const cherry15 = await load(CHERRY_15_ERR)
  if (cherry15 && Number(cherry15.amount) !== 0) {
    const result = await setAmount(cherry15, {
      amount: 0,
      reason: 'Hủy bản ghi trùng — giữ phạt làm khách ngày 12/08 (payadj-1786800135828-rsb024)',
      note: `${cherry15.note || ''} | superseded_by_12_08`.trim(),
      category: 'other',
    })
    report.actions.push({
      id: CHERRY_15_ERR,
      action: 'zeroed_duplicate_500k',
      beforeAmount: Number(result.before.amount),
      afterAmount: Number(result.after.amount),
      audit: result.audit,
    })
  } else if (cherry15) {
    report.actions.push({ id: CHERRY_15_ERR, action: 'already_zero', amount: 0 })
  }

  // Verify
  const verify = []
  for (const id of [...MIRROR_IDS, CHERRY_12, CHERRY_15_ERR]) {
    const row = await load(id)
    verify.push({
      id,
      amount: row ? Number(row.amount) : null,
      reason: row?.reason,
      date: row?.date,
      note: row?.note,
    })
  }
  report.verify = verify
  const mirrorsZero = MIRROR_IDS.every((id) => Number(verify.find((v) => v.id === id)?.amount) === 0)
  const cherry500Ok = Number(verify.find((v) => v.id === CHERRY_12)?.amount) === 500000
  const dupZero = Number(verify.find((v) => v.id === CHERRY_15_ERR)?.amount || 0) === 0
  report.ok = mirrorsZero && cherry500Ok && dupZero && report.errors.length === 0
  report.applied = true
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    ok: report.ok,
    mirrorsZero,
    cherry500Ok,
    dupZero,
    actions: report.actions.map((a) => ({ id: a.id, action: a.action, after: a.afterAmount ?? a.amount })),
    out: OUT,
  }, null, 2))
  process.exit(report.ok ? 0 : 1)
} catch (err) {
  report.errors.push({ error: err.message })
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.error(err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
