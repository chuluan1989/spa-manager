/**
 * UAT Batch 4.1 — hooks order, merge DB+JSON, migrate dry-run/idempotent mapping.
 * Run: vite-node scripts/verify-attendance-correction-b41.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, useState } from 'react'
import { renderToString } from 'react-dom/server'
import './_polyfill-storage.mjs'
import {
  buildCorrectionPayloadFromLegacy,
  findPendingConflict,
  mapLegacyCorrectionStatus,
  mergeCorrectionRequestSources,
} from '../src/utils/attendanceCorrectionMerge.js'
import PayrollCycleCloseAdminPanel from '../src/components/salary/PayrollCycleCloseAdminPanel.jsx'
import { ROLES } from '../src/constants/roles.js'

console.log('\n=== UAT Batch 4.1 — production readiness ===\n')

// 1–2) Admin panel: hooks always called (render as employee / manager / admin)
{
  const roles = [ROLES.EMPLOYEE, ROLES.BRANCH_MANAGER, ROLES.ADMIN]
  for (const role of roles) {
    globalThis.localStorage?.setItem('spa.currentUser', JSON.stringify({
      role,
      employeeId: 'e1',
      branchId: 'b1',
      name: 'Test',
    }))
    // clear auth cache if any by re-import not needed — panel reads getCurrentUser each render
    assert.doesNotThrow(() => {
      renderToString(createElement(PayrollCycleCloseAdminPanel))
    })
  }

  // Role change within same parent: hooks count stable
  function RoleFlipHarness() {
    const [role, setRole] = useState(ROLES.EMPLOYEE)
    // simulate flip
    if (role === ROLES.EMPLOYEE) setRole(ROLES.ADMIN)
    globalThis.localStorage?.setItem('spa.currentUser', JSON.stringify({
      role,
      employeeId: 'e1',
      branchId: 'b1',
      name: 'Test',
    }))
    return createElement(PayrollCycleCloseAdminPanel)
  }
  assert.doesNotThrow(() => {
    try {
      renderToString(createElement(RoleFlipHarness))
    } catch (err) {
      // React may warn on setState during render in harness — ignore that specific path;
      // important is PayrollCycleCloseAdminPanel itself doesn't throw hooks order errors.
      if (String(err?.message || err).includes('Rendered more hooks')) throw err
    }
  })
  console.log('  [PASS] 1–2. Admin panel render Admin/QL/NV; không lỗi thứ tự hooks')
}

// 3–5) Merge DB + JSON
{
  const dbRows = [
    {
      id: 'acr-legacy-aer-1',
      legacySourceId: 'aer-1',
      employeeId: 'e1',
      date: '2026-07-28',
      status: 'approved',
      requestedAt: '2026-07-29T00:00:00.000Z',
    },
    {
      id: 'db-pending-e2',
      employeeId: 'e2',
      date: '2026-07-27',
      status: 'pending',
      requestedAt: '2026-07-28T00:00:00.000Z',
    },
  ]
  const legacyRows = [
    {
      id: 'aer-1',
      employeeId: 'e1',
      date: '2026-07-28',
      status: 'pending',
      requestedAt: '2026-07-29T00:00:00.000Z',
    },
    {
      id: 'aer-unmigrated',
      employeeId: 'e3',
      date: '2026-07-26',
      status: 'rejected',
      requestedAt: '2026-07-27T00:00:00.000Z',
    },
    {
      id: 'aer-pending-dup-day',
      employeeId: 'e2',
      date: '2026-07-27',
      status: 'pending',
      requestedAt: '2026-07-28T01:00:00.000Z',
    },
  ]

  const { merged, skippedLegacy, stats } = mergeCorrectionRequestSources(dbRows, legacyRows)
  assert.equal(stats.dbCount, 2)
  assert.equal(stats.keptLegacy, 1)
  assert.ok(merged.some((r) => r.id === 'aer-unmigrated' && r.source === 'legacy'))
  assert.ok(merged.some((r) => r.legacySourceId === 'aer-1' || r.id === 'acr-legacy-aer-1'))
  assert.equal(merged.filter((r) => r.id === 'aer-1').length, 0)
  assert.ok(skippedLegacy.some((r) => r.id === 'aer-1' && r.skipReason === 'already_migrated'))
  assert.ok(skippedLegacy.some((r) => r.id === 'aer-pending-dup-day' && r.skipReason === 'pending_day_exists_in_db'))
  console.log('  [PASS] 3–5. Merge DB+JSON; migrated không trùng; unmigrated vẫn hiện')
}

// 8–9) Status map + pending conflict
{
  assert.equal(mapLegacyCorrectionStatus('pending').ok, true)
  assert.equal(mapLegacyCorrectionStatus('waiting').ok, false)
  assert.equal(mapLegacyCorrectionStatus('').ok, false)
  const bad = buildCorrectionPayloadFromLegacy({
    id: 'x',
    employeeId: 'e1',
    date: '2026-07-01',
    status: 'weird',
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.reason, 'unmapped_status')

  const conflict = findPendingConflict([
    { id: 'a', employeeId: 'e1', date: '2026-07-01', status: 'pending', source: 'db' },
  ], 'e1', '2026-07-01')
  assert.ok(conflict)
  console.log('  [PASS] 8–9. Unmapped status báo lỗi; pending DB chặn pending JSON cùng ngày')
}

// 6–7) Dry-run script on sample + idempotent payload ids
{
  const samplePath = fileURLToPath(new URL('./fixtures/attendance-edit-requests-sample.json', import.meta.url))
  const map = JSON.parse(readFileSync(samplePath, 'utf8'))
  const payloads = []
  const unmapped = []
  for (const [id, value] of Object.entries(map)) {
    const built = buildCorrectionPayloadFromLegacy({ ...value, id: value.id || id })
    if (!built.ok) {
      if (built.reason === 'unmapped_status' || built.reason === 'missing_status') unmapped.push(id)
      continue
    }
    payloads.push(built.payload)
  }
  assert.ok(payloads.length >= 2)
  assert.ok(unmapped.includes('aer-sample-bad-status'))
  const ids = new Set(payloads.map((p) => p.id))
  assert.equal(ids.size, payloads.length)
  // Second "apply" simulation: same legacy_source_id → same id
  const again = buildCorrectionPayloadFromLegacy(map['aer-sample-1'])
  assert.equal(again.payload.id, payloads.find((p) => p.legacySourceId === 'aer-sample-1').id)
  console.log('  [PASS] 6–7. Dry-run sample: unmapped liệt kê; apply lần 2 cùng id (idempotent)')
}

// Migration 0039 present
{
  const sql = readFileSync(
    fileURLToPath(new URL('../supabase/migrations/0039_attendance_correction_legacy_source.sql', import.meta.url)),
    'utf8',
  )
  assert.ok(sql.includes('legacy_source_id'))
  assert.ok(sql.includes('add column if not exists'))
  const inv = readFileSync(
    fileURLToPath(new URL('./sql/inventory-auto-absent-b4.sql', import.meta.url)),
    'utf8',
  )
  assert.ok(!/\b(update|delete|insert)\b/i.test(inv.replace(/--.*/g, '')))
  console.log('  [PASS] migration 0039 + inventory SQL read-only')
}

console.log('\n=== ALL BATCH 4.1 UAT PASSED ===\n')
