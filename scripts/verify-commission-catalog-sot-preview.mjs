/**
 * UAT Preview in-memory — catalog SoT cho HĐ mới, payroll đọc snapshot.
 * Không ghi Production. Không tạo HĐ thật. Không seed catalog.
 *
 * Chạy: npx vite-node scripts/verify-commission-catalog-sot-preview.mjs
 */
import './_localStoragePolyfill.js'
import assert from 'node:assert/strict'
import {
  buildBaseServiceLine,
  getInvoiceServiceCommission,
  getServiceLineCommissionAmount,
} from '../src/utils/invoice.js'
import { calculateCommissionAmount } from '../src/utils/commissionPolicyEngine.js'
import { SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../src/constants/salary.js'

const results = []

function body60(percent) {
  return {
    id: 'body-60',
    serviceId: 'body-60',
    name: 'Body 60',
    price: 189000,
    commissionPercent: percent,
    pricingSource: 'branch_service_prices',
    catalogVersion: 1,
  }
}

{
  const line = buildBaseServiceLine(body60(20), 'bac-lieu')
  assert.equal(line.commissionPercent, 20)
  assert.equal(line.commissionAmount, calculateCommissionAmount(189000, 20))
  assert.equal(line.pricingSource, 'branch_service_prices')
  assert.equal(line.branchId, 'bac-lieu')
  assert.equal(line.servicePrice, 189000)
  results.push('BL Body 60 catalog 20% snapshot (policy không ghi đè)')
}

{
  const line25 = buildBaseServiceLine(body60(25), 'bac-lieu')
  assert.equal(line25.commissionPercent, 25)
  assert.equal(line25.commissionAmount, calculateCommissionAmount(189000, 25))
  const payroll = getInvoiceServiceCommission({
    branchId: 'bac-lieu',
    services: [line25],
  })
  assert.equal(payroll, line25.commissionAmount)
  results.push('UAT Admin 20→25: HĐ mới + payroll đọc 25%')
}

{
  const frozen = {
    branchId: 'bac-lieu',
    services: [buildBaseServiceLine(body60(25), 'bac-lieu')],
  }
  assert.equal(getInvoiceServiceCommission(frozen), calculateCommissionAmount(189000, 25))
  const second = buildBaseServiceLine(body60(20), 'bac-lieu')
  assert.equal(second.commissionPercent, 20)
  assert.equal(getInvoiceServiceCommission(frozen), calculateCommissionAmount(189000, 25))
  results.push('UAT đổi catalog 25→20: HĐ test giữ 25; HĐ mới thứ hai = 20')
}

{
  const line = buildBaseServiceLine({
    id: 'body-60',
    name: 'Body',
    price: 160000,
    commissionPercent: 0,
    pricingSource: 'branch_service_prices',
  }, 'tram-spa')
  assert.equal(line.commissionPercent, 0)
  assert.equal(line.commissionAmount, 0)
  results.push('0% là giá trị hợp lệ — không fallback policy')
}

{
  const legacyAmount = getServiceLineCommissionAmount(
    { price: 229000, commissionPercent: 20, commissionAmount: 45800 },
    { branchId: 'soc-trang', preferSnapshot: true },
  )
  assert.equal(legacyAmount, 45800)
  results.push('HĐ lịch sử ST Body 75 snapshot 20% không đổi')
}

{
  const legacyPct = getServiceLineCommissionAmount(
    { price: 349000, commissionPercent: 10, id: 'bac-lieu-svc-chuyen-sau', name: 'Chuyên sâu' },
    { branchId: 'bac-lieu', preferSnapshot: true },
  )
  assert.equal(legacyPct, calculateCommissionAmount(349000, 10))
  results.push('HĐ lịch sử BL CS 04/08 snapshot 10% không đổi')
}

{
  const tram = buildBaseServiceLine({
    id: 'body-60',
    name: 'Body',
    price: 160000,
    commissionPercent: 0,
  }, 'tram-spa')
  const sk = buildBaseServiceLine({
    id: 'body-60',
    name: 'Massage Body 60 phút – không đá nóng',
    price: 190000,
    commissionPercent: 0,
  }, 'song-khoe-spa')
  assert.equal(tram.price, 160000)
  assert.equal(tram.commissionPercent, 0)
  assert.equal(tram.branchId, 'tram-spa')
  assert.equal(sk.price, 190000)
  assert.equal(sk.commissionPercent, 0)
  assert.equal(sk.branchId, 'song-khoe-spa')
  results.push('Cross-branch: giá + % theo chi nhánh phục vụ')
}

{
  const invoice = {
    branchId: 'bac-lieu',
    services: [buildBaseServiceLine(body60(25), 'bac-lieu')],
    tips: 10000,
  }
  const primary = getInvoiceServiceCommission(invoice)
  const support = Math.round(primary * SUPPORT_EMPLOYEE_COMMISSION_RATE)
  assert.equal(primary, calculateCommissionAmount(189000, 25))
  assert.equal(support, Math.round(calculateCommissionAmount(189000, 25) * 0.5))
  results.push('NV hỗ trợ nhận 50% HH snapshot; tips không scale')
}

{
  const tv = buildBaseServiceLine(body60(20), 'tra-vinh')
  const vl = buildBaseServiceLine({
    id: 'chuyen-sau',
    name: 'Chuyên sâu',
    price: 349000,
    commissionPercent: 20,
  }, 'vinh-long')
  assert.equal(tv.commissionPercent, 20)
  assert.equal(vl.commissionPercent, 20)
  results.push('Regression TV/VL catalog 20% trên HĐ mới')
}

{
  const fallback = buildBaseServiceLine({
    id: 'mystery',
    name: 'Mystery',
    price: 100000,
  }, 'bac-lieu')
  assert.equal(fallback.commissionPercent, 20)
  assert.equal(fallback.pricingSource, 'commission_policy')
  results.push('Policy fallback chỉ khi catalog % thiếu')
}

console.log('UAT Preview commission catalog SoT — PASS')
for (const line of results) console.log(`  ✓ ${line}`)
console.log(`Total: ${results.length} checks`)
console.log('No production writes. No historical invoices mutated.')
