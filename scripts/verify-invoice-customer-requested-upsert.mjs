/**
 * LOCAL UAT — invoice upsert retry must preserve customer_requested.
 * Mock Supabase only. No Production write. No backfill.
 *
 * Run: npx vite-node scripts/verify-invoice-customer-requested-upsert.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import {
  invoiceToRow,
  parseMissingInvoiceColumn,
  stripNamedInvoiceColumns,
  upsertInvoiceRowsWithRetry,
  OPTIONAL_INVOICE_COLUMNS,
} from '../src/repositories/invoicesRepository.js'
import { rowToCamel } from '../src/repositories/caseUtils.js'
import { computeEmployeeKpi, missingRequestedInvoices } from '../src/utils/employeeKpiEngine.js'
import { buildAdminKpiDashboard } from '../src/utils/adminKpiDashboard.js'
import { KPI_PENALTY_PER_MISSING, SEP2026_KPI_TARGETS } from '../src/constants/kpiPolicy.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const results = []

function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: Boolean(pass), detail })
  if (pass) console.log(`  [PASS] ${id} ${name}`)
  else {
    console.error(`  [FAIL] ${id} ${name}`)
    if (detail) console.error(`         ${detail}`)
  }
}

function createMockSupabase({ missingColumns = [], store = new Map() } = {}) {
  let calls = 0
  const attempts = []
  return {
    attempts,
    store,
    from() {
      return {
        upsert(payload) {
          const rows = Array.isArray(payload) ? payload : [payload]
          return {
            async select() {
              calls += 1
              attempts.push(rows.map((row) => ({ ...row })))
              for (const row of rows) {
                for (const column of missingColumns) {
                  if (Object.prototype.hasOwnProperty.call(row, column)) {
                    return {
                      data: null,
                      error: { message: `column invoices.${column} does not exist` },
                    }
                  }
                }
              }
              const data = []
              for (const row of rows) {
                const prev = store.get(row.id) || {}
                store.set(row.id, { ...prev, ...row })
                data.push({ id: row.id })
              }
              return { data, error: null }
            },
          }
        },
      }
    },
  }
}

function baseInvoice(overrides = {}) {
  return {
    id: 'uat-cr-inv-1',
    date: '2026-09-08',
    branchId: 'soc-trang',
    branchName: 'Sóc Trăng',
    employeeId: 'emp-lyly',
    employeeName: 'Ly Ly',
    supportEmployeeId: 'emp-support',
    supportEmployeeName: 'Support',
    customerName: 'Khách UAT',
    customerPhone: '0900000000',
    customerRequested: true,
    serviceIds: ['body-60'],
    services: [{ serviceId: 'body-60', id: 'body-60', name: 'Body 60' }],
    tips: 0,
    paymentMethod: 'cash',
    note: '',
    serviceTotal: 300000,
    total: 300000,
    commission: 0,
    originalServiceTotal: 300000,
    discountInput: '',
    discountType: '',
    discountValue: 0,
    discountAmount: 0,
    enteredBy: 'UAT',
    invoiceTime: '10:00',
    createdAt: '2026-09-08T03:00:00.000Z',
    homeBranchId: 'soc-trang',
    homeBranchName: 'Sóc Trăng',
    updatedBy: 'UAT',
    ...overrides,
  }
}

const PRODUCTION_MISSING_LIKE = [
  'home_branch_id',
  'home_branch_name',
  'customer_phone',
  'invoice_time',
  'entered_by',
  'discount_input',
  'discount_type',
  'discount_value',
  'discount_amount',
  'original_service_total',
  'updated_by',
]

const policies = [{
  id: 'uat-soc-trang-sep',
  branchId: 'soc-trang',
  effectiveFrom: '2026-09-01',
  addonTarget: 0.8,
  advancedTarget: 0.2,
  comboTarget: 0.3,
  requestedTarget: 0.2,
  duration90Target: 0.3,
}]

console.log('\n=== LOCAL — customer_requested upsert retry ===\n')

{
  const src = readFileSync(join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
  check(
    'src-no-bulk-strip',
    'Không còn strip cả OPTIONAL_INVOICE_COLUMNS',
    !src.includes('for (const column of OPTIONAL_INVOICE_COLUMNS)')
    && src.includes('parseMissingInvoiceColumn')
    && src.includes('stripNamedInvoiceColumns'),
  )
  check(
    'src-no-catchall-delete',
    'Không còn delete next.customer_requested trong catch-all',
    !src.includes('delete next.customer_requested'),
  )
}

{
  const pg = parseMissingInvoiceColumn('column invoices.home_branch_id does not exist')
  const cache = parseMissingInvoiceColumn(
    "Could not find the 'customer_phone' column of 'invoices' in the schema cache",
  )
  const onlyHome = parseMissingInvoiceColumn(
    'column invoices.home_branch_id does not exist',
    OPTIONAL_INVOICE_COLUMNS,
  )
  check('parse-pg', 'Parse Postgres missing column', pg === 'home_branch_id')
  check('parse-cache', 'Parse PostgREST schema-cache column', cache === 'customer_phone')
  check('parse-one', 'Chỉ lấy đúng 1 cột', onlyHome === 'home_branch_id')
}

{
  const rows = [{ id: '1', customer_requested: true, home_branch_id: 'soc-trang', customer_phone: '1' }]
  const next = stripNamedInvoiceColumns(rows, ['home_branch_id'])
  check(
    'strip-one',
    'stripNamed chỉ xóa cột được chỉ định',
    next[0].home_branch_id === undefined
    && next[0].customer_requested === true
    && next[0].customer_phone === '1',
  )
}

{
  const invoice = baseInvoice({ customerRequested: true })
  const row = invoiceToRow(invoice)
  check('map-true', 'customerRequested true → customer_requested true', row.customer_requested === true)
  const falseRow = invoiceToRow(baseInvoice({ customerRequested: false }))
  check('map-false', 'customerRequested false → customer_requested false', falseRow.customer_requested === false)
}

{
  const client = createMockSupabase({ missingColumns: ['home_branch_id'] })
  const row = invoiceToRow(baseInvoice({ customerRequested: true }))
  assert.equal(row.customer_requested, true)
  assert.equal(row.home_branch_id, 'soc-trang')
  const data = await upsertInvoiceRowsWithRetry([row], client)
  const stored = client.store.get(row.id)
  check('create-true', 'TRUE create: retry bỏ home_branch_id, giữ customer_requested=true',
    data?.[0]?.id === row.id
    && client.attempts.length >= 2
    && client.attempts[0].some((r) => r.home_branch_id === 'soc-trang' && r.customer_requested === true)
    && client.attempts.at(-1).every((r) => r.home_branch_id === undefined && r.customer_requested === true)
    && stored?.customer_requested === true)
}

{
  const client = createMockSupabase({ missingColumns: ['home_branch_id'] })
  const row = invoiceToRow(baseInvoice({ id: 'uat-cr-inv-false', customerRequested: false }))
  await upsertInvoiceRowsWithRetry([row], client)
  check('create-false', 'FALSE create: stored customer_requested=false',
    client.store.get(row.id)?.customer_requested === false)
}

{
  const client = createMockSupabase({
    missingColumns: PRODUCTION_MISSING_LIKE,
    store: new Map([['uat-cr-inv-1', { id: 'uat-cr-inv-1', customer_requested: false }]]),
  })
  const row = invoiceToRow(baseInvoice({ customerRequested: true }))
  await upsertInvoiceRowsWithRetry([row], client)
  const stored = client.store.get(row.id)
  const last = client.attempts.at(-1)[0]
  check('update-false-true', 'Update false → true: DB true, optional missing columns stripped one-by-one',
    stored?.customer_requested === true
    && last.customer_requested === true
    && PRODUCTION_MISSING_LIKE.every((col) => last[col] === undefined)
    && client.attempts.length === PRODUCTION_MISSING_LIKE.length + 1)
}

{
  const client = createMockSupabase({
    missingColumns: ['home_branch_id', 'customer_phone'],
    store: new Map([['uat-cr-inv-1', { id: 'uat-cr-inv-1', customer_requested: true }]]),
  })
  const row = invoiceToRow(baseInvoice({ customerRequested: false }))
  await upsertInvoiceRowsWithRetry([row], client)
  check('update-true-false', 'Update true → false: DB false, customer_requested không bị xóa khỏi payload',
    client.store.get(row.id)?.customer_requested === false
    && client.attempts.every((attempt) => attempt[0].customer_requested === false))
}

{
  const client = createMockSupabase({ missingColumns: ['home_branch_id'] })
  const row = invoiceToRow(baseInvoice({ customerRequested: true }))
  await upsertInvoiceRowsWithRetry([row], client)
  const retryPreserved = client.attempts.slice(1).every((attempt) => attempt[0].customer_requested === true)
  check('retry-preserves', 'Optional-column retry preserves customer_requested', retryPreserved)
}

{
  const stored = invoiceToRow(baseInvoice({ customerRequested: true }))
  const camel = rowToCamel(stored)
  check('read-normalize', 'Read snake → camel customerRequested true', camel.customerRequested === true)

  const extra = {
    id: 'uat-cr-inv-2',
    date: '2026-09-08',
    branchId: 'soc-trang',
    employeeId: 'emp-lyly',
    supportEmployeeId: 'emp-support',
    customerRequested: false,
    services: [{ serviceId: 'body-60', id: 'body-60' }],
  }
  const invoices = [camel, extra]
  const empModel = computeEmployeeKpi(invoices, {
    employeeId: 'emp-lyly',
    homeBranchId: 'soc-trang',
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
  })
  const supportModel = computeEmployeeKpi(invoices, {
    employeeId: 'emp-support',
    homeBranchId: 'soc-trang',
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
  })
  const admin = buildAdminKpiDashboard(invoices, {
    fromDate: '2026-09-01',
    toDate: '2026-09-15',
    policies,
    employees: [
      { id: 'emp-lyly', name: 'Ly Ly', branchId: 'soc-trang' },
      { id: 'emp-support', name: 'Support', branchId: 'soc-trang' },
    ],
  })
  const adminRow = admin.rows.find((r) => r.employeeId === 'emp-lyly')
  const supportRow = admin.rows.find((r) => r.employeeId === 'emp-support')

  check('kpi-employee', 'Employee KPI requested actual +1 for employeeId',
    empModel.overall.counts.requestedInvoices === 1
    && empModel.overall.counts.totalInvoices === 2
    && empModel.overall.kpis.requested.actual === 1
    && empModel.overall.kpis.requested.total === 2
    && empModel.overall.kpis.requested.target === 0.2)
  check('kpi-support', 'Support employee không được requested credit',
    supportModel.overall.counts.requestedInvoices === 0
    && supportModel.overall.counts.totalInvoices === 0)
  check('kpi-admin', 'Admin KPI nhận Requested của employeeId',
    adminRow?.counts?.requestedInvoices === 1
    && adminRow?.cards?.requested?.actual === 1
    && (supportRow == null || supportRow.counts.requestedInvoices === 0))
  check('kpi-formula', 'Target 20% / missing formula / 50_000đ không đổi',
    SEP2026_KPI_TARGETS.requested === 0.2
    && missingRequestedInvoices(1, 2, 0.2) === empModel.overall.kpis.requested.missing
    && KPI_PENALTY_PER_MISSING === 50_000)
}

{
  const src = readFileSync(join(ROOT, 'src/repositories/invoicesRepository.js'), 'utf8')
  const kpiSrc = readFileSync(join(ROOT, 'src/utils/employeeKpiEngine.js'), 'utf8')
  const empPage = readFileSync(join(ROOT, 'src/pages/EmployeeKpi.jsx'), 'utf8')
  check('no-global-fetch', 'Employee KPI vẫn scoped employeeId + kỳ lương',
    empPage.includes('employeeId')
    && empPage.includes('monthRange.fromDate')
    && !empPage.includes('fetchInvoices()'))
  check('kpi-attr-comment', 'Engine attribution vẫn invoice.employeeId only',
    kpiSrc.includes('Attribution: invoice.employeeId only'))
  const upsertSrc = src.slice(src.indexOf('export async function upsertInvoiceRowsWithRetry'), src.indexOf('export async function fetchAllInvoiceRows'))
  check('no-unbounded-upsert-side', 'Upsert retry không gọi fetchInvoices()',
    upsertSrc.includes('upsertInvoiceRowsWithRetry')
    && !upsertSrc.includes('fetchInvoices('))
}

const failed = results.filter((r) => !r.pass)
console.log(`\nKết quả: ${results.length - failed.length} passed, ${failed.length} failed\n`)
if (failed.length) process.exit(1)
console.log('FULL-HISTORY CALLS = ZERO')
console.log('NO PRODUCTION WRITE')
