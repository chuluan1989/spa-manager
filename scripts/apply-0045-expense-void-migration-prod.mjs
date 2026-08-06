/**
 * Production: backup expense tables → migration 0045 → backfill [[VOID]] → clean notes.
 *
 *   node --env-file=.env.local scripts/apply-0045-expense-void-migration-prod.mjs
 *
 * Requires DATABASE_URL (Postgres) for DDL + backfill.
 * Backup cũng ghi JSON qua Supabase anon nếu có VITE_* keys.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = path.join(ROOT, 'docs/uat-evidence/expenses-void-migration-prod', STAMP)
mkdirSync(OUT, { recursive: true })

const DATABASE_URL = process.env.DATABASE_URL
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const VOID_MARKER = '[[VOID]]'

if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL')
  process.exit(1)
}

const report = {
  startedAt: new Date().toISOString(),
  outDir: OUT,
  backup: {},
  migration: {},
  backfill: {},
  cleanup: {},
  verify: {},
  ok: true,
}

function fail(step, err) {
  report.ok = false
  report.error = { step, message: err?.message || String(err) }
  console.error(`✗ ${step}:`, report.error.message)
}

async function fetchAllSupabase(sb, table) {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await sb.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30,
})

try {
  // ---------- 1. Backup ----------
  console.log('\n1) Backup tables…')
  const tables = ['expenses', 'expense_categories', 'branch_fixed_costs', 'expense_change_logs']
  for (const table of tables) {
    try {
      const rows = await sql.unsafe(`select * from public.${table}`)
      const file = path.join(OUT, `backup_${table}.json`)
      writeFileSync(file, JSON.stringify(rows, null, 2))
      report.backup[table] = { count: rows.length, file }
      console.log(`  ✓ ${table}: ${rows.length} rows`)
    } catch (err) {
      // Fallback supabase JSON backup
      if (SUPABASE_URL && SUPABASE_KEY) {
        const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
        const rows = await fetchAllSupabase(sb, table)
        const file = path.join(OUT, `backup_${table}.json`)
        writeFileSync(file, JSON.stringify(rows, null, 2))
        report.backup[table] = { count: rows.length, file, via: 'supabase' }
        console.log(`  ✓ ${table}: ${rows.length} rows (supabase)`)
      } else {
        throw err
      }
    }
  }

  // ---------- 2. Migration 0045 ----------
  console.log('\n2) Apply migration 0045…')
  const migrationPath = path.join(ROOT, 'supabase/migrations/0045_expense_soft_void_and_category_hide.sql')
  const migrationSql = readFileSync(migrationPath, 'utf8')
  await sql.unsafe(migrationSql)
  report.migration = { applied: true, file: '0045_expense_soft_void_and_category_hide.sql' }

  const cols = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'expenses' and column_name in ('status','voided_at','voided_by','void_reason'))
        or (table_name = 'expense_categories' and column_name = 'is_hidden')
        or (table_name = 'branch_fixed_costs' and column_name in ('status','start_date'))
      )
    order by table_name, column_name
  `
  report.migration.columns = cols
  console.log('  ✓ columns:', cols.map((c) => `${c.table_name}.${c.column_name}`).join(', '))

  // ---------- 3. Backfill [[VOID]] → status=void ----------
  console.log('\n3) Backfill [[VOID]] → status=void…')
  const before = await sql`
    select id, note, status, void_reason, voided_by, voided_at
    from public.expenses
    where note ilike ${'%' + VOID_MARKER + '%'}
       or status = 'void'
  `
  writeFileSync(path.join(OUT, 'pre_backfill_void_candidates.json'), JSON.stringify(before, null, 2))

  const marked = before.filter((r) => String(r.note || '').includes(VOID_MARKER))
  report.backfill.candidatesWithMarker = marked.length
  report.backfill.alreadyVoid = before.filter((r) => r.status === 'void').length

  const updated = await sql`
    update public.expenses
    set
      status = 'void',
      void_reason = case
        when coalesce(nullif(trim(void_reason), ''), '') <> '' then void_reason
        else trim(both ' |' from regexp_replace(coalesce(note, ''), '\\[\\[VOID\\]\\]', '', 'g'))
      end,
      voided_by = case
        when coalesce(nullif(trim(voided_by), ''), '') <> '' then voided_by
        else 'migration-0045-backfill'
      end,
      voided_at = coalesce(voided_at, now()),
      updated_at = now()
    where note ilike ${'%' + VOID_MARKER + '%'}
    returning id, note, status, void_reason
  `
  report.backfill.updatedCount = updated.length
  writeFileSync(path.join(OUT, 'backfill_updated.json'), JSON.stringify(updated, null, 2))
  console.log(`  ✓ backfilled ${updated.length} rows`)

  // ---------- 4. Clean [[VOID]] from notes ----------
  console.log('\n4) Remove [[VOID]] marker from notes…')
  const cleaned = await sql`
    update public.expenses
    set
      note = trim(both ' |' from regexp_replace(coalesce(note, ''), '\\[\\[VOID\\]\\]', '', 'g')),
      updated_at = now()
    where note ilike ${'%' + VOID_MARKER + '%'}
    returning id, note, status
  `
  report.cleanup.cleanedCount = cleaned.length
  writeFileSync(path.join(OUT, 'notes_cleaned.json'), JSON.stringify(cleaned, null, 2))
  console.log(`  ✓ cleaned notes: ${cleaned.length}`)

  // ---------- 5. Verify ----------
  console.log('\n5) Verify…')
  const remaining = await sql`
    select count(*)::int as n
    from public.expenses
    where note ilike ${'%' + VOID_MARKER + '%'}
  `
  const voidCount = await sql`
    select count(*)::int as n from public.expenses where status = 'void'
  `
  const activeCount = await sql`
    select count(*)::int as n from public.expenses where coalesce(status, 'active') = 'active'
  `
  report.verify = {
    remainingMarker: remaining[0].n,
    voidStatusCount: voidCount[0].n,
    activeCount: activeCount[0].n,
  }
  if (remaining[0].n !== 0) {
    report.ok = false
    console.error(`  ✗ still have [[VOID]] markers: ${remaining[0].n}`)
  } else {
    console.log(`  ✓ no [[VOID]] markers left; void=${voidCount[0].n}, active=${activeCount[0].n}`)
  }
} catch (err) {
  fail('pipeline', err)
} finally {
  await sql.end({ timeout: 5 })
}

report.finishedAt = new Date().toISOString()
const reportPath = path.join(OUT, 'MIGRATION_0045_REPORT.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))
writeFileSync(
  path.join(ROOT, 'docs/uat-evidence/expenses-void-migration-prod/LATEST_REPORT.json'),
  JSON.stringify(report, null, 2),
)
console.log('\nReport:', reportPath)
console.log('PASS:', report.ok)
process.exit(report.ok ? 0 : 1)
