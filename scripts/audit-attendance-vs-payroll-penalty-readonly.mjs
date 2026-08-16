/**
 * READ-ONLY audit — attendance.penaltyAmount vs payroll_adjustments(type=penalty).
 * Không ghi DB. Không duyệt request. Không sửa code nghiệp vụ.
 *
 * Run: node_modules/.bin/vite-node scripts/audit-attendance-vs-payroll-penalty-readonly.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { normalizeAttendanceRow } from '../src/repositories/attendanceRepository.js'
import { getAttendanceStatusLabel } from '../src/constants/attendanceTypes.js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const OUT = 'docs/uat-evidence/ATTENDANCE_VS_PAYROLL_PENALTY_AUDIT_READONLY.json'
const FOCUS_ADJ = 'payadj-1786800394617-1l6bpo'
const FOCUS_EMP = 'bac-lieu-thu-huong'
const FOCUS_DATE = '2026-08-07'

const ATTENDANCE_LIKE = /chấm công|cham cong|quá phép|qua phep|không phép|khong phep|unpermitted|nghỉ|nghi|đi trễ|di tre|về sớm|ve som|off|phạt off|attendance|full_day|half_/i

const { url, key } = await loadProductionSupabaseEnv(BASE)
const sb = createClient(url, key, { auth: { persistSession: false } })

async function fetchAll(table, columns = '*', apply) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message || error.code || JSON.stringify(error)}`)
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
    from += pageSize
  }
  return rows
}

function money(n) {
  return Number(n || 0)
}

function keyOf(emp, date, amount) {
  return `${emp}|${String(date || '').slice(0, 10)}|${money(amount)}`
}

console.log('Loading production (read-only)...')

async function safe(label, fn) {
  try {
    return await fn()
  } catch (err) {
    console.error(`FAIL ${label}:`, err?.message || err?.code || err)
    return null
  }
}

const adjustments = await safe('adjustments', () =>
  fetchAll('payroll_adjustments', '*', (q) => q.eq('type', 'penalty')))
if (!adjustments) process.exit(1)

const attendanceRaw = await safe('attendance', () =>
  fetchAll(
    'attendance',
    'id,employee_id,branch_id,attendance_date,status,penalty_amount,reason,created_at,updated_at',
  ))
if (!attendanceRaw) process.exit(1)

const locks = (await safe('locks', () => fetchAll('payroll_locks', '*'))) || []
const closes = (await safe('closes', () => fetchAll('payroll_cycle_closes', '*'))) || []
const auditForAdj = (await safe('auditForAdj', () =>
  fetchAll('payroll_audit_logs', '*', (q) => q.eq('entity_id', FOCUS_ADJ)))) || []
const auditForEmp = (await safe('auditForEmp', () =>
  fetchAll('payroll_audit_logs', '*', (q) =>
    q.eq('entity_id', FOCUS_EMP).eq('entity_type', 'payroll_field').order('created_at', { ascending: false }).limit(50)))) || []
const focusAdjRows = (await safe('focusAdj', () =>
  fetchAll('payroll_adjustments', '*', (q) => q.eq('id', FOCUS_ADJ)))) || []

// Broader audits mentioning the adj id in JSON
let auditMention = []
const mentionRes = await sb
  .from('payroll_audit_logs')
  .select('*')
  .eq('entity_id', FOCUS_ADJ)
  .limit(50)
if (mentionRes.error) console.warn('audit mention:', mentionRes.error.message)
else auditMention = mentionRes.data || []

// Also search create actions by employee around the date
const { data: auditCreateAround, error: auditCreateErr } = await sb
  .from('payroll_audit_logs')
  .select('*')
  .eq('entity_type', 'payroll_adjustment')
  .eq('action', 'create')
  .gte('created_at', '2026-08-01')
  .lte('created_at', '2026-08-17')
  .limit(500)
if (auditCreateErr) console.warn('audit create:', auditCreateErr.message)
const createAuditsForFocus = (auditCreateAround || []).filter((a) => {
  const nv = a.new_value || {}
  return a.entity_id === FOCUS_ADJ
    || nv.id === FOCUS_ADJ
    || (nv.employeeId === FOCUS_EMP && String(nv.date || '').startsWith('2026-08-07') && nv.type === 'penalty')
})

const attendance = attendanceRaw.map((r) => normalizeAttendanceRow(r))
const attByEmpDate = new Map()
for (const row of attendance) {
  const k = `${row.employeeId}|${row.date}`
  const list = attByEmpDate.get(k) || []
  list.push(row)
  attByEmpDate.set(k, list)
}

const attPenaltyByEmpDate = new Map()
for (const row of attendance) {
  const amt = money(row.penaltyAmount)
  if (amt <= 0) continue
  const k = `${row.employeeId}|${row.date}`
  attPenaltyByEmpDate.set(k, (attPenaltyByEmpDate.get(k) || 0) + amt)
}

/** Heuristic: adjustment looks attendance-sourced by reason/note text */
function looksAttendanceSourced(adj) {
  const text = `${adj.reason || ''} ${adj.note || ''}`
  return ATTENDANCE_LIKE.test(text)
}

const groups = {
  A_double: [], // att penalty > 0 AND adj same emp+date (any amount match or any penalty adj)
  A_exact_double: [], // same emp+date+amount
  B_orphan_adj: [], // adj > 0 but att penalty 0 or missing
  C_manual_keep: [], // adj with no att match amount/date and not attendance-like text → likely admin
  D_unknown: [],
}

let sumA = 0
let sumAExact = 0
let sumB = 0
let sumC = 0
let sumD = 0

for (const adj of adjustments) {
  const amount = money(adj.amount)
  if (amount === 0) continue // zeroed SET remnants — skip money risk

  const emp = adj.employee_id
  const date = String(adj.date || '').slice(0, 10)
  const attKey = `${emp}|${date}`
  const attPenalty = attPenaltyByEmpDate.get(attKey) || 0
  const attRows = attByEmpDate.get(attKey) || []
  const exactMatch = attPenalty > 0 && attPenalty === amount
  const dateHasAttPenalty = attPenalty > 0
  const attendanceLike = looksAttendanceSourced(adj)

  const base = {
    id: adj.id,
    employeeId: emp,
    employeeName: adj.employee_name,
    branchId: adj.branch_id,
    date,
    month: adj.month,
    amount,
    reason: adj.reason,
    note: adj.note,
    createdBy: adj.created_by,
    createdByName: adj.created_by_name,
    createdAt: adj.created_at,
    updatedAt: adj.updated_at,
    payrollCycle: adj.payroll_cycle,
    attendanceLike,
    attPenaltyOnDate: attPenalty,
    attStatuses: attRows.map((r) => ({
      id: r.id,
      status: r.status,
      statusLabel: getAttendanceStatusLabel?.(r.status) || r.status,
      penaltyAmount: r.penaltyAmount,
    })),
  }

  if (exactMatch) {
    groups.A_exact_double.push(base)
    sumAExact += amount
    groups.A_double.push({ ...base, match: 'exact_amount' })
    sumA += amount
  } else if (dateHasAttPenalty) {
    groups.A_double.push({ ...base, match: 'same_date_different_amount' })
    sumA += amount
  } else if (!dateHasAttPenalty && (attRows.length === 0 || attPenalty === 0)) {
    // B if attendance-like OR same date had attendance with zero penalty (status changed)
    // vs C if clearly manual (not attendance-like and no attendance context)
    if (attendanceLike || attRows.length > 0) {
      // hung: had attendance day with 0 penalty now, or text suggests attendance
      groups.B_orphan_adj.push(base)
      sumB += amount
    } else if (!attendanceLike && attRows.length === 0) {
      groups.C_manual_keep.push(base)
      sumC += amount
    } else {
      groups.D_unknown.push(base)
      sumD += amount
    }
  } else {
    groups.D_unknown.push(base)
    sumD += amount
  }
}

// Refine: B also includes attendanceLike + no att penalty
// C: not attendanceLike, no att on that date OR att with 0 and reason clearly admin (bonus-style) — already handled

const focusAdj = focusAdjRows[0] || adjustments.find((a) => a.id === FOCUS_ADJ) || null
const focusAtt = (attByEmpDate.get(`${FOCUS_EMP}|${FOCUS_DATE}`) || [])
const focusAudits = [
  ...(auditForAdj || []),
  ...(auditMention || []),
  ...(createAuditsForFocus || []),
].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)

// Locks / closes for Aug 2026 bac-lieu
const month = '2026-08'
const branch = 'bac-lieu'
const relevantLocks = locks.filter(
  (l) => l.month === month && (!l.branch_id || l.branch_id === '' || l.branch_id === branch || l.branch_id === 'all'),
)
const relevantCloses = (closes || []).filter((c) => {
  const m = c.billing_month || c.month || ''
  const b = c.branch_id || ''
  const e = c.employee_id || ''
  return m === month && (b === branch || b === '' || e === FOCUS_EMP)
})

// Code-path conclusions (static)
const architecture = {
  attendanceWritesPayrollAdjustment: false,
  evidence: [
    'attendanceService adminCreate/Update only updates attendance.penalty_amount via recomputeMonthlyPenalties',
    'afterAttendanceSourceChanged only invalidateClose / post-approval mark — no insertPayrollAdjustment',
    'payroll_adjustments created only via payrollService.addPayrollAdjustment / saveAdminPayrollBoardEdits',
    'payrollEngine.computeEmployeePayrollRow: penalty = sumAttendancePenalty + sumAdjustments(PENALTY)',
    'branchEfficiencyPnl.buildPenaltyPnlItems DEDupes same emp+date+amount; payrollEngine does NOT dedupe',
    'saveAdminPayrollBoardEdits SET penalty stores adjTarget = displayedTotal - attendancePenalty (manual delta only by design)',
  ],
  syncOnAttendanceChange: false,
  reverseOnAttendanceChange: false,
}

const report = {
  at: new Date().toISOString(),
  base: BASE,
  readOnly: true,
  architecture,
  totals: {
    penaltyAdjustmentsNonZero: adjustments.filter((a) => money(a.amount) !== 0).length,
    penaltyAdjustmentsAll: adjustments.length,
    A_doubleCount: groups.A_double.length,
    A_exactDoubleCount: groups.A_exact_double.length,
    A_doubleAmount: sumA,
    A_exactDoubleAmount: sumAExact,
    B_orphanHungCount: groups.B_orphan_adj.length,
    B_orphanHungAmount: sumB,
    C_manualKeepCount: groups.C_manual_keep.length,
    C_manualKeepAmount: sumC,
    D_unknownCount: groups.D_unknown.length,
    D_unknownAmount: sumD,
    riskMoneyIfEngineAddsBoth_A_exact: sumAExact,
    riskMoneyHung_B: sumB,
  },
  groups: {
    A_exact_double: groups.A_exact_double,
    A_same_date_any: groups.A_double.filter((x) => x.match === 'same_date_different_amount'),
    B_orphan_adj: groups.B_orphan_adj,
    C_manual_keep: groups.C_manual_keep.slice(0, 100),
    C_manual_keep_truncated: groups.C_manual_keep.length > 100,
    D_unknown: groups.D_unknown,
  },
  thuHuong_08_07: {
    adjustment: focusAdj,
    attendance: focusAtt,
    audits: focusAudits,
    fieldAuditsSample: (auditForEmp || []).slice(0, 20),
    classification:
      focusAdj && money(focusAdj.amount) === 100000 && money(focusAtt[0]?.penaltyAmount) === 100000
        ? 'A_exact_double'
        : 'check',
    ifApproveRequest: {
      attendancePenaltyAfter: 0,
      adjustmentRemains: money(focusAdj?.amount || 0),
      enginePenaltyAfter: money(focusAdj?.amount || 0),
      note: 'Duyệt → attendance.penaltyAmount=0; adjustment 100k vẫn còn; lương vẫn trừ 100k từ manual. Hiện tại trước duyệt engine có thể trừ 200k.',
    },
  },
  periodLock_bacLieu_2026_08: {
    locks: relevantLocks,
    closes: relevantCloses.map((c) => ({
      id: c.id,
      status: c.status,
      billingMonth: c.billing_month || c.month,
      cycle: c.cycle || c.pay_cycle,
      branchId: c.branch_id,
      employeeId: c.employee_id,
      approvedAt: c.approved_at,
      submittedAt: c.submitted_at,
    })),
  },
  conclusions: {
    adjustmentIsAutoMirrorOfAttendance: false,
    adjustmentIsIndependentAdminChannel: true,
    whyEngineAddsBoth:
      'Designed as two channels: attendance SoT auto + Admin manual SET/add. Board SET subtracts attendance when writing adj, but live compute always sums both. Duplicate if Admin entered full amount while attendance already had penalty, or SET used wrong attendancePart=0.',
  },
}

writeFileSync(OUT, JSON.stringify(report, null, 2))

console.log('\n=== TOTALS ===')
console.log(JSON.stringify(report.totals, null, 2))
console.log('\n=== THU HUONG 08-07 ===')
console.log(JSON.stringify({
  adj: focusAdj && {
    id: focusAdj.id,
    amount: focusAdj.amount,
    reason: focusAdj.reason,
    note: focusAdj.note,
    created_by: focusAdj.created_by,
    created_by_name: focusAdj.created_by_name,
    created_at: focusAdj.created_at,
    date: focusAdj.date,
  },
  att: focusAtt,
  auditCount: focusAudits.length,
  audits: focusAudits.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entity_type,
    editor: a.editor_name,
    reason: a.reason,
    created_at: a.created_at,
  })),
}, null, 2))
console.log('\n=== LOCKS/CLOSES ===')
console.log(JSON.stringify(report.periodLock_bacLieu_2026_08, null, 2))
console.log(`\nWrote ${OUT}`)
console.log(`A_exact=${groups.A_exact_double.length} B=${groups.B_orphan_adj.length} C=${groups.C_manual_keep.length} D=${groups.D_unknown.length}`)
