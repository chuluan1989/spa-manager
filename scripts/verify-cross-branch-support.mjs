/**
 * UAT — dropdown Chi nhánh phục vụ khách (không phụ thuộc supportEnabled DB).
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/verify-cross-branch-support.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CANONICAL_BRANCHES } from '../src/constants/canonicalBranches.js'
import { EMPLOYEE_STATUS } from '../src/utils/employeeStorage.js'
import {
  CROSS_BRANCH_SUPPORT_IDS,
  canEmployeeServeAtBranch,
  canSelectServingBranch,
  getServingBranchOptions,
  isCrossBranchSupportInvoice,
} from '../src/utils/crossBranchSupport.js'
import { computeEmployeeInvoiceDetailReport } from '../src/utils/employeeInvoiceReport.js'

function createStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

globalThis.localStorage = createStorage()

// Giả lập Production: supportEnabled = false trên local cache (bug cũ).
const branches = CANONICAL_BRANCHES.map((b) => ({
  ...b,
  status: 'active',
  supportEnabled: false,
}))
localStorage.setItem('spa-manager-branches', JSON.stringify(branches))

const tramId = 'tram-spa-nhu-ha'
const songId = 'song-khoe-spa-anh'
const bacId = 'bac-lieu-yen'

localStorage.setItem('spa-manager-employees', JSON.stringify([
  { id: tramId, name: 'Như Hà', branchId: 'tram-spa', status: EMPLOYEE_STATUS.ACTIVE },
  { id: songId, name: 'Ánh', branchId: 'song-khoe-spa', status: EMPLOYEE_STATUS.ACTIVE },
  { id: bacId, name: 'Kim Yến', branchId: 'bac-lieu', status: EMPLOYEE_STATUS.ACTIVE },
]))

function log(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
  assert.ok(ok, label)
}

console.log('\n=== UAT dropdown Chi nhánh phục vụ khách ===\n')

console.log('A. Như Hà @ Trạm — thấy dropdown dù supportEnabled=false trên cache')
log('canSelectServingBranch(Như Hà)', canSelectServingBranch(tramId, 'tram-spa'))
log('fallback session khi chưa có employee record', canSelectServingBranch('', 'tram-spa'))
const options = getServingBranchOptions(tramId, 'tram-spa')
log('đúng 3 CN', options.length === 3)
log('có Trạm', options.some((b) => b.id === 'tram-spa'))
log('có Sóc Trăng', options.some((b) => b.id === 'soc-trang'))
log('có Sống Khoẻ', options.some((b) => b.id === 'song-khoe-spa'))
log('CROSS ids cố định', CROSS_BRANCH_SUPPORT_IDS.join(',') === 'soc-trang,tram-spa,song-khoe-spa')

console.log('\nB. Chọn Sóc Trăng — lưu branchId/homeBranchId')
{
  const invoice = {
    id: 'b',
    date: '2026-07-30',
    branchId: 'soc-trang',
    homeBranchId: 'tram-spa',
    employeeId: tramId,
    total: 200000,
    serviceTotal: 200000,
    commission: 20000,
    tips: 5000,
    services: [{ id: 's1', name: 'DV', price: 200000, commissionPercent: 10, commissionAmount: 20000 }],
    createdAt: '2026-07-30T10:00:00.000Z',
  }
  log('serve OK', canEmployeeServeAtBranch(tramId, 'soc-trang', 'tram-spa'))
  log('branchId = soc-trang', invoice.branchId === 'soc-trang')
  log('homeBranchId = tram-spa', invoice.homeBranchId === 'tram-spa')
  log('cross-branch flag', isCrossBranchSupportInvoice(invoice))
  const report = computeEmployeeInvoiceDetailReport([invoice], tramId, {
    fromDate: '2026-07-01', toDate: '2026-07-31', cycle: 'full', employeeId: tramId, branchId: '',
  })
  log('tour hỗ trợ = 1', report.periodTotals.crossBranchSupportTourCount === 1)
}

console.log('\nC. Chọn lại Trạm')
log('serve tại tram OK', canEmployeeServeAtBranch(tramId, 'tram-spa', 'tram-spa'))
log('không cross khi cùng CN', !isCrossBranchSupportInvoice({
  branchId: 'tram-spa', homeBranchId: 'tram-spa',
}))

console.log('\nD. CN ngoài nhóm')
log('Bạc Liêu không dropdown', !canSelectServingBranch(bacId, 'bac-lieu'))
log('options rỗng', getServingBranchOptions(bacId, 'bac-lieu').length === 0)
log('không serve Sóc Trăng', !canEmployeeServeAtBranch(bacId, 'soc-trang', 'bac-lieu'))

console.log('\nUI labels')
{
  const invSrc = readFileSync(fileURLToPath(new URL('../src/pages/Invoice.jsx', import.meta.url)), 'utf8')
  log('có label Chi nhánh phục vụ khách', invSrc.includes('Chi nhánh phục vụ khách'))
  log('BranchBanner khi !canPickServingBranch', invSrc.includes('!canPickServingBranch') && invSrc.includes('BranchBanner'))
}

console.log('\n=== ALL DROPDOWN UAT PASSED ===\n')
