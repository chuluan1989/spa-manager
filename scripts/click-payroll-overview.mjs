/**
 * Bấm mở Chi tiết chuyên cần và Thu nhập theo chi nhánh trên component thật.
 * Chạy local, không ghi database.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { chromium } from 'playwright'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = path.join(root, '.tmp-payroll-overview')
mkdirSync(outDir, { recursive: true })

const entry = `
import { createRoot } from 'react-dom/client'
import { ATTENDANCE_STATUS } from './src/constants/attendanceTypes.js'
import { computeAttendanceLeaveBreakdown } from './src/utils/attendancePenalties.js'
import { computeAttendanceStats } from './src/utils/payrollLiveHelpers.js'
import { computeEmployeePayrollRow } from './src/utils/payrollEngine.js'
import { PAYROLL_ADJUSTMENT_TYPES } from './src/constants/payrollTypes.js'
import PayrollOverview from './src/components/salary/PayrollOverview.jsx'

const employee = { id: 'e-multi', name: 'Lan', branchId: 'soc-trang', salaryRate: '5000000' }
const invoices = [
  { id: 'inv-home', date: '2026-07-05', branchId: 'soc-trang', employeeId: 'e-multi', tips: 100000, services: [{ commissionAmount: 200000, price: 500000 }] },
  { id: 'inv-support', date: '2026-07-18', branchId: 'tram-spa', employeeId: 'e-multi', tips: 50000, services: [{ commissionAmount: 80000, price: 400000 }] },
]
const attendance = [
  { id: 'att-1', employeeId: 'e-multi', branchId: 'soc-trang', date: '2026-07-06', penaltyAmount: 20000, status: ATTENDANCE_STATUS.LATE_2H_UNPERMITTED },
  { id: 'att-2', employeeId: 'e-multi', branchId: 'tram-spa', date: '2026-07-20', penaltyAmount: 0, status: ATTENDANCE_STATUS.FULL_DAY_PERMITTED },
  { id: 'att-3', employeeId: 'e-multi', branchId: 'soc-trang', date: '2026-07-07', penaltyAmount: 20000, status: ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED },
]
const adjustments = [
  { id: 'bonus-1', employeeId: 'e-multi', branchId: 'tram-spa', type: PAYROLL_ADJUSTMENT_TYPES.BONUS, amount: 100000, date: '2026-07-20', month: '2026-07' },
  { id: 'penalty-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.PENALTY, amount: 50000, date: '2026-07-08', month: '2026-07' },
  { id: 'advance-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.ADVANCE, amount: 500000, date: '2026-07-12', month: '2026-07' },
  { id: 'kpi-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.KPI, amount: 200000, date: '2026-07-28', month: '2026-07' },
  { id: 'reduce-1', employeeId: 'e-multi', branchId: 'soc-trang', type: PAYROLL_ADJUSTMENT_TYPES.REDUCTION, amount: 50000, date: '2026-07-21', month: '2026-07' },
]
const row = computeEmployeePayrollRow(employee, invoices, attendance, adjustments, {
  fromDate: '2026-07-01', toDate: '2026-07-31', month: '2026-07', cycle: 'full',
})
createRoot(document.getElementById('root')).render(
  <PayrollOverview
    employee={{ employeeName: row.employeeName }}
    stats={{ ...row, paidAmount: 1000000, remainingAmount: row.netSalary - 1000000 }}
    attendanceStats={computeAttendanceStats(attendance, employee.id)}
    breakdown={computeAttendanceLeaveBreakdown(attendance, {})}
    cycle="period2"
    month="2026-07"
    fromDate="2026-07-16"
    toDate="2026-07-31"
    locks={[{ month: '2026-07', branchId: 'soc-trang', isLocked: true }]}
  />
)
`

await esbuild.build({
  absWorkingDir: root,
  stdin: { contents: entry, resolveDir: root, sourcefile: 'preview.jsx', loader: 'jsx' },
  bundle: true,
  format: 'iife',
  outfile: path.join(outDir, 'app.js'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  platform: 'browser',
  logLevel: 'warning',
})

const css = readFileSync(path.join(root, 'src/pages/Salary.css'), 'utf8')
const overviewCss = css.slice(css.indexOf('.salary-overview {'))
writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body { margin: 0; background: #f3f4f6; font-family: Inter, system-ui, sans-serif; }
  #root { width: min(1100px, 100%); margin: 16px auto; }
  ${overviewCss}
</style></head><body><div id="root"></div><script src="./app.js"></script></body></html>`)

const server = spawn('python3', ['-m', 'http.server', '8766', '--directory', outDir], { stdio: 'ignore' })
await new Promise((resolve) => setTimeout(resolve, 400))

try {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle' })
  if (await page.locator('text=Phạt đi trễ').count()) throw new Error('Chi tiết chuyên cần đang mở sẵn')
  if (await page.locator('text=CN8 Trạm Spa').count()) throw new Error('Mục chi nhánh đang mở sẵn')
  await page.getByRole('button', { name: 'Chi tiết chuyên cần' }).click()
  await page.getByRole('button', { name: 'Thu nhập & khấu trừ theo chi nhánh' }).click()
  await page.getByText('Phạt đi trễ').waitFor()
  await page.getByText('Phạt về sớm').waitFor()
  await page.getByText('Phạt nghỉ có phép').waitFor()
  await page.getByText('CN8 Trạm Spa').waitFor()
  await page.getByText('Phạt chấm công').first().waitFor()
  await page.screenshot({ path: path.join(outDir, 'desktop-open.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(outDir, 'mobile.png'), fullPage: true })
  await browser.close()
  console.log('CLICK PASS')
} finally {
  server.kill()
}
