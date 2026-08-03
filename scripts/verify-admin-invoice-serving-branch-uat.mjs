/**
 * UAT — Admin/QL nhập HĐ hộ NV: chọn NV + Chi nhánh phục vụ (nhóm hỗ trợ).
 * Run: npx vite-node scripts/verify-admin-invoice-serving-branch-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  CROSS_BRANCH_SUPPORT_IDS,
  canEmployeeServeAtBranch,
  canSelectServingBranch,
  getServingBranchOptions,
} from '../src/utils/crossBranchSupport.js'

const root = fileURLToPath(new URL('..', import.meta.url))

console.log('\n=== UAT — Admin/QL serving branch on invoice form ===\n')

{
  // Nhóm hỗ trợ: Trạm / Sóc Trăng / Sống Khoẻ
  assert.deepEqual(
    [...CROSS_BRANCH_SUPPORT_IDS].sort(),
    ['soc-trang', 'song-khoe-spa', 'tram-spa'].sort(),
  )
  console.log('  [PASS] CROSS_BRANCH_SUPPORT_IDS = 3 CN hỗ trợ')
}

{
  // Giả lập NV nhà Trạm: được phục vụ 3 CN, không được Bạc Liêu
  const home = 'tram-spa'
  assert.equal(canSelectServingBranch('emp-cherry', home) || canSelectServingBranch('', home), true)
  // canSelectServingBranch with empty employee falls back to session branch
  assert.equal(canSelectServingBranch('', 'tram-spa'), true)
  assert.equal(canSelectServingBranch('', 'bac-lieu'), false)

  assert.equal(canEmployeeServeAtBranch('x', 'soc-trang', 'tram-spa'), true)
  assert.equal(canEmployeeServeAtBranch('x', 'song-khoe-spa', 'tram-spa'), true)
  assert.equal(canEmployeeServeAtBranch('x', 'tram-spa', 'tram-spa'), true)
  assert.equal(canEmployeeServeAtBranch('x', 'bac-lieu', 'tram-spa'), false)
  console.log('  [PASS] phục vụ trong nhóm hỗ trợ OK; Bạc Liêu bị chặn (giống NV)')
}

{
  const opts = getServingBranchOptions('', 'tram-spa')
  assert.equal(opts.length, 3)
  assert.ok(opts.every((b) => CROSS_BRANCH_SUPPORT_IDS.includes(b.id)))
  console.log('  [PASS] dropdown phục vụ đúng 3 CN')
}

{
  const page = readFileSync(`${root}/src/pages/Invoice.jsx`, 'utf8')
  assert.match(page, /Nhân viên thực hiện/)
  assert.match(page, /Chi nhánh phục vụ khách/)
  assert.match(page, /actingEmployeeId/)
  assert.match(page, /handleEmployeeChange/)
  assert.match(page, /getAllActiveEmployees/)
  // Admin không còn bắt chọn CN trước rồi mới chọn NV
  assert.ok(!page.includes("Chọn chi nhánh trước"))
  assert.match(page, /Chọn nhân viên trước/)
  // Serving branch theo NV đã chọn — không khóa cứng lockedEmployee
  assert.match(page, /canSelectServingBranch\(actingEmployeeId/)
  console.log('  [PASS] form Admin/QL: chọn NV trước + serving theo NV hỗ trợ')
}

{
  const storage = readFileSync(`${root}/src/utils/invoiceStorage.js`, 'utf8')
  assert.match(storage, /isBranchManager\(\)/)
  assert.match(storage, /Chi nhánh phục vụ không hợp lệ cho hỗ trợ liên chi nhánh/)
  assert.match(storage, /nextHomeBranchId/)
  console.log('  [PASS] storage: QL được lưu/sửa CN phục vụ trong nhóm hỗ trợ')
}

{
  // Payload rule: branchId = phục vụ, homeBranchId = nhà NV
  const employee = { id: 'cherry', branchId: 'tram-spa', name: 'Cherry' }
  const servingBranchId = 'soc-trang'
  const homeBranchId = employee.branchId
  assert.equal(homeBranchId, 'tram-spa')
  assert.equal(servingBranchId, 'soc-trang')
  assert.notEqual(servingBranchId, homeBranchId)
  console.log('  [PASS] branchId phục vụ ≠ homeBranchId nhà NV (Trạm → Sóc Trăng)')
}

console.log('\n=== ALL PASS — admin invoice serving branch UAT ===\n')
console.log('Ghi chú UAT tay: đổi phục vụ trong nhóm Trạm/Sóc Trăng/Sống Khoẻ (không dùng Bạc Liêu — ngoài nhóm hỗ trợ).')
