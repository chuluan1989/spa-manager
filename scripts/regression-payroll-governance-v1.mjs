/**
 * PAYROLL GOVERNANCE V1 — Regression Suite (một lệnh cho mọi bug Payroll đã khóa).
 *
 * Offline (mặc định, không DB):
 *   npm run regression:payroll
 *
 * Kèm Production READ-ONLY dry-run:
 *   REGRESSION_INCLUDE_PROD=1 npm run regression:payroll
 *
 * Không ghi DB. Không migration. Không backfill.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = path.join(ROOT, 'docs/uat-evidence/payroll-governance-v1')
mkdirSync(OUT, { recursive: true })

const INCLUDE_PROD = process.env.REGRESSION_INCLUDE_PROD === '1'

/** @type {{ id: string, title: string, command: string[], env?: Record<string,string>, optional?: boolean }[]} */
const SUITE = [
  {
    id: 'commission-body75-baclieu',
    title: 'Hoa hồng Body 75 = 0% (tiered) + Chuyên sâu Bạc Liêu 30%',
    command: ['node', 'scripts/verify-commission-policy-matrix.mjs'],
  },
  {
    id: 'cross-branch-support',
    title: 'Hỗ trợ liên chi nhánh (serving branch / không phụ thuộc supportEnabled)',
    command: ['npx', 'vite-node', 'scripts/verify-cross-branch-support.mjs'],
  },
  {
    id: 'salary-summary',
    title: 'Payroll Summary (home-branch, không trùng net hỗ trợ)',
    command: ['node', 'scripts/verify-salary-summary-uat.mjs'],
  },
  {
    id: 'offline-core',
    title: 'Chu kỳ lương · Popup SET · KPI · Excel/PDF · Dashboard · SoT · Audit fields',
    command: ['npx', 'vite-node', 'scripts/regression-payroll-governance-offline.mjs'],
  },
  {
    id: 'prod-sot-readonly',
    title: 'ONE SOURCE OF TRUTH — Production READ ONLY dry-run',
    command: ['node', 'scripts/dry-run-payroll-sot-production-readonly.mjs'],
    optional: !INCLUDE_PROD,
  },
]

function runCase(item) {
  if (item.optional) {
    return {
      id: item.id,
      title: item.title,
      ok: true,
      skipped: true,
      reason: 'Set REGRESSION_INCLUDE_PROD=1 to run',
    }
  }
  const started = Date.now()
  const result = spawnSync(item.command[0], item.command.slice(1), {
    cwd: ROOT,
    env: { ...process.env, ...(item.env || {}) },
    encoding: 'utf8',
  })
  const ok = (result.status ?? 1) === 0
  return {
    id: item.id,
    title: item.title,
    ok,
    skipped: false,
    status: result.status,
    ms: Date.now() - started,
    stdoutTail: String(result.stdout || '').split('\n').slice(-12).join('\n'),
    stderrTail: String(result.stderr || '').split('\n').slice(-12).join('\n'),
  }
}

console.log('\n=== PAYROLL GOVERNANCE V1 · REGRESSION SUITE ===\n')

const cases = SUITE.map((item) => {
  console.log(`→ ${item.id}: ${item.title}${item.optional ? ' (skip)' : ''}`)
  const outcome = runCase(item)
  if (outcome.skipped) console.log('  skipped')
  else console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} (${outcome.ms}ms)`)
  if (!outcome.ok && outcome.stderrTail) console.log(outcome.stderrTail)
  return outcome
})

const failed = cases.filter((c) => !c.ok && !c.skipped)
const report = {
  milestone: 'PAYROLL_GOVERNANCE_V1',
  generatedAt: new Date().toISOString(),
  includeProd: INCLUDE_PROD,
  write: false,
  cases,
  passed: cases.filter((c) => c.ok).length,
  failed: failed.length,
  skipped: cases.filter((c) => c.skipped).length,
  allOk: failed.length === 0,
}

writeFileSync(path.join(OUT, 'REGRESSION_SUITE_REPORT.json'), JSON.stringify(report, null, 2))

const md = [
  '# Payroll Governance V1 — Regression Suite Report',
  '',
  `Generated: ${report.generatedAt}`,
  `Result: **${report.allOk ? 'PASS' : 'FAIL'}**`,
  `includeProd=${INCLUDE_PROD}`,
  '',
  '| ID | Title | Result |',
  '|----|-------|--------|',
  ...cases.map((c) => `| ${c.id} | ${c.title} | ${c.skipped ? 'SKIP' : (c.ok ? 'PASS' : 'FAIL')} |`),
  '',
  'Run: `npm run regression:payroll`',
  'Prod RO: `REGRESSION_INCLUDE_PROD=1 npm run regression:payroll`',
]
writeFileSync(path.join(OUT, 'REGRESSION_SUITE_REPORT.md'), md.join('\n'))

console.log(`\n${report.allOk ? 'REGRESSION PASS' : 'REGRESSION FAIL'} · report → ${OUT}`)
process.exit(report.allOk ? 0 : 1)
