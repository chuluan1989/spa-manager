/**
 * Revert KPI UAT Ly Ly 08/2026 Kỳ 1 về 0 bằng dòng đảo (không xóa audit cũ).
 * Lý do: "Hoàn tác dữ liệu UAT trước khi đưa vào vận hành."
 *
 * Run: node --env-file=.env.development.local scripts/revert-lyly-kpi-uat.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseWriteClient } from './lib/supabaseCredentialsWrite.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/admin-payroll-board-local')
mkdirSync(OUT, { recursive: true })

const REASON = 'Hoàn tác dữ liệu UAT trước khi đưa vào vận hành.'
const MONTH = '2026-08'
const FROM = '2026-08-01'
const TO = '2026-08-15'
const EMP_NAME = 'Ly Ly'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Thiếu env Supabase')
  process.exit(1)
}

const { client, mode } = createSupabaseWriteClient({ url, anonKey })
console.log('writeMode', mode)

const { data: employees, error: e1 } = await client.from('employees').select('id, name, branch_id')
if (e1) throw new Error(e1.message)
const lyly = (employees ?? []).find((row) => String(row.name || '').trim() === EMP_NAME
  && (row.branch_id === 'soc-trang' || !row.branch_id))
  || (employees ?? []).find((row) => String(row.name || '').trim() === EMP_NAME)
if (!lyly) throw new Error('Không tìm thấy Ly Ly')

const { data: adjs, error: e2 } = await client
  .from('payroll_adjustments')
  .select('*')
  .eq('employee_id', lyly.id)
  .eq('type', 'kpi')
  .eq('month', MONTH)
if (e2) throw new Error(e2.message)

const inPeriod = (adjs ?? []).filter((row) => {
  const d = String(row.date || '').slice(0, 10)
  return d >= FROM && d <= TO
})
const oldKpi = inPeriod.reduce((s, row) => s + Number(row.amount ?? 0), 0)
console.log({ employeeId: lyly.id, oldKpi, rows: inPeriod.length })

const report = {
  generatedAt: new Date().toISOString(),
  employeeId: lyly.id,
  employeeName: EMP_NAME,
  month: MONTH,
  oldKpi,
  action: null,
}

if (oldKpi === 0) {
  report.action = 'noop'
  report.message = 'KPI đã = 0 — không cần hoàn tác'
  writeFileSync(path.join(OUT, 'REVERT_LYLY_KPI_REPORT.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const delta = -oldKpi
const adjId = `payadj-${Date.now()}-uatrev`
const auditId = `payaudit-${Date.now()}-uatrev`
const now = new Date().toISOString()

const adjustment = {
  id: adjId,
  date: TO,
  month: MONTH,
  branch_id: lyly.branch_id || 'soc-trang',
  employee_id: lyly.id,
  employee_name: EMP_NAME,
  type: 'kpi',
  amount: delta,
  reason: REASON,
  note: 'Đưa KPI về 0',
  expense_id: '',
  payroll_cycle: 'period1',
  created_by: 'admin',
  created_by_name: 'Admin',
  created_at: now,
  updated_at: now,
}

const fieldBase = {
  employeeId: lyly.id,
  employeeName: EMP_NAME,
  branchId: lyly.branch_id || 'soc-trang',
  payrollPeriod: `${MONTH}/period1`,
  month: MONTH,
  cycle: 'period1',
  fieldChanged: 'kpi',
  adjustmentId: adjId,
  note: 'Đưa KPI về 0',
}

const audit = {
  id: auditId,
  entity_type: 'payroll_field',
  entity_id: lyly.id,
  action: 'set_kpi',
  editor_id: 'admin',
  editor_name: 'Admin',
  old_value: { ...fieldBase, value: oldKpi },
  new_value: { ...fieldBase, value: 0, difference: delta },
  reason: REASON,
  created_at: now,
}

const { error: e3 } = await client.from('payroll_adjustments').insert(adjustment)
if (e3) throw new Error(`insert adjustment: ${e3.message}`)

const { error: e4 } = await client.from('payroll_audit_logs').insert(audit)
if (e4) throw new Error(`insert audit: ${e4.message}`)

// Also keep a create audit on the reverse line for history of the adjustment itself
const { error: e5 } = await client.from('payroll_audit_logs').insert({
  id: `payaudit-${Date.now()}-uatrev2`,
  entity_type: 'payroll_adjustment',
  entity_id: adjId,
  action: 'create',
  editor_id: 'admin',
  editor_name: 'Admin',
  old_value: {},
  new_value: {
    id: adjId,
    date: TO,
    month: MONTH,
    branchId: lyly.branch_id || 'soc-trang',
    employeeId: lyly.id,
    employeeName: EMP_NAME,
    type: 'kpi',
    amount: delta,
    reason: REASON,
    note: 'Đưa KPI về 0',
  },
  reason: REASON,
  created_at: now,
})
if (e5) console.warn('create-adj audit warn', e5.message)

report.action = 'reverted'
report.delta = delta
report.newKpi = 0
report.adjustmentId = adjId
report.auditId = auditId
report.reason = REASON

writeFileSync(path.join(OUT, 'REVERT_LYLY_KPI_REPORT.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
