/**
 * UAT — phương thức thanh toán hóa đơn (cash / bank_transfer).
 * Run: npx vite-node scripts/verify-invoice-payment-method-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  PAYMENT_METHODS,
  getPaymentMethodLabel,
  isKnownPaymentMethod,
  normalizePaymentMethod,
  invoiceMatchesPaymentMethodFilter,
} from '../src/constants/paymentMethods.js'
import { aggregatePaymentMethodTotals } from '../src/utils/paymentMethodTotals.js'
import { filterInvoices } from '../src/utils/invoiceFilters.js'

const root = fileURLToPath(new URL('..', import.meta.url))

console.log('\n=== UAT — Invoice payment method ===\n')

{
  assert.equal(normalizePaymentMethod('cash'), 'cash')
  assert.equal(normalizePaymentMethod('bank_transfer'), 'bank_transfer')
  assert.equal(normalizePaymentMethod('transfer'), 'bank_transfer')
  assert.equal(normalizePaymentMethod(''), '')
  assert.equal(normalizePaymentMethod(null), '')
  assert.equal(getPaymentMethodLabel(''), 'Chưa xác định')
  assert.equal(getPaymentMethodLabel('transfer'), 'Chuyển khoản')
  assert.equal(isKnownPaymentMethod('cash'), true)
  assert.equal(isKnownPaymentMethod(''), false)
  console.log('  [PASS] normalize + labels (legacy transfer → bank_transfer)')
}

const invoices = [
  {
    id: '1',
    date: '2026-08-04',
    branchId: 'tram-spa',
    employeeId: 'e1',
    paymentMethod: 'cash',
    serviceTotal: 100000,
    tips: 50000,
    total: 150000,
  },
  {
    id: '2',
    date: '2026-08-04',
    branchId: 'tram-spa',
    employeeId: 'e1',
    paymentMethod: 'bank_transfer',
    serviceTotal: 200000,
    tips: 0,
    total: 200000,
  },
  {
    id: '3',
    date: '2026-08-04',
    branchId: 'soc-trang',
    employeeId: 'e2',
    paymentMethod: 'transfer', // legacy
    serviceTotal: 300000,
    tips: 100000,
    total: 400000,
  },
  {
    id: '4',
    date: '2026-08-04',
    branchId: 'soc-trang',
    employeeId: 'e2',
    paymentMethod: '',
    serviceTotal: 50000,
    tips: 0,
    total: 50000,
  },
]

{
  const t = aggregatePaymentMethodTotals(invoices)
  assert.equal(t.cashAmount, 150000)
  assert.equal(t.bankTransferAmount, 600000) // 200k + 400k legacy transfer
  assert.equal(t.unknownAmount, 50000)
  assert.equal(t.totalCollected, 800000)
  assert.equal(t.cashCount, 1)
  assert.equal(t.bankTransferCount, 2)
  assert.equal(t.unknownCount, 1)
  console.log('  [PASS] aggregate cash / bank_transfer / unknown = tổng thu')
}

{
  const cashOnly = filterInvoices(invoices, { paymentMethod: PAYMENT_METHODS.CASH })
  assert.equal(cashOnly.length, 1)
  const bankOnly = filterInvoices(invoices, { paymentMethod: PAYMENT_METHODS.BANK_TRANSFER })
  assert.equal(bankOnly.length, 2)
  const unknown = filterInvoices(invoices, { paymentMethod: 'unknown' })
  assert.equal(unknown.length, 1)
  assert.equal(invoiceMatchesPaymentMethodFilter(invoices[2], PAYMENT_METHODS.BANK_TRANSFER), true)
  console.log('  [PASS] filter Tất cả / Tiền mặt / CK / Chưa xác định')
}

{
  // Đổi cash → bank: tổng thu không đổi
  const before = aggregatePaymentMethodTotals(invoices)
  const swapped = invoices.map((inv) => (
    inv.id === '1' ? { ...inv, paymentMethod: 'bank_transfer' } : inv
  ))
  const after = aggregatePaymentMethodTotals(swapped)
  assert.equal(after.totalCollected, before.totalCollected)
  assert.equal(after.cashAmount, before.cashAmount - 150000)
  assert.equal(after.bankTransferAmount, before.bankTransferAmount + 150000)
  console.log('  [PASS] đổi PTTT: tổng thu không đổi, cash↓ bank↑')
}

{
  const deleted = invoices.filter((inv) => inv.id !== '2')
  const after = aggregatePaymentMethodTotals(deleted)
  assert.equal(after.bankTransferAmount, 400000)
  assert.equal(after.totalCollected, 600000)
  console.log('  [PASS] xóa HĐ CK: giảm đúng bank + tổng thu')
}

  {
    const page = readFileSync(`${root}/src/pages/Invoice.jsx`, 'utf8')
    assert.match(page, /Phương thức thanh toán/)
    assert.match(page, /PAYMENT_METHOD_OPTIONS/)
    assert.match(page, /isKnownPaymentMethod/)
    assert.match(page, /normalizePaymentMethod\(paymentMethod\)/)

    const filters = readFileSync(`${root}/src/components/invoice/InvoiceFilters.jsx`, 'utf8')
    assert.match(filters, /Phương thức TT/)

    const explorer = readFileSync(`${root}/src/components/report/ReportExplorer.jsx`, 'utf8')
    assert.match(explorer, /cashAmount/)
    assert.match(explorer, /Tổng tiền mặt/)
    assert.match(explorer, /paymentMethodLabel/)

    const adminDetail = readFileSync(`${root}/src/components/report/AdminEmployeeDetail.jsx`, 'utf8')
    assert.match(adminDetail, /Phương thức thanh toán/)

    const migration = readFileSync(
      `${root}/supabase/migrations/0042_invoice_payment_method_normalize.sql`,
      'utf8',
    )
    assert.match(migration, /bank_transfer/)
    assert.match(migration, /WHERE payment_method = 'transfer'/)

    const engine = readFileSync(`${root}/src/utils/payrollEngine.js`, 'utf8')
    assert.ok(!engine.includes('paymentMethod') && !engine.includes('bank_transfer'))
    console.log('  [PASS] form UI + reports + migration; payrollEngine không đụng PTTT')
  }

console.log('\n=== ALL PASS — invoice payment method UAT ===\n')
