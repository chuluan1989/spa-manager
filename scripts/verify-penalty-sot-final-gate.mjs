/**
 * Final gate — void mirrors + Cherry 500k + Payroll/P&L parity (live DB).
 *   node_modules/.bin/vite-node --env-file=.env.local scripts/verify-penalty-sot-final-gate.mjs
 */
import './_polyfill-storage.mjs'
import postgres from 'postgres'
import { writeFileSync } from 'node:fs'
import { computeEmployeePayrollRow } from '../src/utils/payrollEngine.js'
import { buildPenaltyPnlItems } from '../src/utils/managementReports/branchEfficiencyPnl.js'

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 })
const MIRROR = [
  'payadj-1786800377253-nbeu8b',
  'payadj-1786800394617-1l6bpo',
  'payadj-1786800211581-6opqia',
  'payadj-1786800229645-v048cg',
]
const CHERRY12 = 'payadj-1786800135828-rsb024'
const CHERRY15 = 'payadj-1786913796088-nsz4dm'
const cherryEmp = 'tram-spa-cherry'
const thuHuong = 'bac-lieu-thu-huong'
const monthStart = '2026-08-01'
const monthEnd = '2026-08-31'

const rows = await sql`
  select id, employee_id, amount, reason, note, date, category, source
  from payroll_adjustments
  where id = any(${MIRROR.concat([CHERRY12, CHERRY15])})
`
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
const audits = await sql`
  select id, entity_id, reason, created_at
  from payroll_audit_logs
  where entity_type = 'payroll_adjustment'
    and entity_id = any(${MIRROR.concat([CHERRY12, CHERRY15])})
  order by created_at desc
  limit 12
`

const att = await sql`
  select employee_id, attendance_date as date, penalty_amount, status, branch_id
  from attendance
  where employee_id in (${cherryEmp}, ${thuHuong})
    and attendance_date >= ${monthStart} and attendance_date <= ${monthEnd}
`

const adj = await sql`
  select id, employee_id, type, amount, date, month, reason, note, branch_id, source, category
  from payroll_adjustments
  where employee_id in (${cherryEmp}, ${thuHuong})
    and (month = '2026-08' or (date >= ${monthStart} and date <= ${monthEnd}))
`

const mapAtt = att.map((a) => ({
  employeeId: a.employee_id,
  date: a.date,
  penaltyAmount: Number(a.penalty_amount || 0),
  status: a.status,
  branchId: a.branch_id,
}))
const mapAdj = adj.map((a) => ({
  id: a.id,
  employeeId: a.employee_id,
  type: a.type,
  amount: Number(a.amount || 0),
  date: a.date,
  month: a.month,
  reason: a.reason,
  note: a.note,
  branchId: a.branch_id,
  source: a.source,
  category: a.category,
}))

function checkEmp(id, name) {
  const a = mapAtt.filter((x) => x.employeeId === id)
  const d = mapAdj.filter((x) => x.employeeId === id)
  const row = computeEmployeePayrollRow({ id, name, branchId: 'bac-lieu', salaryRate: 0 }, [], a, d)
  const pnl = buildPenaltyPnlItems({
    attendanceRecords: a,
    adjustments: d,
    fromDate: monthStart,
    toDate: monthEnd,
  })
  return {
    attendancePenalty: row.attendancePenalty,
    manualPenalty: row.manualPenalty,
    payrollPenalty: row.penalty,
    pnlTotal: pnl.total,
    parity: row.penalty === pnl.total,
    nonZeroManual: d
      .filter((x) => x.type === 'penalty' && x.amount !== 0)
      .map((x) => ({ id: x.id, amount: x.amount, date: x.date, reason: x.reason })),
  }
}

const checks = {
  mirrorsZero: MIRROR.every((id) => Number(byId[id]?.amount) === 0),
  cherry12_500: Number(byId[CHERRY12]?.amount) === 500000,
  cherry15_zero: Number(byId[CHERRY15]?.amount) === 0,
  cherryNote: String(byId[CHERRY12]?.note || '').includes('Phạt lúc làm khách'),
  auditAtLeast6: audits.length >= 6,
}
const live = {
  cherry: checkEmp(cherryEmp, 'Cherry'),
  thuHuong: checkEmp(thuHuong, 'Thu Hương'),
}
const pass =
  checks.mirrorsZero &&
  checks.cherry12_500 &&
  checks.cherry15_zero &&
  checks.cherryNote &&
  live.cherry.parity &&
  live.thuHuong.parity &&
  !live.cherry.nonZeroManual.some((m) => MIRROR.includes(m.id)) &&
  live.cherry.nonZeroManual.some((m) => m.id === CHERRY12 && m.amount === 500000)

const out = {
  at: new Date().toISOString(),
  pass,
  checks,
  rows: byId,
  audits: audits.map((a) => ({
    id: a.id,
    entity_id: a.entity_id,
    reason: a.reason,
    created_at: a.created_at,
  })),
  live,
}
writeFileSync('docs/uat-evidence/PENALTY_SOT_FINAL_GATE.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ pass, checks, live }, null, 2))
await sql.end()
process.exit(pass ? 0 : 1)
