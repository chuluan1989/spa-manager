/**
 * Apply migration 0046 (kpi_branch_policies) + seed 6 CN policies on Production.
 *
 *   node --env-file=.env.local scripts/apply-0046-kpi-policies-prod.mjs
 *
 * Requires DATABASE_URL. Does NOT touch invoices / payroll / commission.
 * Idempotent: re-run skips seed if branch already has policy from 2026-08-01.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = path.join(ROOT, 'docs/uat-evidence/kpi-policy-migration-prod', STAMP)
mkdirSync(OUT, { recursive: true })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const SCOPE_BRANCHES = [
  'tram-spa',
  'soc-trang',
  'song-khoe-spa',
  'bac-lieu',
  'tra-vinh',
  'vinh-long',
]
const EXCLUDED = ['gia-lai-1', 'gia-lai-2']
const EFFECTIVE_FROM = '2026-08-01'
const REASON = 'Khởi tạo chính sách KPI nhân viên - Aug 2026'
const TARGETS = { addon: 0.7, advanced: 0.1, combo: 0.3, requested: 0.2 }

function toIsoDate(value) {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s.slice(0, 10)
}

const report = {
  startedAt: new Date().toISOString(),
  outDir: OUT,
  before: {},
  migration: {},
  seed: {},
  after: {},
  safety: {},
  ok: true,
}

function fail(step, err) {
  report.ok = false
  report.error = { step, message: err?.message || String(err) }
  console.error(`✗ ${step}:`, report.error.message)
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
})

async function tableExists(name) {
  const rows = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
  `
  return rows.length > 0
}

async function safetySnapshot(label) {
  const invoiceCount = await sql`select count(*)::int as n from public.invoices`
  const payrollAdj = await tableExists('payroll_adjustments')
    ? await sql`select count(*)::int as n from public.payroll_adjustments`
    : [{ n: -1 }]
  const commission = await tableExists('branch_commission_policies')
    ? await sql`select count(*)::int as n from public.branch_commission_policies`
    : [{ n: -1 }]
  const kpiPoliciesExists = await tableExists('kpi_branch_policies')
  const kpiLogsExists = await tableExists('kpi_policy_change_logs')
  let kpiPolicies = []
  let kpiLogs = 0
  if (kpiPoliciesExists) {
    kpiPolicies = await sql`select id, branch_id, effective_from, effective_to, addon_target, advanced_target, combo_target, requested_target, status, change_reason from public.kpi_branch_policies order by branch_id, effective_from`
  }
  if (kpiLogsExists) {
    const logs = await sql`select count(*)::int as n from public.kpi_policy_change_logs`
    kpiLogs = logs[0].n
  }
  const snap = {
    invoices: invoiceCount[0].n,
    payroll_adjustments: payrollAdj[0].n,
    branch_commission_policies: commission[0].n,
    kpi_branch_policies_exists: kpiPoliciesExists,
    kpi_policy_change_logs_exists: kpiLogsExists,
    kpi_branch_policies: kpiPolicies,
    kpi_policy_change_logs_count: kpiLogs,
  }
  writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(snap, null, 2))
  return snap
}

try {
  console.log('\n1) Safety BEFORE…')
  report.before = await safetySnapshot('before')
  console.log('  invoices:', report.before.invoices)
  console.log('  kpi tables exist:', report.before.kpi_branch_policies_exists, report.before.kpi_policy_change_logs_exists)

  console.log('\n2) Apply migration 0046…')
  const migrationPath = path.join(ROOT, 'supabase/migrations/0046_kpi_branch_policies.sql')
  const migrationSql = readFileSync(migrationPath, 'utf8')
  await sql.unsafe(migrationSql)
  report.migration = { applied: true, file: '0046_kpi_branch_policies.sql' }

  const cols = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'kpi_branch_policies'
    order by ordinal_position
  `
  report.migration.columns = cols
  const constraint = await sql`
    select conname from pg_constraint where conname = 'kpi_branch_policies_no_overlap'
  `
  report.migration.noOverlapConstraint = constraint.length > 0
  console.log('  ✓ columns:', cols.map((c) => c.column_name).join(', '))
  console.log('  ✓ no-overlap constraint:', report.migration.noOverlapConstraint)

  console.log('\n3) Seed policies for 6 CN…')
  const seeded = []
  const skipped = []
  for (const branchId of SCOPE_BRANCHES) {
    const existing = await sql`
      select id from public.kpi_branch_policies
      where branch_id = ${branchId}
        and effective_from = ${EFFECTIVE_FROM}::date
    `
    if (existing.length) {
      skipped.push({ branchId, id: existing[0].id, reason: 'already_exists' })
      continue
    }
    const id = `kpi-pol-seed-${branchId}-2026-08-01`
    const policyRow = {
      id,
      branch_id: branchId,
      effective_from: EFFECTIVE_FROM,
      effective_to: null,
      addon_target: TARGETS.addon,
      advanced_target: TARGETS.advanced,
      combo_target: TARGETS.combo,
      requested_target: TARGETS.requested,
      status: 'active',
      created_by: 'system-seed-b1',
      updated_by: 'system-seed-b1',
      change_reason: REASON,
    }
    await sql`
      insert into public.kpi_branch_policies (
        id, branch_id, effective_from, effective_to,
        addon_target, advanced_target, combo_target, requested_target,
        status, created_by, updated_by, change_reason
      ) values (
        ${policyRow.id}, ${policyRow.branch_id}, ${policyRow.effective_from}::date, null,
        ${policyRow.addon_target}, ${policyRow.advanced_target}, ${policyRow.combo_target}, ${policyRow.requested_target},
        ${policyRow.status}, ${policyRow.created_by}, ${policyRow.updated_by}, ${policyRow.change_reason}
      )
    `
    const logId = `kpi-log-seed-${branchId}-2026-08-01`
    await sql`
      insert into public.kpi_policy_change_logs (
        id, branch_id, old_policy, new_policy, effective_from, effective_to, actor_id, reason
      ) values (
        ${logId}, ${branchId}, null, ${sql.json(policyRow)}, ${EFFECTIVE_FROM}::date, null,
        ${'system-seed-b1'}, ${REASON}
      )
    `
    seeded.push({ branchId, id, logId })
  }
  report.seed = { seeded, skipped, excluded: EXCLUDED, targets: TARGETS, effectiveFrom: EFFECTIVE_FROM, reason: REASON }
  console.log(`  ✓ seeded ${seeded.length}, skipped ${skipped.length}`)

  const giaLai = await sql`
    select id, branch_id from public.kpi_branch_policies
    where branch_id in ('gia-lai-1', 'gia-lai-2')
  `
  if (giaLai.length) {
    report.ok = false
    console.error('  ✗ unexpected Gia Lai policies:', giaLai)
  } else {
    console.log('  ✓ no Gia Lai policies')
  }

  console.log('\n4) Safety AFTER…')
  report.after = await safetySnapshot('after')

  report.safety = {
    invoicesUnchanged: report.before.invoices === report.after.invoices,
    payrollUnchanged: report.before.payroll_adjustments === report.after.payroll_adjustments,
    commissionUnchanged: report.before.branch_commission_policies === report.after.branch_commission_policies,
    policyCount: report.after.kpi_branch_policies.length,
    logCount: report.after.kpi_policy_change_logs_count,
    allSixPresent: SCOPE_BRANCHES.every((b) =>
      report.after.kpi_branch_policies.some((p) =>
        p.branch_id === b && toIsoDate(p.effective_from) === EFFECTIVE_FROM,
      ),
    ),
    noGiaLai: !report.after.kpi_branch_policies.some((p) => EXCLUDED.includes(p.branch_id)),
  }

  if (!report.safety.invoicesUnchanged || !report.safety.payrollUnchanged || !report.safety.commissionUnchanged) {
    report.ok = false
    console.error('  ✗ SAFETY FAIL — invoice/payroll/commission counts changed')
  } else {
    console.log('  ✓ invoices/payroll/commission unchanged')
  }
  if (!report.safety.allSixPresent || !report.safety.noGiaLai) {
    report.ok = false
    console.error('  ✗ seed coverage fail', report.safety)
  } else {
    console.log('  ✓ 6 CN policies present, no Gia Lai')
  }
} catch (err) {
  fail('pipeline', err)
} finally {
  await sql.end({ timeout: 5 })
}

report.finishedAt = new Date().toISOString()
const reportPath = path.join(OUT, 'MIGRATION_0046_REPORT.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))
writeFileSync(
  path.join(ROOT, 'docs/uat-evidence/kpi-policy-migration-prod/LATEST_REPORT.json'),
  JSON.stringify(report, null, 2),
)
console.log('\nReport:', reportPath)
console.log('PASS:', report.ok)
process.exit(report.ok ? 0 : 1)
