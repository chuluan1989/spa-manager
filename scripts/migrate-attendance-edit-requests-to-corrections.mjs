/**
 * Migrate settings.attendanceEditRequests (JSON map) → attendance_correction_requests.
 *
 * Usage:
 *   vite-node scripts/migrate-attendance-edit-requests-to-corrections.mjs --dry-run [--input path.json]
 *   vite-node scripts/migrate-attendance-edit-requests-to-corrections.mjs --apply [--input path.json]
 *
 * --dry-run: chỉ báo cáo, không ghi DB.
 * --apply: upsert idempotent theo legacy_source_id / id acr-legacy-*; không xóa JSON cũ.
 * Không chạy trên production trừ khi được yêu cầu rõ ràng.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import './_polyfill-storage.mjs'
import {
  buildCorrectionPayloadFromLegacy,
  mapLegacyCorrectionStatus,
} from '../src/utils/attendanceCorrectionMerge.js'

function parseArgs(argv) {
  const flags = { dryRun: false, apply: false, input: '' }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--apply') flags.apply = true
    else if (arg === '--input') flags.input = argv[++i] || ''
  }
  return flags
}

function loadLegacyMap(inputPath) {
  if (inputPath) {
    const abs = resolve(inputPath)
    if (!existsSync(abs)) throw new Error(`Không tìm thấy file input: ${abs}`)
    const raw = JSON.parse(readFileSync(abs, 'utf8'))
    if (raw && typeof raw === 'object' && raw.attendanceEditRequests) {
      return raw.attendanceEditRequests
    }
    return raw
  }
  // Không có input: không tự đọc production settings — yêu cầu --input mẫu/local
  throw new Error(
    'Thiếu --input. Truyền file JSON map (hoặc settings object chứa attendanceEditRequests). Không tự đọc production.',
  )
}

function analyze(map) {
  const entries = Object.entries(map || {}).map(([id, value]) => ({
    ...(value && typeof value === 'object' ? value : {}),
    id: (value && value.id) || id,
  }))

  const report = {
    total: entries.length,
    valid: [],
    duplicates: [],
    missingFields: [],
    unmappedStatus: [],
    wouldImport: [],
  }

  const seenLegacy = new Set()
  const pendingDays = new Set()

  for (const row of entries) {
    const built = buildCorrectionPayloadFromLegacy(row)
    if (!built.ok) {
      if (built.reason === 'unmapped_status' || built.reason === 'missing_status') {
        report.unmappedStatus.push({ id: row.id, status: row.status, reason: built.reason })
      } else {
        report.missingFields.push({ id: row.id, reason: built.reason })
      }
      continue
    }

    const { payload } = built
    if (seenLegacy.has(payload.legacySourceId)) {
      report.duplicates.push({ id: payload.legacySourceId, reason: 'duplicate_in_json' })
      continue
    }
    seenLegacy.add(payload.legacySourceId)

    if (payload.status === 'pending') {
      const dayKey = `${payload.employeeId}|${payload.attendanceDate}`
      if (pendingDays.has(dayKey)) {
        report.duplicates.push({ id: payload.legacySourceId, reason: 'pending_same_employee_day_in_json' })
        continue
      }
      pendingDays.add(dayKey)
    }

    report.valid.push(payload)
    report.wouldImport.push({
      legacySourceId: payload.legacySourceId,
      id: payload.id,
      employeeId: payload.employeeId,
      attendanceDate: payload.attendanceDate,
      status: payload.status,
    })
  }

  return report
}

async function applyImport(payloads) {
  const { isSupabaseConfigured } = await import('../src/lib/supabaseClient.js')
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình — không thể --apply.')
  }
  const {
    fetchCorrectionByLegacySourceId,
    fetchPendingCorrectionForDay,
    upsertCorrectionRequest,
    insertAttendanceChangeEvent,
    createAttendanceChangeEventId,
  } = await import('../src/repositories/attendanceCorrectionRepository.js')

  const results = {
    inserted: 0,
    skippedExisting: 0,
    skippedPendingConflict: 0,
    errors: [],
  }

  for (const payload of payloads) {
    try {
      const existing = await fetchCorrectionByLegacySourceId(payload.legacySourceId)
      if (existing) {
        results.skippedExisting += 1
        continue
      }
      // Cũng skip nếu id đã tồn tại (idempotent lần chạy trước khi có cột legacy_source_id)
      const { fetchCorrectionRequestById } = await import('../src/repositories/attendanceCorrectionRepository.js')
      const byId = await fetchCorrectionRequestById(payload.id)
      if (byId) {
        results.skippedExisting += 1
        continue
      }

      if (payload.status === 'pending') {
        const pending = await fetchPendingCorrectionForDay(payload.employeeId, payload.attendanceDate)
        if (pending) {
          results.skippedPendingConflict += 1
          continue
        }
      }

      const saved = await upsertCorrectionRequest(payload)
      await insertAttendanceChangeEvent({
        id: createAttendanceChangeEventId(),
        requestId: saved.id,
        attendanceId: saved.attendanceId || '',
        employeeId: saved.employeeId,
        branchId: saved.branchId || '',
        attendanceDate: saved.attendanceDate,
        eventType: 'request_submitted',
        actorId: 'migration-b41',
        actorName: 'Batch 4.1 JSON migrate',
        actorRole: 'system',
        beforeData: {},
        afterData: { ...payload, migratedFrom: 'settings.attendanceEditRequests' },
        note: `Import legacy_source_id=${payload.legacySourceId}`,
        branchAtAction: saved.branchId || '',
      })
      results.inserted += 1
    } catch (err) {
      results.errors.push({ id: payload.legacySourceId, message: err?.message || String(err) })
    }
  }

  return results
}

async function main() {
  const flags = parseArgs(process.argv)
  if (!flags.dryRun && !flags.apply) {
    console.error('Cần --dry-run hoặc --apply')
    process.exit(1)
  }
  if (flags.dryRun && flags.apply) {
    console.error('Chỉ chọn một: --dry-run hoặc --apply')
    process.exit(1)
  }

  const map = loadLegacyMap(flags.input)
  const report = analyze(map)

  console.log('\n=== Migrate attendanceEditRequests → attendance_correction_requests ===\n')
  console.log('Mode:', flags.dryRun ? 'DRY-RUN' : 'APPLY')
  console.log('Tổng record JSON:', report.total)
  console.log('Hợp lệ:', report.valid.length)
  console.log('Trùng trong JSON:', report.duplicates.length)
  console.log('Thiếu dữ liệu:', report.missingFields.length)
  console.log('Status không map được:', report.unmappedStatus.length)
  console.log('Dự kiến import:', report.wouldImport.length)

  if (report.unmappedStatus.length) {
    console.log('\n-- Unmapped status --')
    for (const item of report.unmappedStatus) {
      console.log(`  ${item.id}: status=${JSON.stringify(item.status)} (${item.reason})`)
    }
  }
  if (report.missingFields.length) {
    console.log('\n-- Missing fields --')
    for (const item of report.missingFields.slice(0, 50)) {
      console.log(`  ${item.id}: ${item.reason}`)
    }
  }
  if (report.duplicates.length) {
    console.log('\n-- Duplicates --')
    for (const item of report.duplicates) {
      console.log(`  ${item.id}: ${item.reason}`)
    }
  }

  // Sanity: mapLegacyCorrectionStatus không tự đoán
  const bogus = mapLegacyCorrectionStatus('done')
  if (bogus.ok) throw new Error('mapLegacyCorrectionStatus phải từ chối status lạ')

  if (flags.dryRun) {
    console.log('\nDRY-RUN: không ghi database. JSON cũ không bị xóa.\n')
    return
  }

  const applyResult = await applyImport(report.valid)
  console.log('\n-- Apply results --')
  console.log('Inserted:', applyResult.inserted)
  console.log('Skipped existing:', applyResult.skippedExisting)
  console.log('Skipped pending conflict:', applyResult.skippedPendingConflict)
  console.log('Errors:', applyResult.errors.length)
  for (const err of applyResult.errors) {
    console.log(`  ${err.id}: ${err.message}`)
  }
  console.log('\nJSON cũ không bị xóa.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
