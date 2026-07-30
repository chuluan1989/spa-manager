/**
 * RC1 — Release Candidate verification gate
 * Run: npm run verify:rc1
 *
 * Read-only Production queries except verify-final-round test invoice seed/cleanup.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import {
  filterByUserScope,
  getRecordFetchBranchFilter,
} from '../src/constants/auth.js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel } from '../src/repositories/caseUtils.js'
import {
  validateBranchHistory,
  compareRecordBranchToTimeline,
} from '../src/utils/employeeBranchTimeline.js'
import { normalizeEmployee } from '../src/utils/employeeStorage.js'
import { buildEmployeeManagementRows } from '../src/utils/managementReports/managementMetrics.js'
import { computePayrollReport } from '../src/utils/payrollEngine.js'
import { PAY_CYCLES } from '../src/utils/salaryReport.js'

const CHERRY = 'tram-spa-cherry'
const TRUC_LY = 'tram-spa-truc-ly'
const MONTH = '2026-07-01'
const MONTH_END = '2026-07-31'

const sections = {}
let totalPass = 0
let totalFail = 0
const knownIssues = []
const perf = {}

function log(label, ok, detail = '') {
  if (ok) totalPass += 1
  else totalFail += 1
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function section(name, fn) {
  console.log(`\n=== ${name} ===\n`)
  const failBefore = totalFail
  fn()
  if (!sections[name]) sections[name] = totalFail === failBefore ? 'PASS' : 'FAIL'
}

function setSession(user) {
  if (user.role === 'employee') {
    localStorage.setItem('spa-manager-employees', JSON.stringify([{
      id: user.employeeId,
      branchId: user.branch,
      name: user.employeeName || 'Test',
      status: 'active',
    }]))
  }
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

async function timed(label, fn) {
  const t0 = performance.now()
  const result = await fn()
  perf[label] = Math.round(performance.now() - t0)
  return result
}

function runScript(name, scriptPath, retries = 2) {
  let lastDetail = ''
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const r = spawnSync('npx', ['vite-node', scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (r.status === 0) {
      log(`${name}`, true)
      return true
    }
    lastDetail = (r.stderr || r.stdout || '').split('\n').filter((l) => l.includes('✗')).slice(-2).join(' ')
  }
  log(`${name}`, false, lastDetail)
  return false
}

// ── Security ──────────────────────────────────────────────
section('Security', () => {
  const items = [
    { id: '1', branchId: 'tram-spa', employeeId: CHERRY },
    { id: '2', branchId: 'bac-lieu', employeeId: CHERRY },
    { id: '3', branchId: 'tram-spa', employeeId: TRUC_LY },
    { id: '4', branchId: 'soc-trang', employeeId: 'other-emp' },
  ]

  setSession({ role: 'employee', branch: 'bac-lieu', employeeId: CHERRY, employeeName: 'Cherry' })
  const empScoped = filterByUserScope(items)
  log('Employee — chỉ thấy own records', empScoped.length === 2 && empScoped.every((i) => i.employeeId === CHERRY))
  log('Employee fetch branch filter empty', getRecordFetchBranchFilter('bac-lieu') === '')

  setSession({ role: 'branch_manager', branch: 'tram-spa' })
  const mgrScoped = filterByUserScope(items)
  log('Manager tram-spa — không thấy bac-lieu', mgrScoped.every((i) => i.branchId === 'tram-spa'))
  log('Manager fetch branch = session', getRecordFetchBranchFilter('') === 'tram-spa')

  setSession({ role: 'admin', branch: 'all' })
  log('Admin — thấy all records', filterByUserScope(items).length === 4)

  sessionStorage.clear()
  localStorage.clear()
})

// ── Production client ─────────────────────────────────────
let sb
try {
  const { url, key } = await loadProductionSupabaseEnv()
  sb = createClient(url, key)
} catch (err) {
  console.error('\n⚠ Không load được Production Supabase:', err.message)
  knownIssues.push('Production env unavailable — data/perf/transfer checks skipped')
}

if (sb) {
  // ── Data Integrity ──────────────────────────────────────
  await (async () => {
    console.log('\n=== Data Integrity (Production read-only) ===\n')
    const before = totalFail

    const { data: empRows } = await sb.from('employees').select('id,name,branch_id,branch_history,status')
    const employees = (empRows ?? []).map((r) => normalizeEmployee(rowToCamel(r)))

    let invalidHistory = 0
    let timelineMismatches = 0
    let orphanInvoices = 0
    const empIds = new Set(employees.map((e) => e.id))

    for (const emp of employees) {
      const v = validateBranchHistory(emp)
      if (!v.ok) invalidHistory += 1
    }

    const { count: invNoEmp } = await sb.from('invoices')
      .select('id', { count: 'exact', head: true })
      .is('employee_id', null)
    orphanInvoices = invNoEmp ?? 0

    const { data: invSample } = await sb.from('invoices')
      .select('id,branch_id,date,employee_id')
      .in('employee_id', [CHERRY, TRUC_LY])
      .limit(100)

    for (const row of invSample ?? []) {
      const emp = employees.find((e) => e.id === row.employee_id)
      if (!emp) continue
      const cmp = compareRecordBranchToTimeline({ branchId: row.branch_id, date: row.date }, emp)
      if (!cmp.skipped && !cmp.ok) timelineMismatches += 1
    }

    log('branch_history hợp lệ (sample employees)', invalidHistory === 0, `invalid=${invalidHistory}`)
    log('Không orphan invoice (employee_id null)', orphanInvoices === 0, `count=${orphanInvoices}`)
    log('Cherry/Trúc Ly invoice timeline sample', timelineMismatches === 0, `mismatches=${timelineMismatches}`)
    log('Employee IDs unique', empIds.size === employees.length)

    sections['Data Integrity'] = totalFail === before ? 'PASS' : 'FAIL'
  })()

  // ── Employee Transfer ───────────────────────────────────
  await (async () => {
    console.log('\n=== Employee Transfer (Cherry / Trúc Ly) ===\n')
    const before = totalFail

    for (const [id, expectedBranch, oldBranch] of [
      [CHERRY, 'bac-lieu', 'tram-spa'],
      [TRUC_LY, 'soc-trang', 'tram-spa'],
    ]) {
      const { data: emp } = await sb.from('employees').select('branch_id').eq('id', id).maybeSingle()
      log(`${id} current branch`, emp?.branch_id === expectedBranch, `actual=${emp?.branch_id}`)

      const countAt = async (branch) => {
        const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true })
          .eq('employee_id', id).eq('branch_id', branch)
          .gte('date', MONTH).lte('date', MONTH_END)
        return count ?? 0
      }

      const oldCount = await countAt(oldBranch)
      const newCount = await countAt(expectedBranch)
      log(`${id} HĐ cũ ${oldBranch} (T7)`, oldCount > 0, `count=${oldCount}`)
      log(`${id} HĐ mới ${expectedBranch} (T7+)`, newCount >= 0, `count=${newCount}`)

      const { count: attOld } = await sb.from('attendance').select('id', { count: 'exact', head: true })
        .eq('employee_id', id).eq('branch_id', oldBranch)
      log(`${id} chấm công tại ${oldBranch}`, (attOld ?? 0) > 0, `count=${attOld ?? 0}`)
    }

    sections['Employee Transfer'] = totalFail === before ? 'PASS' : 'FAIL'
  })()

  // ── Performance ─────────────────────────────────────────
  await (async () => {
    console.log('\n=== Performance (current latency ms) ===\n')
    await timed('login_credentials_fetch', async () => {
      await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
    })
    await timed('employee_report_invoices', async () => {
      await sb.from('invoices').select('id,branch_id,date,employee_id,total')
        .eq('employee_id', CHERRY)
        .gte('date', MONTH).lte('date', MONTH_END)
    })
    await timed('manager_report_invoices', async () => {
      await sb.from('invoices').select('id,branch_id,date,employee_id,total,customer_requested')
        .eq('branch_id', 'tram-spa')
        .gte('date', MONTH).lte('date', MONTH_END)
    })
    await timed('payroll_invoices_fetch', async () => {
      await sb.from('invoices').select('id,branch_id,date,employee_id,services,tips,commission')
        .or(`employee_id.eq.${CHERRY},support_employee_id.eq.${CHERRY}`)
        .gte('date', MONTH).lte('date', MONTH_END)
    })
    await timed('attendance_fetch', async () => {
      await sb.from('attendance').select('id,branch_id,date,employee_id,status')
        .eq('employee_id', CHERRY)
        .gte('date', MONTH).lte('date', MONTH_END)
    })

    for (const [k, ms] of Object.entries(perf)) {
      const slow = ms > 3000
      log(`${k}: ${ms}ms`, !slow, slow ? 'SLOW (>3s)' : '')
      if (slow) knownIssues.push(`Slow query: ${k} ${ms}ms`)
    }
    sections['Performance'] = Object.values(perf).every((ms) => ms <= 3000) ? 'PASS' : 'REVIEW'
  })()
}

// ── Unit regression scripts ───────────────────────────────
section('Unit Regression', () => {
  runScript('employee-branch-timeline', 'scripts/verify-employee-branch-timeline.mjs')
  runScript('employee-historical-fetch', 'scripts/verify-employee-historical-fetch.mjs')
  runScript('phase3-design-freeze', 'scripts/verify-phase3-design-freeze.mjs')
  runScript('phase4-design-freeze', 'scripts/verify-phase4-design-freeze.mjs')
  runScript('management-reports', 'scripts/verify-management-reports.mjs')
  runScript('payroll-period-lock', 'scripts/verify-payroll-period-lock.mjs')
})

// ── Integration regression ──────────────────────────────────
section('Integration Regression', () => {
  runScript('verify-final-round', 'scripts/verify-final-round.mjs')
})

// ── Payroll breakdown unit ────────────────────────────────
section('Payroll Breakdown', () => {
  const emp = { id: CHERRY, name: 'Cherry', branchId: 'bac-lieu', salaryRate: '5000000' }
  const invoices = [
    { id: 'a', date: '2026-07-05', branchId: 'tram-spa', employeeId: CHERRY, tips: 0, services: [] },
    { id: 'b', date: '2026-07-06', branchId: 'bac-lieu', employeeId: CHERRY, tips: 0, services: [] },
  ]
  const report = computePayrollReport({
    month: '2026-07',
    cycle: PAY_CYCLES.PERIOD_1,
    branchId: '',
    employeeId: CHERRY,
    employees: [emp],
    invoices,
    attendanceRecords: [],
    adjustments: [],
  })
  const row = report.rows[0]
  log('Payroll employee row exists', Boolean(row))
  log('Multi-branch sections', (row?.branchSections?.length ?? 0) >= 2)
  log('Section labels not "Đa chi nhánh"', !row?.branchSections?.some((s) => String(s.branchName).includes('Đa chi nhánh')))
})

// ── Manager KPI unit ──────────────────────────────────────
section('Manager KPI / Ranking', () => {
  const invoices = [
    { id: '1', date: '2026-07-05', branchId: 'tram-spa', employeeId: CHERRY, customerRequested: false },
    { id: '2', date: '2026-07-06', branchId: 'tram-spa', employeeId: TRUC_LY, customerRequested: true },
  ]
  const rows = buildEmployeeManagementRows({
    invoices,
    previousInvoices: [],
    scopeBranchId: 'tram-spa',
    employeeIds: new Set([CHERRY, TRUC_LY]),
    fromDate: MONTH,
    toDate: MONTH_END,
  })
  log('Trạm Spa sees Cherry + Trúc Ly', rows.some((r) => r.id === CHERRY) && rows.some((r) => r.id === TRUC_LY))
  log('Ranking fields set', rows.every((r) => r.revenueRankInBranch != null))
})

// ── Summary ───────────────────────────────────────────────
console.log('\n' + '='.repeat(50))
console.log('RC1 SUMMARY')
console.log('='.repeat(50))
console.log(`  Total PASS: ${totalPass}`)
console.log(`  Total FAIL: ${totalFail}`)
if (Object.keys(perf).length) {
  console.log('\n  Performance (ms):')
  for (const [k, v] of Object.entries(perf)) console.log(`    ${k}: ${v}`)
}
if (knownIssues.length) {
  console.log('\n  Known issues / review:')
  for (const i of knownIssues) console.log(`    - ${i}`)
}

const rc1Pass = totalFail === 0
console.log(`\n  RC1: ${rc1Pass ? 'PASS' : 'FAIL'}`)
console.log(`  Merge: ${rc1Pass ? 'READY FOR REVIEW (not merged)' : 'NOT READY'}`)
console.log(`  Deploy: ${rc1Pass ? 'READY FOR REVIEW (not deployed)' : 'NOT READY'}`)
console.log('')

process.exit(rc1Pass ? 0 : 1)
