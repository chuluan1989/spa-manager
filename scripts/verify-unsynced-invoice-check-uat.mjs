/**
 * UAT — unsynced local invoice check must not download invoice history.
 * Run: npx vite-node scripts/verify-unsynced-invoice-check-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ROLES } from '../src/constants/roles.js'
import { fetchInvoicesByIds, INVOICE_ID_FETCH_CHUNK } from '../src/repositories/invoicesRepository.js'
import { checkUnsyncedLocalInvoices } from '../src/utils/invoiceLegacyMigrate.js'
import { getPayPeriodRange, PAY_CYCLES } from '../src/utils/salaryReport.js'
import { CLOSE_CYCLES, getCloseCycleRange } from '../src/utils/payrollCycleClose/payCycleCalendar.js'
import { GLOBAL_PULL_ENTITIES } from '../src/utils/supabaseSync.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

function pass(label) {
  console.log(`  [PASS] ${label}`)
}

const EMPLOYEE = { role: ROLES.EMPLOYEE, employeeId: 'emp-1', branch: 'tram-spa' }

function seedLocalInvoices(invoices) {
  localStorage.clear()
  if (invoices.length > 0) {
    localStorage.setItem('spa-manager-invoices', JSON.stringify(invoices))
  }
}

function localInvoice(overrides = {}) {
  return {
    id: 'inv-local-1',
    date: '2026-09-03',
    branchId: 'tram-spa',
    employeeId: 'emp-1',
    total: 350000,
    createdAt: '2026-09-03T10:00:00.000Z',
    serviceIds: ['body-60'],
    services: [{ id: 'body-60', name: 'Body', price: 300000 }],
    tips: 50000,
    serviceTotal: 300000,
    ...overrides,
  }
}

function createFetchSpies({ byIdRows = [], filteredRows = [], fail = false } = {}) {
  const idCalls = []
  const filteredCalls = []
  return {
    idCalls,
    filteredCalls,
    fetchInvoicesByIds: async (ids) => {
      idCalls.push([...(ids ?? [])])
      if (fail) throw new Error('simulated supabase unavailable')
      const want = new Set((ids ?? []).map(String))
      return byIdRows.filter((row) => want.has(String(row.id)))
    },
    fetchInvoicesFiltered: async (filters) => {
      filteredCalls.push({ ...filters })
      if (fail) throw new Error('simulated supabase unavailable')
      return filteredRows
    },
  }
}

async function runCheck(invoices, spies, user = EMPLOYEE) {
  seedLocalInvoices(invoices)
  return checkUnsyncedLocalInvoices(user, localStorage, {
    fetchInvoicesByIds: spies.fetchInvoicesByIds,
    fetchInvoicesFiltered: spies.fetchInvoicesFiltered,
  })
}

console.log('\n=== UAT — unsynced local invoice check (no full-history fetch) ===\n')

{
  const empty = await fetchInvoicesByIds([])
  assert.deepEqual(empty, [])
  assert.equal(INVOICE_ID_FETCH_CHUNK, 100)
  pass('fetchInvoicesByIds([]) returns [] with zero Supabase I/O')
}

{
  const spies = createFetchSpies({ fail: true })
  const result = await runCheck([], spies)
  assert.equal(result.status, 'ok')
  assert.equal(result.hasUnsynced, false)
  assert.equal(result.count, 0)
  assert.equal(result.error, null)
  assert.equal(result.remoteQueries, 0)
  assert.equal(spies.idCalls.length, 0)
  assert.equal(spies.filteredCalls.length, 0)
  pass('CASE A: 0 local candidates → 0 remote invoice requests')
}

{
  const local = localInvoice()
  const spies = createFetchSpies({ byIdRows: [local] })
  const result = await runCheck([local], spies)
  assert.equal(result.status, 'ok')
  assert.equal(result.hasUnsynced, false)
  assert.equal(result.count, 0)
  assert.equal(spies.idCalls.length, 1)
  assert.deepEqual(spies.idCalls[0], ['inv-local-1'])
  assert.equal(spies.filteredCalls.length, 0)
  assert.equal(result.remoteQueries, 1)
  pass('CASE B: 1 local candidate already remote → query only that id → synced')
}

{
  const local = localInvoice({ id: 'inv-absent' })
  const spies = createFetchSpies({ byIdRows: [], filteredRows: [] })
  const result = await runCheck([local], spies)
  assert.equal(result.status, 'ok')
  assert.equal(result.hasUnsynced, true)
  assert.equal(result.count, 1)
  assert.equal(result.pending[0].id, 'inv-absent')
  assert.equal(spies.idCalls.length, 1)
  assert.deepEqual(spies.idCalls[0], ['inv-absent'])
  assert.equal(spies.filteredCalls.length, 1)
  assert.deepEqual(spies.filteredCalls[0], {
    fromDate: '2026-09-03',
    toDate: '2026-09-03',
    employeeId: 'emp-1',
  })
  pass('CASE C: 1 genuine local candidate absent remotely → query only that candidate → unsynced')
}

{
  const locals = [
    localInvoice({ id: 'a' }),
    localInvoice({ id: 'b', date: '2026-09-04', createdAt: '2026-09-04T10:00:00.000Z' }),
    localInvoice({ id: 'c', date: '2026-09-05', createdAt: '2026-09-05T10:00:00.000Z' }),
  ]
  const spies = createFetchSpies({ byIdRows: [locals[0], locals[2]] })
  const result = await runCheck(locals, spies)
  assert.equal(result.status, 'ok')
  assert.equal(result.hasUnsynced, true)
  assert.equal(result.count, 1)
  assert.equal(result.pending[0].id, 'b')
  assert.deepEqual(spies.idCalls[0].sort(), ['a', 'b', 'c'])
  assert.equal(spies.filteredCalls.length, 1)
  assert.equal(spies.filteredCalls[0].fromDate, '2026-09-04')
  pass('CASE D: multiple candidates → query only candidate IDs → correct mix synced/unsynced')
}

{
  const spies = createFetchSpies({ fail: true })
  const result = await runCheck([localInvoice()], spies)
  assert.equal(result.status, 'unknown')
  assert.equal(result.hasUnsynced, false)
  assert.equal(result.count, 0)
  assert.equal(result.pending.length, 0)
  assert.match(String(result.error), /simulated supabase unavailable/)
  pass('CASE E: Supabase/network failure → UNKNOWN, not false unsynced')
}

{
  const local = localInvoice({ id: 'only-one' })
  const spies = createFetchSpies({ byIdRows: [local] })
  const result = await runCheck([local], spies)
  const requested = spies.idCalls.flat()
  assert.equal(requested.length, 1)
  assert.equal(requested[0], 'only-one')
  assert.equal(spies.filteredCalls.length, 0)
  assert.notEqual(requested.length, 2884)
  assert.equal(result.hasUnsynced, false)
  pass('CASE F: 2,884+ history vs 1 local candidate → remote query O(1 candidate)')
}

{
  const local = localInvoice({ id: 'local-dup-id' })
  const remotePeer = localInvoice({ id: 'remote-different-id' })
  const spies = createFetchSpies({ byIdRows: [], filteredRows: [remotePeer] })
  const result = await runCheck([local], spies)
  assert.equal(result.status, 'ok')
  assert.equal(result.hasUnsynced, false)
  assert.equal(spies.idCalls.length, 1)
  assert.equal(spies.filteredCalls.length, 1)
  pass('Fingerprint semantics preserved: same content, different id → synced without full history')
}

{
  seedLocalInvoices([])
  const spies = createFetchSpies({ fail: true })
  for (let i = 0; i < 8; i += 1) {
    const result = await checkUnsyncedLocalInvoices(EMPLOYEE, localStorage, {
      fetchInvoicesByIds: spies.fetchInvoicesByIds,
      fetchInvoicesFiltered: spies.fetchInvoicesFiltered,
    })
    assert.equal(result.remoteQueries, 0)
  }
  assert.equal(spies.idCalls.length, 0)
  pass('Repeated employee-shell checks with 0 candidates never touch Supabase invoices')
}

{
  const p1 = getPayPeriodRange('2026-09', PAY_CYCLES.PERIOD_1)
  const p2 = getPayPeriodRange('2026-09', PAY_CYCLES.PERIOD_2)
  assert.deepEqual(p1, { fromDate: '2026-09-01', toDate: '2026-09-15' })
  assert.deepEqual(p2, { fromDate: '2026-09-16', toDate: '2026-09-30' })
  const close1 = getCloseCycleRange('2026-09', CLOSE_CYCLES.PERIOD_1)
  const close2 = getCloseCycleRange('2026-09', CLOSE_CYCLES.PERIOD_2)
  assert.equal(close1.fromDate, '2026-09-01')
  assert.equal(close1.toDate, '2026-09-15')
  assert.equal(close2.fromDate, '2026-09-16')
  assert.equal(close2.toDate, '2026-09-30')
  pass('Payroll close period rules unchanged: Kỳ 1 = 01–15, Kỳ 2 = 16–end')
}

{
  const remindSrc = read('src/utils/payrollCycleClose/closeRemind.js')
  assert.match(remindSrc, /tourOk = !syncCheck\.error && !syncCheck\.hasUnsynced/)
  assert.match(remindSrc, /needsSync: Boolean\(syncCheck\.hasUnsynced\) && nagSubmit/)
  assert.match(remindSrc, /Không kiểm tra được đồng bộ Tour/)
  assert.match(remindSrc, /Còn \$\{syncCheck\.count\} hóa đơn chưa đồng bộ/)
  assert.match(remindSrc, /status: 'unknown'/)
  const previewSrc = read('src/utils/payrollCycleClose/buildCloseCyclePreview.js')
  assert.match(previewSrc, /status: 'unknown'/)
  const bannerSrc = read('src/components/invoice/UnsyncedInvoicesBanner.jsx')
  assert.match(bannerSrc, /backendUnknown \? 0/)
  pass('Payroll reminder: no unsynced → normal; genuine unsynced → warning; backend fail → unknown, not false warning')
}

{
  const migrateSrc = read('src/utils/invoiceLegacyMigrate.js')
  assert.doesNotMatch(migrateSrc, /fetchInvoices\(/)
  assert.match(migrateSrc, /fetchInvoicesByIds/)
  assert.match(migrateSrc, /fetchInvoicesFiltered/)
  const appSrc = read('src/App.jsx')
  assert.match(appSrc, /currentUser\.role !== ROLES\.EMPLOYEE/)
  assert.match(appSrc, /shouldShowPayrollCloseRemind/)
  const kpiSrc = read('src/pages/EmployeeKpi.jsx')
  assert.match(kpiSrc, /fetchKpiInvoicesForScope/)
  assert.doesNotMatch(kpiSrc, /fetchInvoices\(/)
  const adminKpiSrc = read('src/pages/AdminKpi.jsx')
  assert.match(adminKpiSrc, /fetchKpiInvoicesForScope/)
  assert.doesNotMatch(adminKpiSrc, /fetchInvoices\(/)
  const syncSrc = read('src/utils/supabaseSync.js')
  assert.doesNotMatch(syncSrc, /fetchInvoices\(/)
  assert.ok(!GLOBAL_PULL_ENTITIES.includes('invoices'))
  pass('Source gates: live unsynced path has no fetchInvoices(); Employee/Admin KPI scoped; no pullAll invoices')
}

{
  const hits = []
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(js|jsx|mjs)$/.test(name)) continue
      const text = readFileSync(full, 'utf8')
      const uncommented = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      if (!/\bfetchInvoices\s*\(/.test(uncommented)) continue
      hits.push(full.slice(root.length + 1))
    }
  }
  walk(join(root, 'src'))
  walk(join(root, 'scripts'))
  const liveUi = hits.filter((file) =>
    file.startsWith('src/')
    && !file.includes('dataRecovery')
    && !file.includes('legacyCloudSync')
    && file !== 'src/repositories/invoicesRepository.js',
  )
  assert.deepEqual(liveUi, [], `unexpected live fetchInvoices() callers: ${liveUi.join(', ')}`)
  assert.ok(hits.some((file) => file.includes('dataRecovery.js')))
  assert.ok(hits.some((file) => file.includes('legacyCloudSync.js')))
  assert.ok(hits.some((file) => file.includes('verify-invoices-core.mjs')))
  console.log(`  remaining fetchInvoices() files: ${hits.join(', ')}`)
  pass('Live UI unbounded fetchInvoices() callers = ZERO; leftover B/C/D only')
}

console.log('\n=== ALL PASS — unsynced invoice check UAT ===\n')
