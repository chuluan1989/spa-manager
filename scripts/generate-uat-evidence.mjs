/**
 * UAT Evidence — Production data + role visibility + lifecycle demo + screenshots
 * Run: npm run evidence:uat-lifecycle-v1
 *
 * Output: docs/uat-evidence/UAT_EVIDENCE_REPORT.md + JSON + PNG screenshots
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel, rowsToCamel } from '../src/repositories/caseUtils.js'
import { normalizeEmployee } from '../src/utils/employeeStorage.js'
import {
  applyRecordFetchScope,
  filterByUserScope,
  RECORD_FETCH_USE_CASES,
  resolveRecordFetchFilters,
} from '../src/constants/auth.js'
import { computePayrollReport } from '../src/utils/payrollEngine.js'
import { PAY_CYCLES, getPayPeriodRange } from '../src/utils/salaryReport.js'
import { computeEmployeeCustomerRequestedStats } from '../src/utils/employeeInvoiceReport.js'
import {
  computeEmployeeDefaultPassword,
  verifyLoginWithUsername,
} from '../src/constants/loginCredentials.js'
import { hashPassword } from '../src/utils/passwordHash.js'
import { getPasswordBranchName } from '../src/utils/branchStorage.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173'

const SUBJECTS = [
  {
    id: 'tram-spa-cherry',
    name: 'Cherry',
    oldBranch: 'tram-spa',
    currentBranch: 'bac-lieu',
  },
  {
    id: 'tram-spa-truc-ly',
    name: 'Trúc Ly',
    oldBranch: 'tram-spa',
    currentBranch: 'soc-trang',
  },
]

const UAT_DEMO_ID = 'uat-lifecycle-v1-demo'
const UAT_BRANCH_START = 'tram-spa'
const UAT_BRANCH_TRANSFER = 'vinh-long'
const MONTH = '2026-07-01'
const MONTH_END = '2026-07-31'

mkdirSync(OUT_DIR, { recursive: true })

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

function clearSession() {
  sessionStorage.removeItem('spa-manager-current-user')
  localStorage.removeItem('spa-manager-employees')
}

function countByBranch(rows, field = 'branch_id') {
  const map = {}
  for (const row of rows ?? []) {
    const key = row[field] ?? row.branchId ?? '—'
    map[key] = (map[key] ?? 0) + 1
  }
  return map
}

function toCamelInvoices(rows) {
  return (rows ?? []).map((row) => {
    const c = rowToCamel(row)
    return {
      ...c,
      branchId: c.branchId,
      employeeId: c.employeeId,
      supportEmployeeId: c.supportEmployeeId ?? '',
      customerRequested: Boolean(c.customerRequested),
    }
  })
}

async function collectEmployeeEvidence(sb, subject) {
  const { data: employeeRow } = await sb
    .from('employees')
    .select('id,name,branch_id,branch_history,status,updated_at')
    .eq('id', subject.id)
    .maybeSingle()

  const { data: invoiceRows } = await sb
    .from('invoices')
    .select('id,branch_id,date,employee_id,support_employee_id,total,tips,customer_requested,services,commission')
    .or(`employee_id.eq.${subject.id},support_employee_id.eq.${subject.id}`)

  const { data: attendanceRows, error: attendanceErr } = await sb
    .from('attendance')
    .select('id,branch_id,attendance_date,employee_id,status')
    .eq('employee_id', subject.id)

  const { data: adjustmentRows } = await sb
    .from('payroll_adjustments')
    .select('id,branch_id,month,employee_id,amount,type')
    .eq('employee_id', subject.id)

  const { data: auditRows, error: auditErr } = await sb
    .from('employee_audit_logs')
    .select('id,action,details,created_at')
    .eq('employee_id', subject.id)
    .order('created_at', { ascending: false })

  const { data: profileAuditRows, error: profileAuditErr } = await sb
    .from('employee_profile_audit_logs')
    .select('id,changed_fields,changed_at')
    .eq('employee_id', subject.id)
    .order('changed_at', { ascending: false })

  const invoices = toCamelInvoices(invoiceRows)
  const attendance = (attendanceRows ?? []).map((row) => {
    const c = rowToCamel(row)
    return { ...c, date: c.attendanceDate ?? c.date ?? '' }
  })
  const adjustments = rowsToCamel(adjustmentRows)
  const employee = employeeRow ? normalizeEmployee(rowToCamel(employeeRow)) : null

  const julyInvoices = invoices.filter((row) => row.date >= MONTH && row.date <= MONTH_END)
  const julyAttendance = attendance.filter((row) => row.date >= MONTH && row.date <= MONTH_END)

  const payrollReport = computePayrollReport({
    month: '2026-07',
    cycle: PAY_CYCLES.FULL,
    branchId: '',
    employeeId: subject.id,
    employees: employee ? [employee] : [],
    invoices: julyInvoices,
    attendanceRecords: julyAttendance,
    adjustments: adjustments.filter((row) => String(row.month ?? '').startsWith('2026-07')),
  })

  const employeePayrollRow = payrollReport?.rows?.find((row) => row.employeeId === subject.id) ?? null

  const customerRequested = computeEmployeeCustomerRequestedStats(invoices, subject.id, {
    fromDate: '2020-01-01',
    toDate: '2099-12-31',
  })

  return {
    employee: employeeRow,
    counts: {
      invoices: {
        total: invoices.length,
        byBranch: countByBranch(invoiceRows),
        july2026: julyInvoices.length,
        customerRequested: invoices.filter((inv) => inv.customerRequested).length,
      },
      attendance: {
        total: attendance.length,
        byBranch: countByBranch(attendanceRows),
        july2026: julyAttendance.length,
      },
      payrollAdjustments: {
        total: adjustments.length,
        byBranch: countByBranch(adjustmentRows, 'branch_id'),
      },
      customerRequested: {
        invoiceCount: customerRequested?.requestedCount ?? 0,
        tourCount: customerRequested?.totalTours ?? invoices.length,
        requestedRate: customerRequested?.requestedRate,
      },
      activityLog: {
        employeeAudit: auditRows?.length ?? 0,
        profileAudit: profileAuditRows?.length ?? 0,
        total: (auditRows?.length ?? 0) + (profileAuditRows?.length ?? 0),
        queryErrors: [auditErr?.message, profileAuditErr?.message].filter(Boolean),
        recentEmployeeAudit: (auditRows ?? []).slice(0, 5),
        recentProfileAudit: (profileAuditRows ?? []).slice(0, 5),
      },
      queryErrors: {
        attendance: attendanceErr?.message ?? null,
      },
    },
    payrollJuly2026: {
      netSalary: employeePayrollRow?.netSalary ?? employeePayrollRow?.net_salary ?? null,
      ticketRevenue: employeePayrollRow?.ticketRevenue ?? employeePayrollRow?.ticket_revenue ?? null,
      sections: payrollReport?.branchSections?.[subject.id] ?? payrollReport?.sections ?? null,
      rawRow: employeePayrollRow,
    },
    raw: { invoices, attendance, adjustments },
  }
}

function simulateEmployeeVisibility({
  employeeId,
  sessionBranch,
  invoices,
  attendance,
  adjustments,
  labelPrefix = '',
}) {
  const invoiceItems = invoices.map((inv) => ({
    branchId: inv.branchId,
    employeeId: inv.employeeId,
  }))
  const attItems = attendance.map((row) => ({
    branchId: row.branchId,
    employeeId: row.employeeId,
  }))
  const adjItems = adjustments.map((row) => ({
    branchId: row.branchId,
    employeeId: row.employeeId,
  }))

  const roles = [
    {
      label: `${labelPrefix}Employee (@ ${sessionBranch})`,
      user: { role: 'employee', branch: sessionBranch, employeeId, employeeName: labelPrefix.trim() },
    },
    {
      label: 'QL Trạm Spa (tram-spa)',
      user: { role: 'branch_manager', branch: 'tram-spa' },
    },
    {
      label: `QL chi nhánh mới (${sessionBranch})`,
      user: { role: 'branch_manager', branch: sessionBranch },
    },
    {
      label: 'Admin',
      user: { role: 'admin', branch: 'all' },
    },
  ]

  return roles.map(({ label, user }) => {
    setSession(user)
    const scopedInv = filterByUserScope(invoiceItems)
    const scopedAtt = filterByUserScope(attItems)
    const scopedAdj = filterByUserScope(adjItems)
    clearSession()
    const branchKeys = [...new Set([
      ...scopedInv.map((i) => i.branchId),
      ...scopedAtt.map((i) => i.branchId),
    ])]
    const byBranch = Object.fromEntries(branchKeys.map((k) => [k, scopedInv.filter((i) => i.branchId === k).length]))
    const attByBranch = Object.fromEntries(branchKeys.map((k) => [k, scopedAtt.filter((i) => i.branchId === k).length]))
    return {
      role: label,
      invoices: { total: scopedInv.length, byBranch, tramSpa: scopedInv.filter((i) => i.branchId === 'tram-spa').length },
      attendance: { total: scopedAtt.length, byBranch: attByBranch, tramSpa: scopedAtt.filter((i) => i.branchId === 'tram-spa').length },
      payrollAdjustments: { total: scopedAdj.length },
    }
  })
}

async function hydrateLoginCacheFromProduction(sb) {
  const [{ data: credRow }, { data: empRows }] = await Promise.all([
    sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle(),
    sb.from('employees').select('id,name,branch_id,status,position,updated_at'),
  ])
  const payload = credRow?.payload
  if (payload) {
    localStorage.setItem('spa-manager-credentials', JSON.stringify({
      admin: payload.admin ?? 'admin123',
      branches: payload.branches ?? {},
      branchPasswordMeta: payload.branchPasswordMeta ?? {},
      employees: payload.employees ?? {},
    }))
  }
  if (empRows?.length) {
    localStorage.setItem('spa-manager-employees', JSON.stringify(
      empRows.map((row) => normalizeEmployee(rowToCamel(row))),
    ))
  }
}

async function mergeCredentialEmployee(sb, employeeId, entry) {
  const { data: credRow } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
  const payload = credRow?.payload ?? { admin: '', branches: {}, employees: {} }
  payload.employees = payload.employees ?? {}
  payload.employees[employeeId] = entry
  const { error } = await sb.from('app_credentials').upsert({ id: 'singleton', payload })
  if (error) throw new Error(error.message)
}

async function runLifecycleDemo(sb) {
  const steps = []
  const logStep = (name, detail) => {
    steps.push({ step: name, ...detail, at: new Date().toISOString() })
    console.log(`  → ${name}: ${detail.ok ? 'OK' : 'FAIL'}${detail.note ? ` — ${detail.note}` : ''}`)
  }

  const demoName = 'UAT Demo V1'
  const renamedName = 'UAT Demo Renamed'

  // Cleanup previous demo run
  await sb.from('employees').delete().eq('id', UAT_DEMO_ID)

  const { data: credBefore } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
  if (credBefore?.payload?.employees?.[UAT_DEMO_ID]) {
    const nextPayload = { ...credBefore.payload }
    delete nextPayload.employees[UAT_DEMO_ID]
    await sb.from('app_credentials').upsert({ id: 'singleton', payload: nextPayload })
  }

  const defaultPassword = computeEmployeeDefaultPassword(demoName, getPasswordBranchName(UAT_BRANCH_START))
  const hashed = await hashPassword(defaultPassword)

  // 1. Create employee
  const { error: createErr } = await sb.from('employees').upsert({
    id: UAT_DEMO_ID,
    name: demoName,
    branch_id: UAT_BRANCH_START,
    status: 'active',
    position: 'KTV',
    branch_history: [],
    updated_at: new Date().toISOString(),
  })
  logStep('1. Tạo nhân viên mới', { ok: !createErr, note: createErr?.message ?? UAT_DEMO_ID })

  await mergeCredentialEmployee(sb, UAT_DEMO_ID, {
    branchId: UAT_BRANCH_START,
    name: demoName,
    password: hashed,
    customPassword: false,
    passwordUpdatedAt: null,
  })

  // Load production creds for login verify
  await hydrateLoginCacheFromProduction(sb)

  const login1 = await verifyLoginWithUsername({
    role: 'employee',
    username: UAT_DEMO_ID,
    password: defaultPassword,
  })
  logStep('2. Username + Password + Đăng nhập', {
    ok: login1.ok,
    username: UAT_DEMO_ID,
    password: defaultPassword,
    branch: login1.user?.branch,
    note: login1.message,
  })

  // 3. Rename
  const { error: renameErr } = await sb.from('employees').update({
    name: renamedName,
    updated_at: new Date().toISOString(),
  }).eq('id', UAT_DEMO_ID)
  await mergeCredentialEmployee(sb, UAT_DEMO_ID, {
    branchId: UAT_BRANCH_START,
    name: renamedName,
    password: hashed,
    customPassword: false,
  })
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: UAT_DEMO_ID,
    name: renamedName,
    branchId: UAT_BRANCH_START,
    status: 'active',
  }]))
  const login2 = await verifyLoginWithUsername({
    role: 'employee',
    username: UAT_DEMO_ID,
    password: defaultPassword,
  })
  logStep('3. Đổi tên + Đăng nhập lại', {
    ok: login2.ok && !renameErr,
    newName: renamedName,
    note: renameErr?.message ?? login2.message,
  })

  // 4. Transfer
  const transferDate = new Date().toISOString().slice(0, 10)
  const { data: currentEmp } = await sb.from('employees').select('branch_id,branch_history').eq('id', UAT_DEMO_ID).maybeSingle()
  const historyEntry = {
    fromBranchId: UAT_BRANCH_START,
    toBranchId: UAT_BRANCH_TRANSFER,
    effectiveDate: transferDate,
    transferDate,
    reason: 'UAT lifecycle demo',
    approver: 'UAT Script',
  }
  const { error: transferErr } = await sb.from('employees').update({
    branch_id: UAT_BRANCH_TRANSFER,
    branch_history: [...(currentEmp?.branch_history ?? []), historyEntry],
    updated_at: new Date().toISOString(),
  }).eq('id', UAT_DEMO_ID)
  await mergeCredentialEmployee(sb, UAT_DEMO_ID, {
    branchId: UAT_BRANCH_TRANSFER,
    name: renamedName,
    password: hashed,
    customPassword: false,
  })
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: UAT_DEMO_ID,
    name: renamedName,
    branchId: UAT_BRANCH_TRANSFER,
    status: 'active',
  }]))
  const login3 = await verifyLoginWithUsername({
    role: 'employee',
    username: UAT_DEMO_ID,
    password: defaultPassword,
  })
  logStep('4. Chuyển chi nhánh + Đăng nhập lại', {
    ok: login3.ok && !transferErr,
    from: UAT_BRANCH_START,
    to: UAT_BRANCH_TRANSFER,
    sessionBranch: login3.user?.branch,
    note: transferErr?.message ?? login3.message,
  })

  // 5. Resign
  const { error: resignErr } = await sb.from('employees').update({
    status: 'resigned',
    days_off: transferDate,
    updated_at: new Date().toISOString(),
  }).eq('id', UAT_DEMO_ID)
  const { data: credResign } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
  if (credResign?.payload?.employees?.[UAT_DEMO_ID]) {
    const p = { ...credResign.payload }
    delete p.employees[UAT_DEMO_ID]
    await sb.from('app_credentials').upsert({ id: 'singleton', payload: p })
  }
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: UAT_DEMO_ID,
    name: renamedName,
    branchId: UAT_BRANCH_TRANSFER,
    status: 'resigned',
  }]))
  const login4 = await verifyLoginWithUsername({
    role: 'employee',
    username: UAT_DEMO_ID,
    password: defaultPassword,
  })
  logStep('5. Nghỉ việc → không đăng nhập', {
    ok: !login4.ok && !resignErr,
    blocked: !login4.ok,
    note: login4.message ?? 'Login correctly blocked',
  })

  // 6. Reactivate
  const { error: reactErr } = await sb.from('employees').update({
    status: 'active',
    days_off: '',
    updated_at: new Date().toISOString(),
  }).eq('id', UAT_DEMO_ID)
  await mergeCredentialEmployee(sb, UAT_DEMO_ID, {
    branchId: UAT_BRANCH_TRANSFER,
    name: renamedName,
    password: hashed,
    customPassword: false,
  })
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: UAT_DEMO_ID,
    name: renamedName,
    branchId: UAT_BRANCH_TRANSFER,
    status: 'active',
  }]))
  const login5 = await verifyLoginWithUsername({
    role: 'employee',
    username: UAT_DEMO_ID,
    password: defaultPassword,
  })
  logStep('6. Kích hoạt lại + Đăng nhập', {
    ok: login5.ok && !reactErr,
    sessionBranch: login5.user?.branch,
    note: reactErr?.message ?? login5.message,
  })

  return {
    employeeId: UAT_DEMO_ID,
    username: UAT_DEMO_ID,
    defaultPassword,
    steps,
    allOk: steps.every((s) => s.ok),
  }
}

async function captureScreenshots(evidence) {
  let puppeteer
  try {
    puppeteer = await import('puppeteer-core')
  } catch {
    return { skipped: true, reason: 'puppeteer-core not available' }
  }

  const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (!existsSync(CHROME)) {
    return { skipped: true, reason: 'Chrome not found for screenshots' }
  }

  const shots = []
  const browser = await puppeteer.default.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--window-size=1400,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })

  async function waitReady() {
    await page.waitForFunction(
      () => !document.body?.textContent?.includes('Đang tải...'),
      { timeout: 45000 },
    )
  }

  async function loginAs({ role, username = '', password }) {
    await page.goto(PREVIEW, { waitUntil: 'networkidle2', timeout: 60000 })
    await waitReady()
    await page.select('form.login__form select', role)
    if (username) {
      await page.waitForSelector('input[autocomplete="username"]')
      await page.type('input[autocomplete="username"]', username, { delay: 5 })
    }
    await page.type('input[type="password"]', password, { delay: 5 })
    await page.click('button.login__submit')
    await new Promise((r) => setTimeout(r, 4000))
    const ok = await page.evaluate(() => !document.querySelector('.login__form'))
    if (!ok) throw new Error(`Login failed for ${role}/${username}`)
    await waitReady()
  }

  async function snap(name) {
    const file = path.join(OUT_DIR, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    shots.push(file)
    console.log(`  📸 ${path.basename(file)}`)
  }

  try {
    // Cherry employee — navigate to Report if possible
    if (process.env.CHERRY_PASSWORD) {
      await loginAs({ role: 'employee', username: 'tram-spa-cherry', password: process.env.CHERRY_PASSWORD })
      await snap('cherry-employee-after-login')
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.sidebar__nav button, .sidebar__nav a')]
          .find((el) => el.textContent.includes('Báo cáo') || el.textContent.includes('Lương'))
        btn?.click()
      })
      await new Promise((r) => setTimeout(r, 2500))
      await snap('cherry-employee-report')
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'))
        btn?.click()
      })
      await page.waitForSelector('.login__form', { timeout: 15000 })
    } else {
      console.log('  ○ Cherry screenshots skipped — set CHERRY_PASSWORD env')
    }

    await loginAs({ role: 'branch_manager', username: 'tram-spa', password: process.env.TRAM_SPA_PASSWORD ?? 'tramspa' })
    await snap('manager-tram-spa-after-login')
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.sidebar__nav button, .sidebar__nav a')]
        .find((el) => el.textContent.includes('Báo cáo') || el.textContent.includes('Lương'))
      btn?.click()
    })
    await new Promise((r) => setTimeout(r, 2500))
    await snap('manager-tram-spa-report')
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'))
      btn?.click()
    })
    await page.waitForSelector('.login__form', { timeout: 15000 })

    await loginAs({ role: 'branch_manager', username: 'bac-lieu', password: process.env.BAC_LIEU_PASSWORD ?? 'khoespabaclieu' })
    await snap('manager-bac-lieu-after-login')
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.sidebar__nav button, .sidebar__nav a')]
        .find((el) => el.textContent.includes('Báo cáo') || el.textContent.includes('Lương'))
      btn?.click()
    })
    await new Promise((r) => setTimeout(r, 2500))
    await snap('manager-bac-lieu-report')
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'))
      btn?.click()
    })
    await page.waitForSelector('.login__form', { timeout: 15000 })

    await loginAs({ role: 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin123' })
    await snap('admin-after-login')
  } catch (error) {
    shots.push(`ERROR: ${error.message}`)
  } finally {
    await browser.close()
  }

  return { skipped: false, shots }
}

function renderVisibilityTable(lines, rows) {
  lines.push('| Role | Invoices | tram-spa inv | Attendance | tram-spa att | Adjustments |')
  lines.push('|------|--------:|-------------:|-----------:|-------------:|------------:|')
  for (const row of rows) {
    lines.push(`| ${row.role} | ${row.invoices.total} | ${row.invoices.tramSpa ?? 0} | ${row.attendance.total} | ${row.attendance.tramSpa ?? 0} | ${row.payrollAdjustments.total} |`)
  }
  lines.push('')
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# UAT Evidence Report — Employee Lifecycle V1')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Production: ${report.productionUrl}`)
  lines.push(`Preview: ${report.previewUrl}`)
  lines.push('')

  for (const subject of report.subjects) {
    lines.push(`## ${subject.name} (\`${subject.id}\`)`)
    lines.push('')
    lines.push(`| Field | Value |`)
    lines.push(`|-------|-------|`)
    lines.push(`| Current branch (DB) | \`${subject.employee?.branch_id ?? '—'}\` |`)
    lines.push(`| Expected after transfer test | \`${subject.currentBranch}\` |`)
    lines.push(`| Status | ${subject.employee?.status ?? '—'} |`)
    lines.push(`| Branch history entries | ${(subject.employee?.branch_history ?? []).length} |`)
    if (subject.employee?.branch_history?.length) {
      lines.push('')
      lines.push('**Branch history (Production):**')
      for (const entry of subject.employee.branch_history) {
        lines.push(`- ${entry.effectiveDate ?? entry.transferDate}: ${entry.fromBranchId ?? '?'} → ${entry.toBranchId ?? '?'}`)
      }
    }
    lines.push('')
    lines.push('### Số liệu Production')
    lines.push('')
    lines.push('| Metric | Total | By branch |')
    lines.push('|--------|------:|-----------|')
    const c = subject.counts
    lines.push(`| **Invoice** | ${c.invoices.total} | ${JSON.stringify(c.invoices.byBranch)} |`)
    lines.push(`| Invoice T7/2026 | ${c.invoices.july2026} | |`)
    lines.push(`| **Attendance** | ${c.attendance.total} | ${JSON.stringify(c.attendance.byBranch)} |`)
    lines.push(`| Attendance T7/2026 | ${c.attendance.july2026} | |`)
    lines.push(`| **Payroll adjustments** | ${c.payrollAdjustments.total} | ${JSON.stringify(c.payrollAdjustments.byBranch)} |`)
    lines.push(`| **Customer Requested** | ${c.customerRequested.invoiceCount} invoices | |`)
    lines.push(`| **Activity Log** | ${c.activityLog.total} | audit=${c.activityLog.employeeAudit}, profile=${c.activityLog.profileAudit} |`)
    lines.push('')
    lines.push('### Payroll T7/2026 (computed from Production data)')
    lines.push('')
    lines.push(`- Net salary: **${report.formatCurrency(subject.payrollJuly2026.netSalary)}**`)
    lines.push(`- Ticket revenue: **${report.formatCurrency(subject.payrollJuly2026.ticketRevenue)}**`)
    lines.push('')
  }

  if (report.cherryVisibility) {
    lines.push('## Cherry — Phạm vi nhìn theo vai trò (giả lập session @ bac-lieu, data Production)')
    lines.push('')
    lines.push('> **Lưu ý DB:** Cherry hiện tại đang ở `tram-spa` (đã chuyển ngược từ bac-lieu). Bảng dưới mô phỏng **sau khi chuyển sang bac-lieu** với Record Branch giữ nguyên.')
    lines.push('')
    renderVisibilityTable(lines, report.cherryVisibility)
  }

  if (report.trucLyVisibility) {
    lines.push('## Trúc Ly — Phạm vi nhìn theo vai trò (giả lập session @ soc-trang, data Production)')
    lines.push('')
    lines.push('> **Lưu ý DB:** Trúc Ly hiện tại đang ở `tram-spa`. Bảng mô phỏng session @ soc-trang.')
    lines.push('')
    renderVisibilityTable(lines, report.trucLyVisibility)
  }

  lines.push('## Lifecycle Demo (Production — `uat-lifecycle-v1-demo`)')
  lines.push('')
  lines.push(`| Step | OK | Detail |`)
  lines.push(`|------|:--:|--------|`)
  for (const step of report.lifecycle.steps) {
    lines.push(`| ${step.step} | ${step.ok ? '✓' : '✗'} | ${step.note ?? step.username ?? ''} |`)
  }
  lines.push('')
  lines.push(`- Username: \`${report.lifecycle.username}\``)
  lines.push(`- Password (default): \`${report.lifecycle.defaultPassword}\``)
  lines.push(`- All steps OK: **${report.lifecycle.allOk ? 'YES' : 'NO'}**`)
  lines.push('')

  if (report.screenshots?.shots?.length) {
    lines.push('## Screenshots')
    lines.push('')
    for (const shot of report.screenshots.shots) {
      if (String(shot).startsWith('ERROR')) {
        lines.push(`- ${shot}`)
      } else {
        lines.push(`- ![${path.basename(shot)}](./${path.basename(shot)})`)
      }
    }
  }

  return lines.join('\n')
}

console.log('\n=== UAT Evidence Generation ===\n')

const { url, key, base: productionUrl } = await loadProductionSupabaseEnv()
const sb = createClient(url, key)

console.log('Part 1 — Production data (Cherry / Trúc Ly)\n')
const subjects = []
for (const meta of SUBJECTS) {
  console.log(`  Collecting ${meta.name}...`)
  const evidence = await collectEmployeeEvidence(sb, meta)
  subjects.push({ ...meta, ...evidence })
}

const cherry = subjects.find((s) => s.id === 'tram-spa-cherry')
const cherryVisibility = simulateEmployeeVisibility({
  employeeId: 'tram-spa-cherry',
  sessionBranch: 'bac-lieu',
  labelPrefix: 'Cherry ',
  invoices: cherry.raw.invoices,
  attendance: cherry.raw.attendance,
  adjustments: cherry.raw.adjustments,
})

const trucLy = subjects.find((s) => s.id === 'tram-spa-truc-ly')
const trucLyVisibility = simulateEmployeeVisibility({
  employeeId: 'tram-spa-truc-ly',
  sessionBranch: 'soc-trang',
  labelPrefix: 'Trúc Ly ',
  invoices: trucLy.raw.invoices,
  attendance: trucLy.raw.attendance,
  adjustments: trucLy.raw.adjustments,
})

console.log('\nPart 2 — Cherry role visibility (computed)\n')
for (const row of cherryVisibility) {
  console.log(`  ${row.role}: invoices=${row.invoices.total} (tram-spa=${row.invoices.tramSpa}, bac-lieu=${row.invoices.bacLieu})`)
}

console.log('\nPart 3 — Lifecycle demo on Production (uat-lifecycle-v1-demo)\n')
const lifecycle = await runLifecycleDemo(sb)

console.log('\nPart 4 — Screenshots (Preview + Production backend)\n')
const screenshots = await captureScreenshots()

const formatCurrency = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value))
}

const report = {
  generatedAt: new Date().toISOString(),
  productionUrl,
  previewUrl: PREVIEW,
  subjects,
  cherryVisibility,
  trucLyVisibility,
  lifecycle,
  screenshots,
  formatCurrency,
}

const jsonPath = path.join(OUT_DIR, 'UAT_EVIDENCE_REPORT.json')
const mdPath = path.join(OUT_DIR, 'UAT_EVIDENCE_REPORT.md')
writeFileSync(jsonPath, JSON.stringify(report, null, 2))
writeFileSync(mdPath, renderMarkdown(report))

console.log(`\n✓ Report: ${mdPath}`)
console.log(`✓ JSON:  ${jsonPath}`)
console.log(`\nLifecycle demo: ${lifecycle.allOk ? 'ALL OK' : 'HAS FAILURES'}`)
if (!lifecycle.allOk) process.exitCode = 1
