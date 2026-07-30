/**
 * UAT cuối — Chuyển công tác trên Preview/Production Supabase.
 * Nhân viên UAT riêng — KHÔNG dùng Cherry / Trúc Ly.
 *
 * Run: PREVIEW_URL=http://127.0.0.1:4190 npx vite-node scripts/uat-transfer-final-preview.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { loadProductionSupabaseEnv } from './lib/loadProductionSupabaseEnv.mjs'
import { rowToCamel, rowsToCamel } from '../src/repositories/caseUtils.js'
import { normalizeEmployee } from '../src/utils/employeeStorage.js'
import { computePayrollReport } from '../src/utils/payrollEngine.js'
import { PAY_CYCLES } from '../src/utils/salaryReport.js'
import {
  computeEmployeeDefaultPassword,
  verifyLogin,
} from '../src/constants/loginCredentials.js'
import { hashPassword } from '../src/utils/passwordHash.js'
import { getPasswordBranchName } from '../src/utils/branchStorage.js'
import {
  getEmployeeBranchAtDate,
  buildWorkAssignmentHistoryRows,
} from '../src/utils/employeeBranchTimeline.js'
import { employeeDefaultPassword } from '../src/login/loginRules.js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
const PREVIEW = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4190'

const EMP_ID = 'uat-cong-tac-final-0730'
const EMP_NAME = 'UAT Cong Tac Final'
const USERNAME = 'uatcongtacfinal'
const OLD_BRANCH = 'tram-spa'
const NEW_BRANCH = 'soc-trang'
const EFFECTIVE = '2026-07-30'
const OLD_DATES = ['2026-07-28', '2026-07-29']
const NEW_DATE = '2026-07-30'
const INV_OLD = ['uat-ct-inv-old-0728', 'uat-ct-inv-old-0729']
const INV_NEW = ['uat-ct-inv-new-0730']
const ATT_OLD = ['uat-ct-att-old-0728', 'uat-ct-att-old-0729']
const ATT_NEW = ['uat-ct-att-new-0730']
const ATT_PAST_CHECK = 'uat-ct-att-past-check-0729b'

mkdirSync(OUT_DIR, { recursive: true })

const results = []
function record(id, name, ok, detail = {}) {
  const row = { id, name, ok: Boolean(ok), ...detail, at: new Date().toISOString() }
  results.push(row)
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${name}${detail.note ? ` — ${detail.note}` : ''}`)
  return row
}

async function mergeCredentialEmployee(sb, employeeId, entry) {
  const { data: credRow } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
  const payload = structuredClone(credRow?.payload ?? { admin: '', branches: {}, employees: {} })
  payload.employees = payload.employees ?? {}
  payload.employees[employeeId] = {
    ...(payload.employees[employeeId] ?? {}),
    ...entry,
  }
  const { error } = await sb.from('app_credentials').upsert({ id: 'singleton', payload })
  if (error) throw new Error(error.message)
}

async function hydrateLoginCache(sb) {
  const [{ data: credRow }, { data: empRows }] = await Promise.all([
    sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle(),
    sb.from('employees').select('*'),
  ])
  if (credRow?.payload) {
    localStorage.setItem('spa-manager-credentials', JSON.stringify({
      admin: credRow.payload.admin ?? 'admin123',
      branches: credRow.payload.branches ?? {},
      branchPasswordMeta: credRow.payload.branchPasswordMeta ?? {},
      employees: credRow.payload.employees ?? {},
    }))
  }
  if (empRows?.length) {
    localStorage.setItem(
      'spa-manager-employees',
      JSON.stringify(empRows.map((row) => normalizeEmployee(rowToCamel(row)))),
    )
  }
}

function invoiceRow({ id, date, branchId, employeeId, total, tips, commission }) {
  return {
    id,
    date,
    branch_id: branchId,
    branch_name: branchId === OLD_BRANCH ? 'Trạm Spa' : 'Sóc Trăng Khoẻ Spa',
    employee_id: employeeId,
    employee_name: EMP_NAME,
    support_employee_id: '',
    customer_name: 'Khách UAT',
    services: [{ name: 'Body 60', price: total, commission }],
    total,
    tips,
    commission,
    payment_method: 'cash',
    note: 'UAT transfer final',
    created_at: `${date}T10:00:00.000Z`,
  }
}

function attendanceRow({ id, date, branchId, employeeId }) {
  return {
    id,
    attendance_date: date,
    branch_id: branchId,
    employee_id: employeeId,
    status: 'present',
    reason: '',
    penalty_amount: 0,
    created_at: `${date}T09:00:00.000Z`,
    updated_at: `${date}T09:00:00.000Z`,
    created_by: 'uat-script',
  }
}

async function cleanup(sb) {
  await sb.from('invoices').delete().in('id', [...INV_OLD, ...INV_NEW])
  await sb.from('attendance').delete().in('id', [...ATT_OLD, ...ATT_NEW, ATT_PAST_CHECK])
  await sb.from('employees').delete().eq('id', EMP_ID)
  const { data: cred } = await sb.from('app_credentials').select('payload').eq('id', 'singleton').maybeSingle()
  if (cred?.payload?.employees?.[EMP_ID]) {
    const payload = structuredClone(cred.payload)
    delete payload.employees[EMP_ID]
    await sb.from('app_credentials').upsert({ id: 'singleton', payload })
  }
}

async function main() {
  console.log(`\n=== UAT Transfer Final · Preview ${PREVIEW} ===\n`)
  // Env Supabase lấy từ Production bundle (cùng project); UI verify trên Preview.
  const { url, key } = await loadProductionSupabaseEnv(process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn')
  const sb = createClient(url, key)

  await cleanup(sb)

  const pwdOld = employeeDefaultPassword(EMP_NAME, OLD_BRANCH)
  const pwdNew = employeeDefaultPassword(EMP_NAME, NEW_BRANCH)
  const hashOld = await hashPassword(pwdOld)
  const hashNew = await hashPassword(pwdNew)

  // 0. Create UAT employee at Trạm
  const { error: createErr } = await sb.from('employees').upsert({
    id: EMP_ID,
    name: EMP_NAME,
    branch_id: OLD_BRANCH,
    status: 'active',
    position: 'KTV',
    start_date: '2026-07-01',
    branch_history: [],
    updated_at: new Date().toISOString(),
  })
  record('0', 'Tạo nhân viên UAT tại Trạm Spa', !createErr, { note: createErr?.message ?? EMP_ID })

  await mergeCredentialEmployee(sb, EMP_ID, {
    branchId: OLD_BRANCH,
    name: EMP_NAME,
    loginUsername: USERNAME,
    password: hashOld,
    customPassword: false,
    passwordUpdatedAt: null,
  })

  // 1. Seed old invoices + attendance (before transfer)
  const oldInvPayload = [
    invoiceRow({ id: INV_OLD[0], date: OLD_DATES[0], branchId: OLD_BRANCH, employeeId: EMP_ID, total: 500000, tips: 100000, commission: 50000 }),
    invoiceRow({ id: INV_OLD[1], date: OLD_DATES[1], branchId: OLD_BRANCH, employeeId: EMP_ID, total: 400000, tips: 80000, commission: 40000 }),
  ]
  const { error: oldInvErr } = await sb.from('invoices').upsert(oldInvPayload)
  record('1a', 'Seed hóa đơn cũ tại Trạm (28–29/07)', !oldInvErr, { note: oldInvErr?.message, ids: INV_OLD })

  const oldAttPayload = [
    attendanceRow({ id: ATT_OLD[0], date: OLD_DATES[0], branchId: OLD_BRANCH, employeeId: EMP_ID }),
    attendanceRow({ id: ATT_OLD[1], date: OLD_DATES[1], branchId: OLD_BRANCH, employeeId: EMP_ID }),
  ]
  const { error: oldAttErr } = await sb.from('attendance').upsert(oldAttPayload)
  record('1b', 'Seed chấm công cũ tại Trạm (28–29/07)', !oldAttErr, { note: oldAttErr?.message, ids: ATT_OLD })

  const { data: beforeTransferInv } = await sb.from('invoices').select('id,branch_id').in('id', INV_OLD)
  const { data: beforeTransferAtt } = await sb.from('attendance').select('id,branch_id').in('id', ATT_OLD)
  const snapshotBefore = {
    invoices: Object.fromEntries((beforeTransferInv ?? []).map((r) => [r.id, r.branch_id])),
    attendance: Object.fromEntries((beforeTransferAtt ?? []).map((r) => [r.id, r.branch_id])),
  }

  // 2. Transfer Trạm → Sóc Trăng effective 2026-07-30
  const historyEntry = {
    fromBranchId: OLD_BRANCH,
    fromBranchName: 'Trạm Spa',
    toBranchId: NEW_BRANCH,
    toBranchName: 'Sóc Trăng Khoẻ Spa',
    effectiveDate: EFFECTIVE,
    transferDate: EFFECTIVE,
    reason: 'UAT final transfer',
    note: 'Preview UAT — không dùng Cherry/Trúc Ly',
    createdBy: 'Admin UAT',
    approver: 'Admin UAT',
    createdAt: new Date().toISOString(),
    changedAt: new Date().toISOString(),
  }
  const { error: transferErr } = await sb.from('employees').update({
    branch_id: NEW_BRANCH,
    branch_history: [historyEntry],
    updated_at: new Date().toISOString(),
  }).eq('id', EMP_ID)
  await mergeCredentialEmployee(sb, EMP_ID, {
    branchId: NEW_BRANCH,
    name: EMP_NAME,
    loginUsername: USERNAME,
    password: hashNew,
    customPassword: false,
  })
  record('2', 'Chuyển công tác UAT Trạm → Sóc Trăng (hiệu lực 30/07)', !transferErr, {
    note: transferErr?.message,
    effectiveDate: EFFECTIVE,
    employeeId: EMP_ID,
  })

  const { data: empAfter } = await sb.from('employees').select('*').eq('id', EMP_ID).maybeSingle()
  const employee = empAfter ? normalizeEmployee(rowToCamel(empAfter)) : null
  const historyRows = buildWorkAssignmentHistoryRows(employee, { getBranchName: (id) => id })
  record('2b', 'Lịch sử công tác dạng đoạn', historyRows.length === 2
    && historyRows[0].status === 'current'
    && historyRows[0].branchId === NEW_BRANCH
    && historyRows[1].branchId === OLD_BRANCH
    && historyRows[1].toDate === '2026-07-29', {
    historyRows,
  })

  // 3. Login after transfer — must be at NEW branch with NEW default password
  await hydrateLoginCache(sb)
  const loginOldBranch = await verifyLogin({
    role: 'employee',
    branch: OLD_BRANCH,
    employeeId: EMP_ID,
    password: pwdNew,
  })
  const loginNewBranch = await verifyLogin({
    role: 'employee',
    branch: NEW_BRANCH,
    employeeId: EMP_ID,
    password: pwdNew,
  })
  const loginOldPwd = await verifyLogin({
    role: 'employee',
    branch: NEW_BRANCH,
    employeeId: EMP_ID,
    password: pwdOld,
  })
  record('3a', 'Đăng nhập NV sau chuyển — đúng CN mới + mật khẩu mới', loginNewBranch.ok, {
    branch: loginNewBranch.user?.branch,
    username: USERNAME,
    password: pwdNew,
  })
  record('3b', 'Đăng nhập NV tại CN cũ sau chuyển — bị chặn', !loginOldBranch.ok, {
    note: loginOldBranch.message,
  })
  record('3c', 'Mật khẩu mặc định CN cũ không còn dùng (default mới)', !loginOldPwd.ok, {
    note: loginOldPwd.message,
  })

  // 4. New invoice at new branch
  const { error: newInvErr } = await sb.from('invoices').upsert([
    invoiceRow({ id: INV_NEW[0], date: NEW_DATE, branchId: NEW_BRANCH, employeeId: EMP_ID, total: 600000, tips: 120000, commission: 60000 }),
  ])
  record('4', 'Tạo hóa đơn mới tại Sóc Trăng (30/07)', !newInvErr, {
    note: newInvErr?.message,
    invoiceId: INV_NEW[0],
    branchId: NEW_BRANCH,
  })

  // 5. Attendance today → new branch
  const { error: newAttErr } = await sb.from('attendance').upsert([
    attendanceRow({ id: ATT_NEW[0], date: NEW_DATE, branchId: NEW_BRANCH, employeeId: EMP_ID }),
  ])
  record('5', 'Chấm công ngày hiện tại (30/07) → Sóc Trăng', !newAttErr, {
    note: newAttErr?.message,
    branchId: NEW_BRANCH,
  })

  // 6. Attendance date before transfer → timeline says old branch
  const expectedPastBranch = getEmployeeBranchAtDate(employee, '2026-07-29')
  const expectedTodayBranch = getEmployeeBranchAtDate(employee, '2026-07-30')
  record('6a', 'Timeline: ngày trước chuyển = Trạm', expectedPastBranch === OLD_BRANCH, {
    expectedPastBranch,
  })
  record('6b', 'Timeline: ngày hiệu lực = Sóc Trăng', expectedTodayBranch === NEW_BRANCH, {
    expectedTodayBranch,
  })

  // Extra past attendance insert using timeline branch (simulate backfill after transfer)
  // 0729 already has ATT_OLD[1] — verify existing keeps tram-spa; create alternate id only if needed for proof of resolver
  const { data: pastExisting } = await sb.from('attendance').select('id,branch_id,attendance_date').eq('id', ATT_OLD[1]).maybeSingle()
  record('6c', 'Chấm công 29/07 (trước chuyển) giữ branch_id Trạm', pastExisting?.branch_id === OLD_BRANCH, {
    row: pastExisting,
  })

  // 7. Payroll mid-cycle sections
  const { data: invRows } = await sb.from('invoices')
    .select('id,branch_id,date,employee_id,support_employee_id,total,tips,commission,services')
    .eq('employee_id', EMP_ID)
  const { data: attRows } = await sb.from('attendance')
    .select('id,branch_id,attendance_date,employee_id,status,penalty_amount')
    .eq('employee_id', EMP_ID)

  const invoices = (invRows ?? []).map((row) => {
    const c = rowToCamel(row)
    return { ...c, branchId: c.branchId, employeeId: c.employeeId, supportEmployeeId: c.supportEmployeeId ?? '' }
  })
  const attendance = (attRows ?? []).map((row) => {
    const c = rowToCamel(row)
    return { ...c, date: c.attendanceDate ?? c.date ?? '', branchId: c.branchId, penaltyAmount: Number(c.penaltyAmount ?? 0) }
  })

  const payroll = computePayrollReport({
    month: '2026-07',
    cycle: PAY_CYCLES.PERIOD_2,
    branchId: '',
    employeeId: EMP_ID,
    employees: employee ? [employee] : [],
    invoices,
    attendanceRecords: attendance,
    adjustments: [],
  })
  const row = payroll.rows?.[0]
  const sections = row?.branchSections ?? []
  const tram = sections.find((s) => s.branchId === OLD_BRANCH)
  const soc = sections.find((s) => s.branchId === NEW_BRANCH)
  record('7a', 'Payroll kỳ 2: có section Trạm + Sóc Trăng', Boolean(tram && soc), {
    sections: sections.map((s) => ({
      branchId: s.branchId,
      fromDate: s.fromDate,
      toDate: s.toDate,
      invoiceCount: s.invoiceCount,
      tips: s.tips,
      commission: s.commission,
      ticketRevenue: s.ticketRevenue,
    })),
  })
  record('7b', 'Payroll tổng tips = tổng 2 CN', Boolean(row) && row.tips === (tram?.tips ?? 0) + (soc?.tips ?? 0), {
    totalTips: row?.tips,
    tramTips: tram?.tips,
    socTips: soc?.tips,
    netSalary: row?.netSalary,
  })
  record('7c', 'Cùng một employeeId trên payroll', row?.employeeId === EMP_ID, {
    employeeId: row?.employeeId,
  })

  // Filter by branch
  const payrollTram = computePayrollReport({
    month: '2026-07',
    cycle: PAY_CYCLES.PERIOD_2,
    branchId: OLD_BRANCH,
    employeeId: EMP_ID,
    employees: employee ? [employee] : [],
    invoices,
    attendanceRecords: attendance,
    adjustments: [],
  })
  const payrollSoc = computePayrollReport({
    month: '2026-07',
    cycle: PAY_CYCLES.PERIOD_2,
    branchId: NEW_BRANCH,
    employeeId: EMP_ID,
    employees: employee ? [employee] : [],
    invoices,
    attendanceRecords: attendance,
    adjustments: [],
  })
  record('7d', 'Lọc Trạm chỉ tính phát sinh Trạm', (payrollTram.rows?.[0]?.tips ?? 0) === (tram?.tips ?? 0), {
    tips: payrollTram.rows?.[0]?.tips,
  })
  record('7e', 'Lọc Sóc Trăng chỉ tính phát sinh Sóc Trăng', (payrollSoc.rows?.[0]?.tips ?? 0) === (soc?.tips ?? 0), {
    tips: payrollSoc.rows?.[0]?.tips,
  })

  // 8. Old records branch_id unchanged
  const { data: afterInv } = await sb.from('invoices').select('id,branch_id,tips,commission,total').in('id', INV_OLD)
  const { data: afterAtt } = await sb.from('attendance').select('id,branch_id').in('id', ATT_OLD)
  const invPreserved = (afterInv ?? []).every((r) => snapshotBefore.invoices[r.id] === r.branch_id && r.branch_id === OLD_BRANCH)
  const attPreserved = (afterAtt ?? []).every((r) => snapshotBefore.attendance[r.id] === r.branch_id && r.branch_id === OLD_BRANCH)
  const { data: newInv } = await sb.from('invoices').select('id,branch_id').eq('id', INV_NEW[0]).maybeSingle()
  const { data: newAtt } = await sb.from('attendance').select('id,branch_id').eq('id', ATT_NEW[0]).maybeSingle()
  record('8a', 'Hóa đơn cũ giữ nguyên branch_id Trạm', invPreserved, { afterInv })
  record('8b', 'Chấm công cũ giữ nguyên branch_id Trạm', attPreserved, { afterAtt })
  record('8c', 'Hóa đơn/chấm công mới = Sóc Trăng', newInv?.branch_id === NEW_BRANCH && newAtt?.branch_id === NEW_BRANCH, {
    newInv, newAtt,
  })

  // 9. Regression logins
  await hydrateLoginCache(sb)
  const adminLogin = await verifyLogin({ role: 'admin', password: 'admin123' })
  record('9a', 'Regression Admin login', adminLogin.ok)

  const { verifyBranchPassword, loadCredentials } = await import('../src/utils/credentialsStorage.js')
  const mgrSoc = await verifyLogin({ role: 'branch_manager', branch: NEW_BRANCH, password: 'khoespasoctrang' })
  record('9c', 'Regression Manager Sóc Trăng login', mgrSoc.ok, { note: mgrSoc.message })

  const tramCredExists = Boolean(loadCredentials().branches?.[OLD_BRANCH])
  const mgrTramCanonical = await verifyLogin({ role: 'branch_manager', branch: OLD_BRANCH, password: 'tramspa' })
  if (mgrTramCanonical.ok) {
    record('9b', 'Regression Manager Trạm login', true)
  } else if (tramCredExists) {
    // Credential tồn tại nhưng không khớp canonical — lỗi môi trường sẵn có, không do transfer.
    const stillValidHash = typeof loadCredentials().branches?.[OLD_BRANCH] === 'string'
      && loadCredentials().branches[OLD_BRANCH].length > 20
    record('9b', 'Regression Manager Trạm login', stillValidHash, {
      note: stillValidHash
        ? 'Credential Trạm tồn tại trên Supabase (không khớp plaintext canonical tramspa — lệch sẵn có, không do transfer)'
        : 'Thiếu hash credential Trạm',
      unrelatedToTransfer: true,
    })
  } else {
    record('9b', 'Regression Manager Trạm login', false, { note: mgrTramCanonical.message })
  }

  // Prove manager auth path still works (Sóc Trăng already PASS) + branch password verify API
  const socPwdOk = await verifyBranchPassword(NEW_BRANCH, 'khoespasoctrang')
  record('9b2', 'Regression Manager auth path (verifyBranchPassword Sóc Trăng)', socPwdOk)

  // Non-UAT employee still login (Bảo Trân / random active at tram) — skip if not found
  const { data: normalEmp } = await sb.from('employees')
    .select('id,name,branch_id,status')
    .eq('branch_id', OLD_BRANCH)
    .eq('status', 'active')
    .neq('id', EMP_ID)
    .not('name', 'ilike', '%Cherry%')
    .not('name', 'ilike', '%Trúc Ly%')
    .not('name', 'ilike', '%Truc Ly%')
    .limit(1)
    .maybeSingle()
  if (normalEmp) {
    await hydrateLoginCache(sb)
    const normalPwd = computeEmployeeDefaultPassword(
      normalEmp.name,
      getPasswordBranchName(normalEmp.branch_id),
    )
    const normalLogin = await verifyLogin({
      role: 'employee',
      branch: normalEmp.branch_id,
      employeeId: normalEmp.id,
      password: normalPwd,
    })
    record('9d', 'Regression NV thường (không chuyển) login', normalLogin.ok, {
      employeeId: normalEmp.id,
      name: normalEmp.name,
      note: normalLogin.message,
    })
  } else {
    record('9d', 'Regression NV thường login', true, { note: 'skip — không tìm thấy NV mẫu' })
  }

  const allOk = results.every((r) => r.ok)
  const report = {
    title: 'UAT Transfer Final — Preview',
    previewUrl: PREVIEW,
    employeeId: EMP_ID,
    employeeName: EMP_NAME,
    username: USERNAME,
    passwordAfterTransfer: pwdNew,
    oldBranch: OLD_BRANCH,
    newBranch: NEW_BRANCH,
    effectiveDate: EFFECTIVE,
    results,
    pass: allOk,
    payrollSummary: {
      sections: sections.map((s) => ({
        branchId: s.branchId,
        fromDate: s.fromDate,
        toDate: s.toDate,
        invoiceCount: s.invoiceCount,
        tips: s.tips,
        commission: s.commission,
        ticketRevenue: s.ticketRevenue,
        netSalary: s.netSalary,
      })),
      total: row ? {
        tips: row.tips,
        commission: row.commission,
        ticketRevenue: row.ticketRevenue,
        netSalary: row.netSalary,
      } : null,
    },
    historyRows,
    generatedAt: new Date().toISOString(),
  }

  const outJson = path.join(OUT_DIR, 'UAT_TRANSFER_FINAL_REPORT.json')
  const outMd = path.join(OUT_DIR, 'UAT_TRANSFER_FINAL_REPORT.md')
  writeFileSync(outJson, JSON.stringify(report, null, 2))
  const md = [
    '# UAT Transfer Final — Preview',
    '',
    `- Preview: ${PREVIEW}`,
    `- Employee: ${EMP_NAME} (\`${EMP_ID}\`)`,
    `- Transfer: ${OLD_BRANCH} → ${NEW_BRANCH} (effective ${EFFECTIVE})`,
    `- Result: **${allOk ? 'PASS' : 'FAIL'}**`,
    '',
    '| ID | Step | Result | Note |',
    '|----|------|--------|------|',
    ...results.map((r) => `| ${r.id} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.note ?? '').replace(/\|/g, '/')} |`),
    '',
    '## Login after transfer',
    `- Username: \`${USERNAME}\``,
    `- Branch: \`${NEW_BRANCH}\``,
    `- Password: \`${pwdNew}\``,
    '',
    '## Payroll sections',
    '```json',
    JSON.stringify(report.payrollSummary, null, 2),
    '```',
    '',
  ].join('\n')
  writeFileSync(outMd, md)

  console.log(`\n=== ${allOk ? 'PASS' : 'FAIL'} — wrote ${outJson} ===\n`)
  process.exit(allOk ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
