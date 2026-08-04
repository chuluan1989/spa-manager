/**
 * Generate B3 preview — summary + drill-down modal overlay.
 * Run: npx vite-node scripts/preview-branch-efficiency-b3.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import './_polyfill-storage.mjs'
import { PAYROLL_ADJUSTMENT_TYPES } from '../src/constants/payrollTypes.js'
import { FIXED_EXPENSE_TYPE_ID } from '../src/constants/expenseTypes.js'
import { SALARY_ADVANCE_EXPENSE_TYPE } from '../src/constants/salaryAdvanceTypes.js'
import {
  buildBranchEfficiencyPnl,
} from '../src/utils/managementReports/branchEfficiencyPnl.js'
import {
  BRANCH_EFFICIENCY_DRILL_TYPES,
  buildEfficiencyDrillModel,
} from '../src/utils/managementReports/branchEfficiencyDrillDown.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../docs/uat-evidence')
const outHtml = path.join(outDir, 'branch-efficiency-b3-preview.html')
const outPng = path.join(outDir, 'branch-efficiency-b3-preview.png')

const names = (id) => ({ 'tram-spa': 'Trạm Spa', 'soc-trang': 'Sóc Trăng' }[id] || id)
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} ₫`

const payload = {
  invoices: [
    {
      id: 'inv-a', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'e1', employeeName: 'Lan',
      tips: 80_000, paymentMethod: 'cash', serviceTotal: 1_000_000,
      services: [{ id: 's1', name: 'Massage', price: 1_000_000, commissionPercent: 20, commissionAmount: 200_000 }],
    },
    {
      id: 'inv-b', date: '2026-07-20', branchId: 'soc-trang', employeeId: 'e2', supportEmployeeId: 'e3',
      tips: 30_000, paymentMethod: 'bank_transfer', serviceTotal: 400_000,
      services: [{ id: 's2', name: 'Gội', price: 400_000, commissionPercent: 10, commissionAmount: 40_000 }],
    },
    {
      id: 'inv-u', date: '2026-07-22', branchId: '', employeeId: 'e4', tips: 5_000, serviceTotal: 100_000,
      services: [{ id: 's3', name: 'Chăm da', price: 100_000, commissionPercent: 10, commissionAmount: 10_000 }],
    },
  ],
  expenses: [
    { id: 'exp-op', date: '2026-07-12', branchId: 'tram-spa', expenseType: 'vat-tu', expenseTypeLabel: 'Vật tư', content: 'Khăn', amount: 50_000, enteredBy: 'QL Trạm' },
    { id: 'exp-adv', date: '2026-07-13', branchId: 'tram-spa', expenseType: SALARY_ADVANCE_EXPENSE_TYPE, amount: 200_000 },
    { id: 'exp-salary', date: '2026-07-14', branchId: 'tram-spa', expenseType: 'luong', amount: 5_000_000 },
    { id: 'exp-rent-manual', date: '2026-07-15', branchId: 'tram-spa', expenseType: FIXED_EXPENSE_TYPE_ID, amount: 1_000_000 },
    { id: 'exp-st', date: '2026-07-18', branchId: 'soc-trang', expenseType: 'dien-nuoc', expenseTypeLabel: 'Điện nước', content: 'Hóa đơn điện', amount: 20_000, enteredBy: 'QL ST' },
  ],
  fixedCosts: [
    { id: 'fc1', branchId: 'tram-spa', amount: 300_000 },
    { id: 'fc2', branchId: 'soc-trang', amount: 100_000 },
  ],
  adjustments: [
    { id: 'adj-b', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, date: '2026-07-11', branchId: 'tram-spa', employeeId: 'e1', amount: 25_000, reason: 'KPI', createdByName: 'Admin' },
    { id: 'adj-p', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', amount: 10_000, reason: 'Đi muộn' },
  ],
  attendanceRecords: [
    { id: 'att-1', date: '2026-07-21', branchId: 'soc-trang', employeeId: 'e2', employeeName: 'Mai', penaltyAmount: 10_000, status: 'late' },
  ],
}

const report = buildBranchEfficiencyPnl({
  fromDate: '2026-07-01', toDate: '2026-07-31', ...payload, getBranchName: names,
})
const tram = report.rows.find((r) => r.branchId === 'tram-spa')
const invoiceById = new Map(payload.invoices.map((i) => [i.id, i]))
const adjustmentById = new Map(payload.adjustments.map((a) => [a.id, a]))

const revenueDrill = buildEfficiencyDrillModel({
  type: BRANCH_EFFICIENCY_DRILL_TYPES.REVENUE,
  row: tram,
  invoiceById,
  adjustmentById,
})
const commissionDrill = buildEfficiencyDrillModel({
  type: BRANCH_EFFICIENCY_DRILL_TYPES.COMMISSION,
  row: report.rows.find((r) => r.branchId === 'soc-trang'),
  invoiceById,
})
const opexDrill = buildEfficiencyDrillModel({
  type: BRANCH_EFFICIENCY_DRILL_TYPES.OPEX,
  row: tram,
})
const profitDrill = buildEfficiencyDrillModel({
  type: BRANCH_EFFICIENCY_DRILL_TYPES.PROFIT,
  row: tram,
})

const margin = (n) => `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`

const rowsHtml = report.rows.map((row) => `
  <tr class="${row.isUnknown ? 'is-unknown' : ''}">
    <td>${row.branchName}${row.isUnknown ? '<span class="badge">Thiếu CN</span>' : ''}</td>
    <td class="num link">${money(row.revenue)}</td>
    <td class="num link">${money(row.operatingCost)}</td>
    <td class="num link">${money(row.invoiceCommission)}</td>
    <td class="num link">${money(row.bonus)}</td>
    <td class="num link">${money(row.penalty)}</td>
    <td class="num link${row.profit < 0 ? ' loss' : ''}">${money(row.profit)}</td>
    <td class="num">${margin(row.marginPercent)}</td>
  </tr>`).join('')

const t = report.systemTotal

const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<title>B3 Preview — Drill-down Hiệu quả chi nhánh</title>
<style>
body{font-family:"Segoe UI",system-ui,sans-serif;margin:0;background:#f3f4f6;color:#111}
.wrap{max-width:1100px;margin:20px auto;padding:0 16px 40px;position:relative}
.tabs{display:flex;gap:6px;margin-bottom:14px}
.tabs span{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px 14px;font-size:.9rem}
.tabs .on{background:#111;color:#d4af37;border-color:#111}
.panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px}
h1{margin:0 0 4px;font-size:1.35rem}
.sub,.period{margin:0;color:#6b7280;font-size:.85rem}
.period{margin-top:6px}
.filters{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:.8rem;color:#4b5563}
.filters .fake{border:1px solid #e5e7eb;border-radius:8px;padding:7px 10px;background:#fafafa;min-width:110px}
.note{font-size:.8rem;color:#6b7280;padding:8px 10px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{padding:9px 10px;border-bottom:1px solid #f3f4f6;text-align:left}
th{background:#fafafa;font-size:.78rem}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.link{text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;color:#1d4ed8}
tr.is-unknown{background:#fffbeb}
.badge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:600}
tfoot tr{background:#111;color:#f9fafb;font-weight:600}
tfoot td{border:none}
.loss{color:#b91c1c;font-weight:700}
tfoot .loss{color:#fca5a5}
.overlay{position:absolute;inset:0;background:rgba(17,24,39,.42);border-radius:12px;display:flex;align-items:flex-start;justify-content:center;padding:48px 20px 20px}
.modal{width:min(920px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden}
.modal header{display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb}
.modal header h3{margin:0 0 4px;font-size:1.05rem}
.modal header p{margin:0;color:#6b7280;font-size:.82rem}
.modal .close{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:7px 12px}
.modal .body{padding:12px 16px 16px;max-height:420px;overflow:auto}
.modal .body h4{margin:12px 0 6px;font-size:.92rem}
.pill{display:inline-block;padding:2px 6px;border-radius:4px;background:#f3f4f6;font-size:.75rem}
.warn{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:.82rem}
.grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:900px){.grid{grid-template-columns:1.2fr .8fr}}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#fff}
.card h4{margin:0 0 8px}
.meta{margin-top:10px;font-size:.72rem;color:#9ca3af}
</style></head><body>
<div class="wrap">
  <div class="tabs"><span>Quản trị CN / NV</span><span class="on">Hiệu quả chi nhánh</span><span>Tổng hợp drill-down</span></div>
  <div class="panel" style="position:relative">
    <h1>Hiệu quả chi nhánh</h1>
    <p class="sub">${report.formula}</p>
    <p class="period">Kỳ: <strong>2026-07-01 → 2026-07-31</strong></p>
    <div class="filters">
      <label>Tháng<span class="fake">2026-07</span></label>
      <label>Kỳ lương<span class="fake">Cả tháng</span></label>
      <label>Từ ngày<span class="fake">2026-07-01</span></label>
      <label>Đến ngày<span class="fake">2026-07-31</span></label>
      <label>Chi nhánh<span class="fake">Tất cả</span></label>
    </div>
    <div class="note">Bấm số tiền để xem chi tiết · Không tips · Không lương CB · Không trùng MB/ứng</div>
    <table>
      <thead><tr>
        <th>Chi nhánh</th><th class="num">Doanh thu</th><th class="num">Chi phí vận hành</th>
        <th class="num">% hóa đơn</th><th class="num">Thưởng</th><th class="num">Phạt</th>
        <th class="num">Lợi nhuận</th><th class="num">Biên lợi nhuận</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td>${t.branchName}</td>
        <td class="num">${money(t.revenue)}</td>
        <td class="num">${money(t.operatingCost)}</td>
        <td class="num">${money(t.invoiceCommission)}</td>
        <td class="num">${money(t.bonus)}</td>
        <td class="num">${money(t.penalty)}</td>
        <td class="num">${money(t.profit)}</td>
        <td class="num">${margin(t.marginPercent)}</td>
      </tr></tfoot>
    </table>

    <div class="overlay">
      <div class="modal">
        <header>
          <div>
            <h3>Chi tiết doanh thu · Trạm Spa</h3>
            <p>2026-07-01 → 2026-07-31 · filter giữ nguyên khi Đóng</p>
          </div>
          <span class="close">Đóng</span>
        </header>
        <div class="body">
          <div class="grid">
            <div class="card">
              <h4>A. Doanh thu</h4>
              <table>
                <thead><tr><th>Ngày</th><th>Mã HĐ</th><th>NV</th><th>CN</th><th>Dịch vụ</th><th class="num">DT</th><th>PTTT</th></tr></thead>
                <tbody>
                  ${revenueDrill.lines.map((l) => `<tr>
                    <td>${l.date}</td><td>${l.invoiceId}</td><td>${l.employeeName}</td>
                    <td>${l.servingBranchName}</td><td>${l.services}</td>
                    <td class="num">${money(l.revenue)}</td><td>${l.paymentMethodLabel}</td>
                  </tr>`).join('')}
                </tbody>
                <tfoot><tr><td colspan="5">Tổng</td><td class="num">${money(revenueDrill.total)}</td><td></td></tr></tfoot>
              </table>
            </div>
            <div>
              <div class="card">
                <h4>B. Chi phí vận hành (Trạm)</h4>
                <p><strong>Mặt bằng cố định:</strong> ${money(opexDrill.fixedTotal)}</p>
                <p><strong>Chi phí phát sinh:</strong> ${money(opexDrill.variableTotal)}</p>
                <p>Nguồn: ${opexDrill.lines.map((l) => l.sourceLabel).join(', ')}</p>
              </div>
              <div class="card" style="margin-top:10px">
                <h4>C. % HĐ · Sóc Trăng (hỗ trợ 50%)</h4>
                <table>
                  <thead><tr><th>NV</th><th>Vai trò</th><th>Tỷ lệ</th><th class="num">Thực trả</th></tr></thead>
                  <tbody>
                    ${commissionDrill.lines.map((l) => `<tr>
                      <td>${l.employeeName}</td><td>${l.roleLabel}</td><td>${l.rateLabel}</td>
                      <td class="num">${money(l.amountPaid)}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>
              <div class="card" style="margin-top:10px">
                <h4>F. Giải thích LN · Trạm</h4>
                ${profitDrill.components.map((c) => `<div>${c.sign} ${c.label}: <strong>${money(c.amount)}</strong></div>`).join('')}
                <div style="margin-top:6px;font-weight:700">= Lợi nhuận: ${money(profitDrill.profit)}</div>
              </div>
            </div>
          </div>
          <p class="meta">B3 Preview · drill A–F · no sidebar · engine B1 unchanged</p>
        </div>
      </div>
    </div>
  </div>
</div>
</body></html>`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outHtml, html, 'utf8')
console.log('Wrote', outHtml)

function serveAndShot() {
  return new Promise((resolve, reject) => {
    const server = spawn('python3', ['-m', 'http.server', '5201', '--directory', outDir], {
      stdio: 'ignore',
    })
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    setTimeout(() => {
      const shot = spawn(chrome, [
        '--headless=new', '--disable-gpu', '--window-size=1280,1000',
        `--screenshot=${outPng}`,
        'http://127.0.0.1:5201/branch-efficiency-b3-preview.html',
      ], { stdio: 'ignore' })
      shot.on('exit', (code) => {
        server.kill()
        if (code === 0) {
          console.log('Wrote', outPng)
          resolve()
        } else reject(new Error(`chrome exit ${code}`))
      })
    }, 400)
  })
}

try {
  await serveAndShot()
} catch (err) {
  console.warn('PNG skipped:', err.message)
}
