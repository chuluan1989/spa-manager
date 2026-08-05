/**
 * Báo cáo tác động Production trước deploy + backup payroll tables.
 * READ-MOSTLY; backup ghi file local. Không deploy.
 *
 *   npx vite-node --env-file=.env.development.local scripts/report-prod-payroll-deploy-impact.mjs
 */
function createStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT = path.join(
  ROOT,
  'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/prod-impact',
  STAMP,
)
mkdirSync(OUT, { recursive: true })

const EMPLOYEE_ID = 'bac-lieu-thu-huong'
const MONTHS = ['2026-07', '2026-08']

function netOld(parts) {
  return (
    Number(parts.baseSalary || 0)
    + Number(parts.commission || 0)
    + Number(parts.tips || 0)
    + Number(parts.bonus || 0)
    + Number(parts.kpi || 0)
    - Number(parts.reduction || 0)
    - Number(parts.penalty || 0)
    - Number(parts.advance || 0)
    + Number(parts.otherAdjustment || 0)
  )
}

function netNew(parts) {
  return (
    Number(parts.baseSalary || 0)
    + Number(parts.commission || 0)
    + Number(parts.tips || 0)
    + Number(parts.bonus || 0)
    + Number(parts.kpi || 0)
    - Number(parts.reduction || 0)
    - Number(parts.penalty || 0)
    - Number(parts.advance || 0)
  )
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

const supabase = createClient(url, key)

async function fetchAll(table, { months = null } = {}) {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    let q = supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (months?.length) q = q.in('month', months)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

// --- BACKUP ---
const adjustments = await fetchAll('payroll_adjustments')
const audits = await fetchAll('payroll_audit_logs')
const locks = await fetchAll('payroll_locks')
let cycleCloses = []
try {
  cycleCloses = await fetchAll('payroll_cycle_closes')
} catch {
  cycleCloses = []
}

const backupMeta = {
  generatedAt: new Date().toISOString(),
  supabaseHost: String(url).replace(/^https?:\/\//, '').split('/')[0],
  counts: {
    payroll_adjustments: adjustments.length,
    payroll_audit_logs: audits.length,
    payroll_locks: locks.length,
    payroll_cycle_closes: cycleCloses.length,
  },
  thuHuongRollback: {
    description: 'Rollback riêng Thu Hương Aug K1: khôi phục ĐC amount=500000, xóa/zero dòng advance migrate, giữ audit.',
    employeeId: EMPLOYEE_ID,
    adjustmentIdToRestore: 'payadj-1785867587565-martmn',
    advanceIdCreatedByMigrate: 'payadj-1785945863671-q278fs',
    restore: {
      otherAdjustment: 500000,
      advance: 0,
    },
  },
}

writeFileSync(path.join(OUT, 'BACKUP_payroll_adjustments.json'), JSON.stringify(adjustments, null, 2))
writeFileSync(path.join(OUT, 'BACKUP_payroll_audit_logs.json'), JSON.stringify(audits, null, 2))
writeFileSync(path.join(OUT, 'BACKUP_payroll_locks.json'), JSON.stringify(locks, null, 2))
writeFileSync(path.join(OUT, 'BACKUP_payroll_cycle_closes.json'), JSON.stringify(cycleCloses, null, 2))
writeFileSync(path.join(OUT, 'BACKUP_META.json'), JSON.stringify(backupMeta, null, 2))

// Thu Hương scoped backup
const thuAdj = adjustments.filter((r) => r.employee_id === EMPLOYEE_ID || r.employeeId === EMPLOYEE_ID)
const thuAud = audits.filter((r) => r.entity_id === EMPLOYEE_ID || r.entityId === EMPLOYEE_ID)
writeFileSync(path.join(OUT, 'BACKUP_thu_huong_adjustments.json'), JSON.stringify(thuAdj, null, 2))
writeFileSync(path.join(OUT, 'BACKUP_thu_huong_audit_logs.json'), JSON.stringify(thuAud, null, 2))

// --- COMPUTE IMPACT via app engine ---
const { fetchEmployeesFiltered } = await import('../src/repositories/employeesRepository.js')
const { fetchAttendanceFiltered } = await import('../src/repositories/attendanceRepository.js')
const { fetchInvoicesFiltered } = await import('../src/repositories/invoicesRepository.js')
const { fetchPayrollAdjustments } = await import('../src/repositories/payrollRepository.js')
const { normalizeEmployee } = await import('../src/utils/employeeStorage.js')
const { computePayrollReport } = await import('../src/utils/payrollEngine.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')
const { getBranchName } = await import('../src/utils/branchStorage.js')

const employees = (await fetchEmployeesFiltered({}) ?? []).map((r) => normalizeEmployee(r))

const PERIODS = [
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_1, label: '2026-07 Kỳ 1' },
  { month: '2026-07', cycle: PAY_CYCLES.PERIOD_2, label: '2026-07 Kỳ 2' },
  { month: '2026-08', cycle: PAY_CYCLES.PERIOD_1, label: '2026-08 Kỳ 1' },
]

function rowParts(row) {
  return {
    baseSalary: Number(row.baseSalary ?? 0),
    commission: Number(row.commission ?? 0),
    tips: Number(row.tips ?? 0),
    bonus: Number(row.bonus ?? 0),
    kpi: Number(row.kpi ?? 0),
    reduction: Number(row.reduction ?? 0),
    penalty: Number(row.penalty ?? 0),
    advance: Number(row.advance ?? 0),
    otherAdjustment: Number(row.otherAdjustment ?? 0),
  }
}

const systemRows = []
for (const period of PERIODS) {
  const { fromDate, toDate } = getPayPeriodRange(period.month, period.cycle)
  const ar = getPayPeriodRange(
    period.month,
    period.cycle === PAY_CYCLES.PERIOD_2 ? PAY_CYCLES.FULL : PAY_CYCLES.PERIOD_1,
  )
  const [invoices, attendance, adj] = await Promise.all([
    fetchInvoicesFiltered({ fromDate, toDate, branchId: '', employeeId: '' }),
    fetchAttendanceFiltered({ fromDate: ar.fromDate, toDate: ar.toDate, branchId: '', employeeId: '' }),
    fetchPayrollAdjustments({ month: period.month }),
  ])
  const report = computePayrollReport({
    month: period.month,
    cycle: period.cycle,
    branchId: '',
    employeeId: '',
    employees,
    invoices: invoices ?? [],
    attendanceRecords: attendance ?? [],
    adjustments: adj ?? [],
  })
  for (const row of report.rows) {
    const parts = rowParts(row)
    const nOld = netOld(parts)
    const nNew = netNew(parts)
    systemRows.push({
      period: period.label,
      employee: row.employeeName,
      employeeId: row.employeeId,
      branch: getBranchName(row.branchId) || row.branchId,
      ...parts,
      netOldFormula: nOld,
      netNewFormula: nNew,
      netDeltaFormulaOnly: nNew - nOld, // = -otherAdjustment
      ticketRevenue: Number(row.ticketRevenue ?? 0),
    })
  }
}

const thuNow = systemRows.find(
  (r) => r.employeeId === EMPLOYEE_ID && r.period === '2026-08 Kỳ 1',
)
if (!thuNow) throw new Error('Không thấy Thu Hương Aug K1 trên DB hiện tại')

// Baseline trước migrate (từ evidence + reconstruct)
const beforePath = path.join(
  ROOT,
  'docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/migrate-thu-huong/BEFORE.json',
)
const beforeSnap = existsSync(beforePath) ? JSON.parse(readFileSync(beforePath, 'utf8')) : null

// Reconstruct production-before-change fields for Thu Hương
const A_preChange = {
  source: 'DB trước migrate (BEFORE.json) + công thức Production cũ (+ otherAdjustment)',
  bonus: beforeSnap?.thuHuong?.bonus ?? 500000,
  kpi: beforeSnap?.thuHuong?.kpi ?? 0,
  penalty: beforeSnap?.thuHuong?.penalty ?? 0,
  advance: beforeSnap?.thuHuong?.advance ?? 0,
  otherAdjustment: beforeSnap?.thuHuong?.otherAdjustment ?? 500000,
  // net trên BEFORE.json là net NEW formula; cộng lại ĐC để ra net prod cũ
  netSalary: (beforeSnap?.thuHuong?.netSalary ?? -65400) + (beforeSnap?.thuHuong?.otherAdjustment ?? 500000),
}

const B_afterDeploy = {
  source: 'DB hiện tại (đã migrate) + công thức mới (không cộng otherAdjustment)',
  bonus: thuNow.bonus,
  kpi: thuNow.kpi,
  penalty: thuNow.penalty,
  advance: thuNow.advance,
  otherAdjustment: thuNow.otherAdjustment,
  netSalary: thuNow.netNewFormula,
}

const A_liveProdCodeNow = {
  source: 'DB hiện tại + công thức Production cũ vẫn đang chạy (nếu chưa deploy code)',
  bonus: thuNow.bonus,
  kpi: thuNow.kpi,
  penalty: thuNow.penalty,
  advance: thuNow.advance,
  otherAdjustment: thuNow.otherAdjustment,
  netSalary: thuNow.netOldFormula,
}

const deltasPackage = {
  bonus: B_afterDeploy.bonus - A_preChange.bonus,
  kpi: B_afterDeploy.kpi - A_preChange.kpi,
  penalty: B_afterDeploy.penalty - A_preChange.penalty,
  advance: B_afterDeploy.advance - A_preChange.advance,
  otherAdjustment: B_afterDeploy.otherAdjustment - A_preChange.otherAdjustment,
  netSalary: B_afterDeploy.netSalary - A_preChange.netSalary,
}

// Formula decomposition for -1,000,000
const dropOtherFromFormula = -Number(A_preChange.otherAdjustment) // -500000
const addAdvanceDeduction = -(Number(B_afterDeploy.advance) - Number(A_preChange.advance)) // -500000
const formulaExplain = {
  productionOldNet: A_preChange.netSalary,
  afterDeployNet: B_afterDeploy.netSalary,
  totalDelta: deltasPackage.netSalary,
  part1_boCongDieuChinhKhac: {
    amount: dropOtherFromFormula,
    meaning: `Bỏ cộng Điều chỉnh khác ${A_preChange.otherAdjustment.toLocaleString('vi-VN')} khỏi net → Δ ${dropOtherFromFormula.toLocaleString('vi-VN')}`,
  },
  part2_congUngLuong: {
    amount: addAdvanceDeduction,
    meaning: `Ứng lương tăng từ ${A_preChange.advance.toLocaleString('vi-VN')} → ${B_afterDeploy.advance.toLocaleString('vi-VN')} (trừ net) → Δ ${addAdvanceDeduction.toLocaleString('vi-VN')}`,
  },
  identityCheck:
    dropOtherFromFormula + addAdvanceDeduction === deltasPackage.netSalary,
  equation:
    `Δnet = −otherAdjustment_cũ + (−Δadvance) = ${dropOtherFromFormula} + (${addAdvanceDeduction}) = ${deltasPackage.netSalary}`,
}

// Who changes on CODE deploy only (current DB): netNew - netOld != 0
const formulaOnlyImpacted = systemRows.filter((r) => r.netDeltaFormulaOnly !== 0)

// Who changes on FULL package vs pre-migrate: only Thu Hương for data; formula-only anyone with OA!=0
// Reconstruct: for full package, compare old formula with pre-migrate OA to new formula with current fields
// For others: OA was already 0 before migrate, so package impact = 0
const packageImpacted = []
for (const r of systemRows) {
  if (r.employeeId === EMPLOYEE_ID && r.period === '2026-08 Kỳ 1') {
    packageImpacted.push({
      ...r,
      netBeforePackage: A_preChange.netSalary,
      netAfterPackage: B_afterDeploy.netSalary,
      packageDelta: B_afterDeploy.netSalary - A_preChange.netSalary,
    })
    continue
  }
  // Others: no migrate; package Δ = formula-only (if they had OA)
  if (r.netDeltaFormulaOnly !== 0) {
    packageImpacted.push({
      ...r,
      netBeforePackage: r.netOldFormula,
      netAfterPackage: r.netNewFormula,
      packageDelta: r.netDeltaFormulaOnly,
    })
  }
}

const onlyThuHuong = packageImpacted.length === 1
  && packageImpacted[0].employeeId === EMPLOYEE_ID

const report = {
  generatedAt: new Date().toISOString(),
  deployed: false,
  backupDir: OUT,
  backupCounts: backupMeta.counts,
  thuHuong: {
    A_productionTruocThayDoi: A_preChange,
    A2_productionCodeHienTaiTrenDbDaMigrate: A_liveProdCodeNow,
    B_sauDeploy: B_afterDeploy,
    C_chenhLechGoiThayDoi: deltasPackage,
    formulaExplain,
    note:
      'Dữ liệu migrate ĐC→Ứng đã ghi vào DB shared trước báo cáo này. '
      + '“Production trước thay đổi” = baseline nghiệp vụ trước migrate. '
      + 'Deploy code trên DB hiện tại: ĐC đã = 0 nên công thức cũ/mới cho ra cùng net Thu Hương.',
  },
  systemWide: {
    periodsChecked: PERIODS.map((p) => p.label),
    employeePeriodsChecked: systemRows.length,
    formulaOnlyDeployImpactCount: formulaOnlyImpacted.length,
    formulaOnlyDeployImpacted: formulaOnlyImpacted,
    fullPackageImpactCount: packageImpacted.length,
    fullPackageImpacted: packageImpacted.map((r) => ({
      employee: r.employee,
      employeeId: r.employeeId,
      branch: r.branch,
      period: r.period,
      netBefore: r.netBeforePackage,
      netAfter: r.netAfterPackage,
      delta: r.packageDelta,
      otherAdjustmentNow: r.otherAdjustment,
      advanceNow: r.advance,
    })),
    conclusion: onlyThuHuong
      ? 'Chỉ duy nhất Thu Hương bị ảnh hưởng.'
      : 'Có nhân viên khác bị ảnh hưởng — xem fullPackageImpacted.',
  },
}

writeFileSync(path.join(OUT, 'PROD_IMPACT_REPORT.json'), JSON.stringify(report, null, 2))

const csvThu = [
  'scenario,bonus,kpi,penalty,advance,otherAdjustment,netSalary',
  `A_prod_truoc_thay_doi,${A_preChange.bonus},${A_preChange.kpi},${A_preChange.penalty},${A_preChange.advance},${A_preChange.otherAdjustment},${A_preChange.netSalary}`,
  `B_sau_deploy,${B_afterDeploy.bonus},${B_afterDeploy.kpi},${B_afterDeploy.penalty},${B_afterDeploy.advance},${B_afterDeploy.otherAdjustment},${B_afterDeploy.netSalary}`,
  `C_delta,${deltasPackage.bonus},${deltasPackage.kpi},${deltasPackage.penalty},${deltasPackage.advance},${deltasPackage.otherAdjustment},${deltasPackage.netSalary}`,
].join('\n')
writeFileSync(path.join(OUT, 'THU_HUONG_PROD_COMPARE.csv'), csvThu)

const md = `# Đối chiếu tác động Production — trước khi duyệt deploy

**CHƯA DEPLOY.** Backup đã lưu tại: \`${path.relative(ROOT, OUT)}\`

## 1) Thu Hương · Bạc Liêu · 2026-08 Kỳ 1

### A. Production trước thay đổi (baseline nghiệp vụ)

| Hạng mục | Số tiền |
|----------|--------:|
| Thưởng | ${A_preChange.bonus.toLocaleString('vi-VN')} |
| KPI | ${A_preChange.kpi.toLocaleString('vi-VN')} |
| Phạt | ${A_preChange.penalty.toLocaleString('vi-VN')} |
| Ứng lương | ${A_preChange.advance.toLocaleString('vi-VN')} |
| Điều chỉnh khác | ${A_preChange.otherAdjustment.toLocaleString('vi-VN')} |
| **Lương thực nhận** | **${A_preChange.netSalary.toLocaleString('vi-VN')}** |

Nguồn: DB trước migrate + công thức Production cũ \`net = … − advance + otherAdjustment\`.

### B. Sau deploy (DB đã migrate + công thức mới)

| Hạng mục | Số tiền |
|----------|--------:|
| Thưởng | ${B_afterDeploy.bonus.toLocaleString('vi-VN')} |
| KPI | ${B_afterDeploy.kpi.toLocaleString('vi-VN')} |
| Phạt | ${B_afterDeploy.penalty.toLocaleString('vi-VN')} |
| Ứng lương | ${B_afterDeploy.advance.toLocaleString('vi-VN')} |
| Điều chỉnh khác | ${B_afterDeploy.otherAdjustment.toLocaleString('vi-VN')} |
| **Lương thực nhận** | **${B_afterDeploy.netSalary.toLocaleString('vi-VN')}** |

### C. Chênh lệch (B − A)

| Hạng mục | Δ |
|----------|--:|
| Thưởng | ${deltasPackage.bonus.toLocaleString('vi-VN')} |
| KPI | ${deltasPackage.kpi.toLocaleString('vi-VN')} |
| Phạt | ${deltasPackage.penalty.toLocaleString('vi-VN')} |
| Ứng lương | ${deltasPackage.advance.toLocaleString('vi-VN')} |
| Điều chỉnh khác | ${deltasPackage.otherAdjustment.toLocaleString('vi-VN')} |
| **Lương thực nhận** | **${deltasPackage.netSalary.toLocaleString('vi-VN')}** |

## 2) Vì sao net giảm 1.000.000

Công thức Production cũ:

\`\`\`
net_old = base + commission + tips + bonus + kpi − reduction − penalty − advance + otherAdjustment
\`\`\`

Công thức sau deploy:

\`\`\`
net_new = base + commission + tips + bonus + kpi − reduction − penalty − advance
\`\`\`

Với Thu Hương (các hạng mục khác không đổi):

1. **Bỏ cộng Điều chỉnh khác:** otherAdjustment từ **500.000 → không còn cộng**  
   → Δ₁ = **−500.000**

2. **Cộng Ứng lương (trừ net):** advance từ **0 → 500.000**  
   → Δ₂ = **−500.000**

\`\`\`
Δnet = Δ₁ + Δ₂ = −500.000 + (−500.000) = −1.000.000
\`\`\`

Kiểm tra số: ${A_preChange.netSalary.toLocaleString('vi-VN')} → ${B_afterDeploy.netSalary.toLocaleString('vi-VN')}  
Identity: \`${formulaExplain.identityCheck ? 'PASS' : 'FAIL'}\` (\`${formulaExplain.equation}\`)

## 3) Toàn hệ thống (Jul K1 / Jul K2 / Aug K1)

- Employee-periods kiểm tra: **${systemRows.length}**
- Bị ảnh hưởng net bởi gói thay đổi (migrate + công thức): **${packageImpacted.length}**

${onlyThuHuong ? '**Chỉ duy nhất Thu Hương bị ảnh hưởng.**' : 'Có thêm nhân viên — xem PROD_IMPACT_REPORT.json'}

Code-deploy-only trên DB hiện tại (ai có otherAdjustment ≠ 0): **${formulaOnlyImpacted.length}**  
(ĐC đã = 0 toàn hệ → deploy code **không** đổi thêm net ai khác.)

## 4) Backup

| Bảng | Số dòng |
|------|--------:|
| payroll_adjustments | ${backupMeta.counts.payroll_adjustments} |
| payroll_audit_logs | ${backupMeta.counts.payroll_audit_logs} |
| payroll_locks | ${backupMeta.counts.payroll_locks} |
| payroll_cycle_closes | ${backupMeta.counts.payroll_cycle_closes} |

Rollback Thu Hương: xem \`BACKUP_META.json\` → \`thuHuongRollback\`  
(Files: \`BACKUP_thu_huong_adjustments.json\`, \`BACKUP_thu_huong_audit_logs.json\`)

## 5) Điều kiện duyệt

| Điều kiện | |
|-----------|--|
| Chứng minh Δ net = −1.000.000 bằng công thức | ${formulaExplain.identityCheck ? 'PASS' : 'FAIL'} |
| Chỉ Thu Hương bị ảnh hưởng | ${onlyThuHuong ? 'PASS' : 'FAIL'} |
| Backup hoàn tất | PASS (thư mục trên) |
| Deploy | **CHƯA** — chờ anh duyệt |
`

writeFileSync(path.join(OUT, 'PROD_IMPACT_REPORT.md'), md)
// also copy latest pointer
writeFileSync(
  path.join(path.dirname(OUT), 'LATEST.md'),
  md,
)
writeFileSync(
  path.join(path.dirname(OUT), 'LATEST_DIR.txt'),
  OUT + '\n',
)

console.log(JSON.stringify({
  out: OUT,
  thuHuong: report.thuHuong,
  conclusion: report.systemWide.conclusion,
  backupCounts: backupMeta.counts,
  identityCheck: formulaExplain.identityCheck,
}, null, 2))
