/**
 * Generate static B2 preview HTML from engine fixture (no login).
 * Run: npx vite-node scripts/preview-branch-efficiency-b2.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../src/constants/salaryAdvanceTypes.js'
import {
  buildBranchEfficiencyPnl,
  UNKNOWN_BRANCH_ID,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../docs/uat-evidence')
const outHtml = path.join(outDir, 'branch-efficiency-b2-preview.html')
const outPng = path.join(outDir, 'branch-efficiency-b2-preview.png')

const names = (id) => ({
  'tram-spa': 'Trạm Spa',
  'soc-trang': 'Sóc Trăng',
  'song-khoe-spa': 'Sống Khoẻ',
}[id] || id)

function formatMoney(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} ₫`
}

function formatMargin(n) {
  return `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`
}

const result = buildBranchEfficiencyPnl({
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  invoices: [
    {
      id: 'inv-a', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'e1',
      tips: 80_000, serviceTotal: 1_000_000,
      services: [{ id: 's1', price: 1_000_000, commissionPercent: 20, commissionAmount: 200_000 }],
    },
    {
      id: 'inv-b', date: '2026-07-20', branchId: 'soc-trang', employeeId: 'e2', supportEmployeeId: 'e3',
      tips: 30_000, serviceTotal: 400_000,
      services: [{ id: 's2', price: 400_000, commissionPercent: 10, commissionAmount: 40_000 }],
    },
    {
      id: 'inv-u', date: '2026-07-22', branchId: '', employeeId: 'e4',
      tips: 5_000, serviceTotal: 100_000,
      services: [{ id: 's3', price: 100_000, commissionPercent: 10, commissionAmount: 10_000 }],
    },
  ],
  expenses: [
    { id: 'exp-op', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 50_000 },
    { id: 'exp-adv', date: '2026-07-13', branchId: 'tram-spa', expenseType: SALARY_ADVANCE_EXPENSE_TYPE, amount: 200_000 },
    { id: 'exp-salary', date: '2026-07-14', branchId: 'tram-spa', expenseType: 'luong', amount: 5_000_000 },
    { id: 'exp-rent-manual', date: '2026-07-15', branchId: 'tram-spa', expenseType: FIXED_EXPENSE_TYPE_ID, amount: 1_000_000 },
    { id: 'exp-st', date: '2026-07-18', branchId: 'soc-trang', expenseType: 'dien-nuoc', amount: 20_000 },
  ],
  fixedCosts: [
    { id: 'fc1', branchId: 'tram-spa', amount: 300_000 },
    { id: 'fc2', branchId: 'soc-trang', amount: 100_000 },
  ],
  adjustments: [
    { id: 'adj-b', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-11', branchId: 'tram-spa', employeeId: 'e1', amount: 25_000 },
    { id: 'adj-p', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', amount: 10_000 },
  ],
  attendanceRecords: [
    { id: 'att-1', date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', penaltyAmount: 10_000 },
  ],
  getBranchName: names,
})

function moneyCell(value, emphasizeNegative = false) {
  const n = Number(value) || 0
  const loss = emphasizeNegative && n < 0
  return `<td class="bep-num${loss ? ' is-loss' : ''}">${formatMoney(n)}</td>`
}

const rowsHtml = result.rows.map((row) => `
  <tr class="${row.isUnknown ? 'is-unknown' : ''}">
    <td>${row.branchName}${row.isUnknown ? '<span class="bep-badge">Thiếu CN</span>' : ''}</td>
    ${moneyCell(row.revenue)}
    ${moneyCell(row.operatingCost)}
    ${moneyCell(row.invoiceCommission)}
    ${moneyCell(row.bonus)}
    ${moneyCell(row.penalty)}
    ${moneyCell(row.profit, true)}
    <td class="bep-num${row.profit < 0 ? ' is-loss' : ''}">${formatMargin(row.marginPercent)}</td>
  </tr>
`).join('')

const t = result.systemTotal
const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>B2 Preview — Hiệu quả chi nhánh</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; background: #f3f4f6; color: #111; }
  .wrap { max-width: 1100px; margin: 24px auto; padding: 0 16px 40px; }
  .tabs { display: flex; gap: 6px; margin-bottom: 16px; }
  .tabs span { border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 8px 14px; font-size: 0.9rem; }
  .tabs .is-active { background: #111; color: #d4af37; border-color: #111; }
  .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
  h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .sub { margin: 0; color: #6b7280; font-size: 0.85rem; }
  .period { margin: 8px 0 0; font-size: 0.9rem; }
  .filters { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
  .filters label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #4b5563; }
  .filters span.fake { border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; background: #fafafa; min-width: 120px; }
  .note { font-size: 0.8rem; color: #6b7280; padding: 8px 10px; background: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: left; white-space: nowrap; }
  th { background: #fafafa; font-size: 0.8rem; }
  .bep-num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.is-unknown { background: #fffbeb; }
  tfoot tr { background: #111; color: #f9fafb; font-weight: 600; }
  tfoot td { border-bottom: none; }
  .is-loss { color: #b91c1c; font-weight: 700; }
  tfoot .is-loss { color: #fca5a5; }
  .bep-badge { display: inline-block; margin-left: 8px; padding: 2px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 0.7rem; font-weight: 600; }
  .meta { margin-top: 12px; font-size: 0.75rem; color: #9ca3af; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="tabs">
      <span>Quản trị CN / NV</span>
      <span class="is-active">Hiệu quả chi nhánh</span>
      <span>Tổng hợp drill-down</span>
    </div>
    <div class="panel">
      <h1>Hiệu quả chi nhánh</h1>
      <p class="sub">${result.formula}</p>
      <p class="period">Kỳ: <strong>${result.fromDate}</strong> → <strong>${result.toDate}</strong></p>
      <div class="filters">
        <label>Tháng<span class="fake">2026-07</span></label>
        <label>Kỳ lương<span class="fake">Cả tháng</span></label>
        <label>Từ ngày<span class="fake">${result.fromDate}</span></label>
        <label>Đến ngày<span class="fake">${result.toDate}</span></label>
        <label>Chi nhánh<span class="fake">Tất cả</span></label>
      </div>
      <div class="note">Không gồm tips trong doanh thu · Không gồm lương cơ bản · Không tính trùng mặt bằng / ứng lương.</div>
      <table>
        <thead>
          <tr>
            <th>Chi nhánh</th>
            <th class="bep-num">Doanh thu</th>
            <th class="bep-num">Chi phí vận hành</th>
            <th class="bep-num">% hóa đơn</th>
            <th class="bep-num">Thưởng</th>
            <th class="bep-num">Phạt</th>
            <th class="bep-num">Lợi nhuận</th>
            <th class="bep-num">Biên lợi nhuận</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td>${t.branchName}</td>
            ${moneyCell(t.revenue)}
            ${moneyCell(t.operatingCost)}
            ${moneyCell(t.invoiceCommission)}
            ${moneyCell(t.bonus)}
            ${moneyCell(t.penalty)}
            ${moneyCell(t.profit, true)}
            <td class="bep-num${t.profit < 0 ? ' is-loss' : ''}">${formatMargin(t.marginPercent)}</td>
          </tr>
        </tfoot>
      </table>
      <p class="meta">B2 Preview · unknownId=${UNKNOWN_BRANCH_ID} · fixture UAT · no drill-down</p>
    </div>
  </div>
</body>
</html>`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outHtml, html, 'utf8')
console.log('Wrote', outHtml)

// Optional PNG via puppeteer-core if Chrome available
async function maybeScreenshot() {
  let puppeteer
  try {
    puppeteer = await import('puppeteer-core')
  } catch {
    console.log('Skip PNG: puppeteer-core missing')
    return
  }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  const exe = candidates.find((p) => fs.existsSync(p))
  if (!exe) {
    console.log('Skip PNG: Chrome not found')
    return
  }
  const browser = await puppeteer.default.launch({
    executablePath: exe,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
    await page.goto(`file://${outHtml}`, { waitUntil: 'networkidle0' })
    await page.screenshot({ path: outPng, fullPage: true })
    console.log('Wrote', outPng)
  } finally {
    await browser.close()
  }
}

await maybeScreenshot()
