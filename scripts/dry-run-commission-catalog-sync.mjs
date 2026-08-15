/**
 * Dry-run đồng bộ % catalog — KHÔNG ghi Production.
 * Dùng snapshot điều tra 2026-08-16 (read-only).
 * Chạy: npx vite-node scripts/dry-run-commission-catalog-sync.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { planOfficialCommissionCatalogSync } from '../src/utils/officialCommissionCatalogSync.js'
import {
  GIA_LAI_SNAPSHOT,
  PRICE_SNAPSHOT,
} from './fixtures/commission-prices-snapshot-2026-08-16.mjs'

function toPrices(rows) {
  return rows.map(([branchId, durationId, name, commissionPercent]) => ({
    branchId,
    durationId,
    name,
    commissionPercent,
  }))
}

function toNameMap(rows) {
  const map = {}
  for (const [branchId, durationId, name] of rows) {
    map[`${branchId}:${durationId}`] = name
  }
  return map
}

const syncable = toPrices(PRICE_SNAPSHOT)
const giaLaiSample = toPrices(GIA_LAI_SNAPSHOT)
const plan = planOfficialCommissionCatalogSync({
  prices: [...syncable, ...giaLaiSample],
  nameByKey: toNameMap([...PRICE_SNAPSHOT, ...GIA_LAI_SNAPSHOT]),
})

const outDir = 'docs/uat-evidence/commission-catalog-sot'
mkdirSync(outDir, { recursive: true })

const payload = {
  mode: 'DRY_RUN',
  wroteProduction: false,
  source: 'production snapshot 2026-08-16 (investigation) — no live write',
  generatedAt: new Date().toISOString(),
  summary: {
    ...plan.summary,
    giaLaiBlockedFullAuditCount: 68,
    giaLaiNote: 'Fixture chỉ mẫu; audit đủ 34+34 dòng đều BLOCKED, không sync 40%.',
  },
  giaLai: {
    status: 'BLOCKED',
    policyInCode: 'FLAT 40% (commissionPolicyTypes.FLAT_40_BRANCH_IDS)',
    catalogUi: '0/10/20 theo seed gia đình',
    invoiceEvidence: 'Không thấy HĐ Gia Lai trong mẫu 800 HĐ gần nhất lúc điều tra',
    conclusion: 'Chưa đủ bằng chứng 40% đang áp dụng thật. Không sync batch này.',
  },
  changes: plan.rows.filter((r) => r.status === 'CHANGE'),
  unchanged: plan.rows.filter((r) => r.status === 'UNCHANGED'),
  ambiguous: plan.rows.filter((r) => r.status === 'AMBIGUOUS'),
}

writeFileSync(`${outDir}/DRY_RUN.json`, JSON.stringify(payload, null, 2))

const lines = [
  '# Dry-run đồng bộ % hoa hồng catalog — CHƯA GHI PRODUCTION',
  '',
  `Generated: ${payload.generatedAt}`,
  '',
  'Nguồn: snapshot production read-only 16/08/2026. Script này không UPDATE `branch_service_prices`.',
  '',
  '## Tổng (chi nhánh được phép sync)',
  '',
  `| Metric | Số |`,
  `|--------|----|`,
  `| Dòng sẽ đổi | ${plan.summary.changeCount} |`,
  `| Dòng không đổi | ${plan.summary.unchangedCount} |`,
  `| Ambiguous | ${plan.summary.ambiguousCount} |`,
  `| Gia Lai BLOCKED (đủ audit) | 68 |`,
  '',
  '## Gia Lai — BLOCKED',
  '',
  '- Rule 40% chỉ có trong `src/constants/commissionPolicyTypes.js` (`FLAT_40_BRANCH_IDS`).',
  '- UI catalog đang 0/10/20.',
  '- Không thấy HĐ Gia Lai trong mẫu điều tra.',
  '- **Không sync 40%** cho đến khi owner duyệt.',
  '',
  '## Dòng sẽ đổi',
  '',
  '| Chi nhánh | Dịch vụ | UI hiện tại | Rule chuẩn | Sau sync |',
  '|---|---|---|---|---|',
]

for (const r of payload.changes.sort((a, b) => a.branchId.localeCompare(b.branchId) || a.durationId.localeCompare(b.durationId))) {
  lines.push(`| ${r.branchId} | ${r.name} (${r.durationId}) | ${r.currentPercent} | ${r.plannedPercent} | ${r.plannedPercent} |`)
}

lines.push('', '## Dòng không đổi (rút gọn)', '')
const byBranch = {}
for (const r of payload.unchanged) {
  byBranch[r.branchId] = (byBranch[r.branchId] || 0) + 1
}
for (const [b, n] of Object.entries(byBranch)) {
  lines.push(`- ${b}: ${n} dòng đã đúng rule`)
}

writeFileSync(`${outDir}/DRY_RUN.md`, `${lines.join('\n')}\n`)

console.log(JSON.stringify({
  wroteProduction: false,
  summary: payload.summary,
  changes: payload.changes.map((r) => `${r.branchId} ${r.name} ${r.currentPercent}→${r.plannedPercent}`),
}, null, 2))
