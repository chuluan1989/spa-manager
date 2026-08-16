/**
 * Apply migration 0047 (payroll_adjustments.source / category) — schema only.
 * Idempotent. Không void / không sửa amount.
 *
 *   node --env-file=.env.local scripts/apply-0047-payroll-penalty-source.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')
mkdirSync(OUT_DIR, { recursive: true })
const OUT = path.join(OUT_DIR, 'MIGRATION_0047_APPLY_REPORT.json')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const sqlPath = path.join(ROOT, 'supabase/migrations/0047_payroll_adjustment_penalty_source.sql')
const ddl = readFileSync(sqlPath, 'utf8')

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
})

const report = {
  at: new Date().toISOString(),
  migration: '0047_payroll_adjustment_penalty_source.sql',
  ok: false,
  before: {},
  after: {},
  sampleLegacy: [],
}

try {
  const colsBefore = await sql`
    select column_name, data_type, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payroll_adjustments'
      and column_name in ('source', 'category')
    order by column_name
  `
  report.before.columns = colsBefore

  await sql.unsafe(ddl)

  const colsAfter = await sql`
    select column_name, data_type, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payroll_adjustments'
      and column_name in ('source', 'category')
    order by column_name
  `
  report.after.columns = colsAfter

  const counts = await sql`
    select
      count(*)::int as total,
      count(*) filter (where source = 'manual')::int as source_manual,
      count(*) filter (where category = 'other')::int as category_other,
      count(*) filter (where amount <> 0 and type = 'penalty')::int as penalty_nonzero
    from public.payroll_adjustments
  `
  report.after.counts = counts[0]

  const sample = await sql`
    select id, employee_name, date, amount, reason, note, source, category
    from public.payroll_adjustments
    where id in (
      'payadj-1786800377253-nbeu8b',
      'payadj-1786800394617-1l6bpo',
      'payadj-1786800211581-6opqia',
      'payadj-1786800229645-v048cg',
      'payadj-1786800135828-rsb024'
    )
    order by date
  `
  report.sampleLegacy = sample
  report.ok =
    colsAfter.length === 2
    && counts[0].source_manual === counts[0].total
    && sample.every((r) => r.source === 'manual' && r.category === 'other')
    && sample.find((r) => r.id === 'payadj-1786800135828-rsb024')?.amount === 500000

  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    ok: report.ok,
    columns: colsAfter.map((c) => c.column_name),
    totals: counts[0],
    cherry500: sample.find((r) => r.id === 'payadj-1786800135828-rsb024')?.amount,
    out: OUT,
  }, null, 2))
  process.exit(report.ok ? 0 : 1)
} catch (err) {
  report.error = err.message
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.error(err)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
