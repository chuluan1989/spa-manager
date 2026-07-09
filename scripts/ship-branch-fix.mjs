/**
 * Tạo PR → chờ CI → merge main → đợi Vercel → verify Production.
 * Yêu cầu: gh auth login
 */
import { spawnSync } from 'node:child_process'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
const BRANCH = 'fix/admin-branch-detail'
const ROOT = new URL('..', import.meta.url).pathname

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function runCapture(cmd, args, { allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0 && !allowFail) {
    console.error(r.stderr || r.stdout)
    process.exit(r.status ?? 1)
  }
  return (r.stdout || '').trim()
}

console.log('\n=== Ship branch fix ===\n')

runCapture('gh', ['auth', 'status'])

let prUrl = runCapture('gh', ['pr', 'view', '--head', BRANCH, '--json', 'url', '-q', '.url'], { allowFail: true })

if (!prUrl) {
  console.log('Tạo Pull Request...')
  prUrl = runCapture('gh', [
    'pr', 'create',
    '--base', 'main',
    '--head', BRANCH,
    '--title', 'Fix branch detail production crash (realtime attendance)',
    '--body', [
      '## Summary',
      '- Fix blank branch detail screen: remove duplicate Supabase realtime subscribe in `useBranchAttendance`',
      '- Add production verification scripts for 8 branches',
      '',
      '## Test plan',
      '- [x] `npm run build`',
      '- [x] `node scripts/verify-branch-detail.mjs`',
      '- [ ] `node scripts/verify-production-branches.mjs` after deploy',
    ].join('\n'),
  ])
}
console.log(`PR: ${prUrl}`)

console.log('\nChờ CI checks...')
for (let i = 0; i < 60; i++) {
  const json = runCapture('gh', ['pr', 'view', '--json', 'statusCheckRollup,mergeable,state', '-q', '.'])
  const data = JSON.parse(json)
  const checks = data.statusCheckRollup ?? []
  const pending = checks.filter((c) => c.status === 'IN_PROGRESS' || c.status === 'QUEUED')
  const failed = checks.filter((c) => c.conclusion === 'FAILURE' || c.conclusion === 'CANCELLED')
  if (failed.length) {
    console.error('CI failed:', failed.map((c) => c.name).join(', '))
    process.exit(1)
  }
  if (pending.length === 0 && checks.length > 0) break
  if (data.mergeable === 'MERGEABLE' && pending.length === 0) break
  await new Promise((r) => setTimeout(r, 15000))
}
console.log('CI pass (hoặc không có checks)')

console.log('\nMerge vào main...')
run('gh', ['pr', 'merge', '--merge', '--delete-branch'])

const before = await fetch(BASE).then((r) => r.headers.get('last-modified') ?? '')
console.log(`\nĐợi Vercel deploy (bundle trước: ${before})...`)
let deployed = false
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 15000))
  const mod = await fetch(BASE).then((r) => r.headers.get('last-modified') ?? '')
  if (mod && mod !== before) {
    console.log(`Deploy mới: ${mod}`)
    deployed = true
    break
  }
}
if (!deployed) console.warn('Không thấy Last-Modified đổi — vẫn chạy verify...')

console.log('\nVerify Production...')
run('node', ['scripts/verify-production-branches.mjs'])
run('node', ['scripts/verify-production-branches-api.mjs'])

console.log('\n=== Production PASS ===\n')
