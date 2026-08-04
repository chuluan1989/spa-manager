/**
 * Preview B4 — ranking, KPI màu, banner cảnh báo.
 * Run: npx vite-node scripts/preview-branch-efficiency-b4.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import { buildBranchEfficiencyPnl } from '../src/utils/managementReports/branchEfficiencyPnl.js'
import {
  rankBranchEfficiencyRows,
  resolveMarginTone,
  resolveProfitTone,
} from '../src/utils/managementReports/branchEfficiencyRanking.js'
import { buildBranchEfficiencyWarnings } from '../src/utils/managementReports/branchEfficiencyWarnings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../docs/uat-evidence')
const outHtml = path.join(outDir, 'branch-efficiency-b4-preview.html')
const outPng = path.join(outDir, 'branch-efficiency-b4-preview.png')

const names = (id) => ({ 'tram-spa': 'Trạm Spa', 'soc-trang': 'Sóc Trăng', 'gia-lai-1': 'Gia Lai 1' }[id] || id)
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} ₫`
const margin = (n) => `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`

const payload = {
  invoices: [
    { id: 'inv-a', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'e1', tips: 80_000, serviceTotal: 1_000_000, services: [{ price: 1_000_000, commissionAmount: 200_000 }] },
    { id: 'inv-b', date: '2026-07-20', branchId: 'soc-trang', employeeId: 'e2', supportEmployeeId: 'e3', tips: 0, serviceTotal: 400_000, services: [{ price: 400_000, commissionAmount: 40_000 }] },
    { id: 'inv-c', date: '2026-07-21', branchId: 'gia-lai-1', employeeId: 'e5', tips: 0, serviceTotal: 50_000, services: [{ price: 50_000, commissionAmount: 5_000 }] },
    { id: 'inv-u', date: '2026-07-22', branchId: '', employeeId: 'e4', tips: 5_000, serviceTotal: 100_000, services: [{ price: 100_000, commissionAmount: 10_000 }] },
  ],
  expenses: [
    { id: 'exp-1', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 50_000 },
    { id: 'exp-dup', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', amount: 50_000 },
    { id: 'exp-rent', date: '2026-07-15', branchId: 'tram-spa', expenseType: FIXED_EXPENSE_TYPE_ID, amount: 1_000_000 },
    { id: 'exp-st', date: '2026-07-18', branchId: 'soc-trang', expenseType: 'dien-nuoc', amount: 20_000 },
  ],
  fixedCosts: [
    { id: 'fc1', branchId: 'tram-spa', amount: 300_000 },
    { id: 'fc2', branchId: 'soc-trang', amount: 100_000 },
    { id: 'fc3', branchId: 'gia-lai-1', amount: 200_000 },
  ],
  adjustments: [
    { id: 'adj-b', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-11', branchId: 'tram-spa', employeeId: 'e1', amount: 25_000 },
    { id: 'adj-p', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', amount: 10_000 },
    { id: 'adj-miss', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-12', branchId: '', employeeId: 'e9', amount: 5_000 },
  ],
  attendanceRecords: [
    { id: 'att-1', date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', penaltyAmount: 10_000 },
  ],
}

const report = buildBranchEfficiencyPnl({ fromDate: '2026-07-01', toDate: '2026-07-31', ...payload, getBranchName: names })
const ranked = rankBranchEfficiencyRows(report.rows, 'profit', 'desc')
const warnings = buildBranchEfficiencyWarnings({
  report, invoices: payload.invoices, expenses: payload.expenses, adjustments: payload.adjustments,
  fromDate: '2026-07-01', toDate: '2026-07-31',
})
const t = report.systemTotal

const rowsHtml = ranked.map((row) => {
  const mt = resolveMarginTone(row.marginPercent)
  const pt = resolveProfitTone(row.profit)
  return `<tr class="${row.isUnknown ? 'is-unknown' : ''}">
    <td class="num">${row.rank ?? '—'}</td>
    <td>${row.branchName}${row.isUnknown ? '<span class="badge">Thiếu CN</span>' : ''}</td>
    <td class="num link">${money(row.revenue)}</td>
    <td class="num link">${money(row.operatingCost)}</td>
    <td class="num link">${money(row.invoiceCommission)}</td>
    <td class="num link">${money(row.bonus)}</td>
    <td class="num link">${money(row.penalty)}</td>
    <td class="num link ${pt === 'loss-strong' ? 'loss-strong' : ''}">${money(row.profit)}</td>
    <td class="num kpi ${mt}">${margin(row.marginPercent)}</td>
  </tr>`
}).join('')

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>B4 Preview</title>
<style>
body{font-family:"Segoe UI",system-ui,sans-serif;margin:0;background:#f3f4f6}
.wrap{max-width:1120px;margin:20px auto;padding:0 16px 32px}
.tabs{display:flex;gap:6px;margin-bottom:12px}
.tabs span{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px 14px;font-size:.9rem}
.tabs .on{background:#111;color:#d4af37}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px}
h1{margin:0 0 4px;font-size:1.3rem}
.sub{margin:0;color:#6b7280;font-size:.85rem}
.actions{float:right;display:flex;gap:6px}
.btn{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:7px 10px;font-size:.85rem}
.btn.primary{background:#111;color:#d4af37;border-color:#111}
.filters{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;clear:both}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;color:#4b5563}
.fake{border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;background:#fafafa;min-width:110px}
.alerts{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:.86rem}
.alerts strong{display:block;margin-bottom:6px}
.legend{display:flex;gap:8px;margin:8px 0 12px;font-size:.75rem}
.legend span{padding:3px 8px;border-radius:999px;font-weight:600}
.good{background:#dcfce7;color:#166534}.warn{background:#fef9c3;color:#854d0e}.bad{background:#fee2e2;color:#991b1b}.loss-strong{background:#fecaca;color:#7f1d1d;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:.86rem}
th,td{padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:left}
th{background:#fafafa;font-size:.76rem}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.link{color:#1d4ed8;text-decoration:underline dotted}
tr.is-unknown{background:#fffbeb}
.badge{margin-left:6px;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:600}
tfoot tr{background:#111;color:#fff;font-weight:600}
tfoot td{border:none}
.kpi.good{background:#dcfce7;color:#166534;border-radius:6px}
.kpi.warn{background:#fef9c3;color:#854d0e;border-radius:6px}
.kpi.bad{background:#fee2e2;color:#991b1b;border-radius:6px}
.meta{margin-top:10px;font-size:.72rem;color:#9ca3af}
</style></head><body>
<div class="wrap">
  <div class="tabs"><span>Quản trị CN / NV</span><span class="on">Hiệu quả chi nhánh</span><span>Tổng hợp drill-down</span></div>
  <div class="panel">
    <div class="actions"><span class="btn">CSV</span><span class="btn">Excel</span><span class="btn primary">PDF</span></div>
    <h1>Hiệu quả chi nhánh</h1>
    <p class="sub">${report.formula}</p>
    <p class="sub">Kỳ: <strong>2026-07-01 → 2026-07-31</strong></p>
    <div class="filters">
      <label>Tháng<span class="fake">2026-07</span></label>
      <label>Kỳ lương<span class="fake">Cả tháng</span></label>
      <label>Từ ngày<span class="fake">2026-07-01</span></label>
      <label>Đến ngày<span class="fake">2026-07-31</span></label>
      <label>Chi nhánh<span class="fake">Tất cả</span></label>
      <label>Xếp hạng theo<span class="fake">Lợi nhuận</span></label>
    </div>
    <div class="alerts">
      <strong>Cảnh báo dữ liệu</strong>
      <ul>${warnings.items.map((w) => `<li><b>${w.title}</b> — ${w.detail}</li>`).join('')}</ul>
      <div style="margin-top:6px;font-size:.78rem;opacity:.85">Chỉ cảnh báo — không chặn báo cáo.</div>
    </div>
    <div class="legend">
      <span class="good">≥30%</span><span class="warn">20–30%</span><span class="bad">&lt;20%</span><span class="loss-strong">LN âm</span>
    </div>
    <table>
      <thead><tr>
        <th class="num">#</th><th>Chi nhánh</th><th class="num">Doanh thu</th><th class="num">Chi phí vận hành</th>
        <th class="num">% hóa đơn</th><th class="num">Thưởng</th><th class="num">Phạt</th>
        <th class="num">Lợi nhuận</th><th class="num">Biên lợi nhuận</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td class="num">—</td><td>${t.branchName}</td>
        <td class="num">${money(t.revenue)}</td><td class="num">${money(t.operatingCost)}</td>
        <td class="num">${money(t.invoiceCommission)}</td><td class="num">${money(t.bonus)}</td>
        <td class="num">${money(t.penalty)}</td><td class="num">${money(t.profit)}</td>
        <td class="num">${margin(t.marginPercent)}</td>
      </tr></tfoot>
    </table>
    <p class="meta">B4 Preview · ranking · KPI · warnings · export CSV/Excel/PDF · cache theo filter</p>
  </div>
</div>
</body></html>`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outHtml, html, 'utf8')
console.log('Wrote', outHtml)

await new Promise((resolve, reject) => {
  const server = spawn('python3', ['-m', 'http.server', '5202', '--directory', outDir], { stdio: 'ignore' })
  setTimeout(() => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    const shot = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--window-size=1280,1000',
      `--screenshot=${outPng}`,
      'http://127.0.0.1:5202/branch-efficiency-b4-preview.html',
    ], { stdio: 'ignore' })
    shot.on('exit', (code) => {
      server.kill()
      if (code === 0) {
        console.log('Wrote', outPng)
        resolve()
      } else reject(new Error(`chrome ${code}`))
    })
  }, 400)
})
