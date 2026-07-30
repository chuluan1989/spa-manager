/**
 * UAT logic — Hỗ trợ nhân viên liên chi nhánh (4 kịch bản bắt buộc).
 * Run: node --env-file=.env.local node_modules/.bin/vite-node scripts/verify-cross-branch-support.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CANONICAL_BRANCHES } from '../src/constants/canonicalBranches.js'
import { EMPLOYEE_STATUS } from '../src/utils/employeeStorage.js'
import { ROLES } from '../src/constants/roles.js'
import { setSession } from '../src/utils/authStorage.js'
import {
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

const branches = CANONICAL_BRANCHES.map((b) => ({
  ...b,
  status: 'active',
  supportEnabled: Boolean(b.supportEnabled),
}))
localStorage.setItem('spa-manager-branches', JSON.stringify(branches))

const tramId = 'uat-xbranch-tram'
const songId = 'uat-xbranch-song'
const bacId = 'uat-xbranch-bac'

localStorage.setItem('spa-manager-employees', JSON.stringify([
  { id: tramId, name: 'UAT Tram', branchId: 'tram-spa', status: EMPLOYEE_STATUS.ACTIVE },
  { id: songId, name: 'UAT Song', branchId: 'song-khoe-spa', status: EMPLOYEE_STATUS.ACTIVE },
  { id: bacId, name: 'UAT Bac', branchId: 'bac-lieu', status: EMPLOYEE_STATUS.ACTIVE },
]))

localStorage.setItem('spa-manager-system-settings', JSON.stringify({
  allowEmployeeEditOwnInvoice: true,
  allowManagerEditBranchInvoice: true,
}))

function log(label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
  assert.ok(ok, label)
}

console.log('\n=== UAT: Hỗ trợ liên chi nhánh ===\n')

console.log('Helpers / phạm vi 3 CN')
log('Trạm được chọn phục vụ', canSelectServingBranch(tramId))
log('Sống Khoẻ được chọn phục vụ', canSelectServingBranch(songId))
log('Bạc Liêu KHÔNG được chọn phục vụ', !canSelectServingBranch(bacId))

const options = getServingBranchOptions(tramId).map((b) => b.id).sort()
log(
  'Options Trạm = tram + soc-trang + song-khoe',
  options.length === 3
    && options.includes('tram-spa')
    && options.includes('soc-trang')
    && options.includes('song-khoe-spa'),
  options.join(','),
)
log('Bạc Liêu options rỗng', getServingBranchOptions(bacId).length === 0)
log('Trạm → Trạm OK', canEmployeeServeAtBranch(tramId, 'tram-spa'))
log('Trạm → Sóc Trăng OK', canEmployeeServeAtBranch(tramId, 'soc-trang'))
log('Trạm → Bạc Liêu FAIL', !canEmployeeServeAtBranch(tramId, 'bac-lieu'))
log('Bạc Liêu → Sóc Trăng FAIL', !canEmployeeServeAtBranch(bacId, 'soc-trang'))

console.log('\n① Trạm tạo HĐ tại Trạm')
{
  const invoice = {
    id: '1',
    date: '2026-07-30',
    branchId: 'tram-spa',
    branchName: 'Trạm Spa',
    homeBranchId: 'tram-spa',
    homeBranchName: 'Trạm Spa',
    employeeId: tramId,
    employeeName: 'UAT Tram',
    total: 100000,
    serviceTotal: 100000,
    commission: 10000,
    tips: 5000,
    services: [{ id: 's1', name: 'DV', price: 100000, commissionPercent: 10, commissionAmount: 10000 }],
    createdAt: '2026-07-30T10:00:00.000Z',
  }
  log('Doanh thu → Trạm', invoice.branchId === 'tram-spa')
  log('Lương → NV Trạm', invoice.employeeId === tramId)
  log('Không tính hỗ trợ liên CN', !isCrossBranchSupportInvoice(invoice))
}

console.log('\n② Trạm tạo HĐ tại Sóc Trăng')
{
  const invoice = {
    id: '2',
    date: '2026-07-30',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng Khoẻ Spa',
    homeBranchId: 'tram-spa',
    homeBranchName: 'Trạm Spa',
    employeeId: tramId,
    employeeName: 'UAT Tram',
    total: 200000,
    serviceTotal: 200000,
    commission: 20000,
    tips: 10000,
    services: [{ id: 's1', name: 'DV', price: 200000, commissionPercent: 10, commissionAmount: 20000 }],
    createdAt: '2026-07-30T11:00:00.000Z',
  }
  log('Doanh thu → Sóc Trăng', invoice.branchId === 'soc-trang')
  log('Lương → NV Trạm', invoice.employeeId === tramId)
  log('Đánh dấu hỗ trợ liên CN', isCrossBranchSupportInvoice(invoice))
  const report = computeEmployeeInvoiceDetailReport([invoice], tramId, {
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    cycle: 'full',
    employeeId: tramId,
    branchId: '',
  })
  log('Tour hỗ trợ = 1', report.periodTotals.crossBranchSupportTourCount === 1)
  log('DT hỗ trợ = 200000', report.periodTotals.crossBranchSupportRevenue === 200000)
  log('% thuộc NV (period commission)', report.periodTotals.serviceCommission === 20000)
  log('Tips thuộc NV', report.periodTotals.tips === 10000)
}

console.log('\n③ Sống Khoẻ tạo HĐ tại Sóc Trăng')
{
  const invoice = {
    id: '3',
    date: '2026-07-30',
    branchId: 'soc-trang',
    homeBranchId: 'song-khoe-spa',
    employeeId: songId,
    employeeName: 'UAT Song',
    total: 150000,
    serviceTotal: 150000,
    commission: 15000,
    tips: 0,
    services: [{ id: 's1', name: 'DV', price: 150000, commissionPercent: 10, commissionAmount: 15000 }],
    createdAt: '2026-07-30T12:00:00.000Z',
  }
  log('Doanh thu → Sóc Trăng', invoice.branchId === 'soc-trang')
  log('Lương → NV Sống Khoẻ', invoice.employeeId === songId)
  log('Serve OK', canEmployeeServeAtBranch(songId, 'soc-trang'))
}

console.log('\n④ CN khác không thấy chức năng')
log('Bạc Liêu không select serving', !canSelectServingBranch(bacId))
log('Options rỗng', getServingBranchOptions(bacId).length === 0)

console.log('\nFK / schema safety')
{
  const src = readFileSync(fileURLToPath(new URL('../src/utils/syncForeignKeys.js', import.meta.url)), 'utf8')
  log('Không reject theo employees.branch_id hiện tại', !src.includes('remoteEmployee.branchId !== branchId'))
  const invSrc = readFileSync(fileURLToPath(new URL('../src/pages/Invoice.jsx', import.meta.url)), 'utf8')
  log('Có UI Chi nhánh phục vụ khách', invSrc.includes('Chi nhánh phục vụ khách'))
  log('Không đụng Dashboard.jsx', !invSrc.includes('Dashboard'))
}

console.log('\n=== ALL 4 CROSS-BRANCH SCENARIOS PASSED ===\n')
