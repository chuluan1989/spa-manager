/**
 * Verify: bundle không chứa thông báo khóa nhập hóa đơn.
 * Run: npm run build && npx vite-node scripts/verify-no-invoice-lock-message.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FORBIDDEN = [
  'Tài khoản đang tạm khóa chức năng nhập hóa đơn',
  'Tài khoản đang tạm hạn chế nhập hóa đơn',
  'PAYROLL1_INVOICE_LOCK_MESSAGE',
  'isEmployeeInvoiceCreateLocked',
  'invoiceCreateLocked',
]

const assetsDir = join(process.cwd(), 'dist/assets')
const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
assert.ok(jsFiles.length > 0, 'dist/assets phải có bundle JS')

for (const file of jsFiles) {
  const content = readFileSync(join(assetsDir, file), 'utf8')
  for (const snippet of FORBIDDEN) {
    assert.equal(
      content.includes(snippet),
      false,
      `Bundle ${file} vẫn chứa: ${snippet}`,
    )
  }
}

console.log('PASS — no invoice lock message or lock logic in production bundle')
