/**
 * Hợp nhất yêu cầu bổ sung từ DB + JSON legacy trong giai đoạn chuyển tiếp.
 * Ưu tiên bản DB khi cùng một yêu cầu đã migrate; legacy chưa migrate vẫn hiển thị.
 */

export const LEGACY_REQUEST_STATUSES = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
])

/**
 * Map trạng thái legacy → DB. Trả null nếu không nhận diện được (không tự đoán).
 */
export function mapLegacyCorrectionStatus(rawStatus) {
  const status = String(rawStatus ?? '').trim().toLowerCase()
  if (!status) return { ok: false, status: '', reason: 'missing_status' }
  if (LEGACY_REQUEST_STATUSES.has(status)) return { ok: true, status, reason: '' }
  return { ok: false, status, reason: 'unmapped_status' }
}

export function getLegacySourceId(row) {
  if (!row || typeof row !== 'object') return ''
  return String(row.legacySourceId || row.legacy_source_id || '').trim()
}

/**
 * Khóa dedupe ổn định:
 * - DB đã migrate: legacy_source_id
 * - id trùng nhau
 * - pending cùng employee+date → ưu tiên DB
 */
export function correctionDedupeKey(row) {
  const legacy = getLegacySourceId(row)
  if (legacy) return `legacy:${legacy}`
  const id = String(row?.id || '').trim()
  if (id) return `id:${id}`
  const employeeId = String(row?.employeeId || '').trim()
  const date = String(row?.attendanceDate || row?.date || '').trim()
  const status = String(row?.status || '').trim()
  const requestedAt = String(row?.requestedAt || '').trim()
  return `fallback:${employeeId}|${date}|${status}|${requestedAt}`
}

export function pendingDayKey(row) {
  const employeeId = String(row?.employeeId || '').trim()
  const date = String(row?.attendanceDate || row?.date || '').trim()
  return `${employeeId}|${date}`
}

/**
 * @param {object[]} dbRows — đã normalize UI
 * @param {object[]} legacyRows — đã normalize UI (từ settings JSON)
 * @returns {{ merged: object[], skippedLegacy: object[], stats: object }}
 */
export function mergeCorrectionRequestSources(dbRows = [], legacyRows = []) {
  const db = (dbRows ?? []).filter(Boolean)
  const legacy = (legacyRows ?? []).filter(Boolean)

  const byKey = new Map()
  const migratedLegacyIds = new Set()
  const pendingDaysFromDb = new Set()

  for (const row of db) {
    const key = correctionDedupeKey(row)
    byKey.set(key, { ...row, source: 'db' })
    const legacyId = getLegacySourceId(row)
    if (legacyId) migratedLegacyIds.add(legacyId)
    if (row.id) migratedLegacyIds.add(row.id)
    if (String(row.status) === 'pending') {
      pendingDaysFromDb.add(pendingDayKey(row))
    }
  }

  const skippedLegacy = []
  let keptLegacy = 0
  let skippedMigrated = 0
  let skippedPendingDup = 0

  for (const row of legacy) {
    const id = String(row.id || '').trim()
    if (migratedLegacyIds.has(id)) {
      skippedLegacy.push({ ...row, skipReason: 'already_migrated' })
      skippedMigrated += 1
      continue
    }

    const legacyKey = id ? `legacy:${id}` : correctionDedupeKey(row)
    if (byKey.has(legacyKey) || byKey.has(`id:${id}`)) {
      skippedLegacy.push({ ...row, skipReason: 'duplicate_key' })
      skippedMigrated += 1
      continue
    }

    if (String(row.status) === 'pending' && pendingDaysFromDb.has(pendingDayKey(row))) {
      skippedLegacy.push({ ...row, skipReason: 'pending_day_exists_in_db' })
      skippedPendingDup += 1
      continue
    }

    byKey.set(legacyKey, {
      ...row,
      source: 'legacy',
      legacySourceId: id || getLegacySourceId(row) || '',
    })
    keptLegacy += 1
  }

  const merged = [...byKey.values()].sort((a, b) => (
    String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''))
  ))

  return {
    merged,
    skippedLegacy,
    stats: {
      dbCount: db.length,
      legacyCount: legacy.length,
      mergedCount: merged.length,
      keptLegacy,
      skippedMigrated,
      skippedPendingDup,
    },
  }
}

/**
 * Build payload DB từ một bản ghi JSON legacy.
 * @returns {{ ok: true, payload: object } | { ok: false, reason: string, row: object }}
 */
export function buildCorrectionPayloadFromLegacy(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'invalid_row', row: raw }
  }

  const legacySourceId = String(raw.id || '').trim()
  const employeeId = String(raw.employeeId || '').trim()
  const attendanceDate = String(raw.date || raw.attendanceDate || '').trim()
  const statusMap = mapLegacyCorrectionStatus(raw.status)

  if (!legacySourceId) return { ok: false, reason: 'missing_id', row: raw }
  if (!employeeId) return { ok: false, reason: 'missing_employee_id', row: raw }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    return { ok: false, reason: 'invalid_attendance_date', row: raw }
  }
  if (!statusMap.ok) {
    return { ok: false, reason: statusMap.reason || 'unmapped_status', row: raw, status: statusMap.status }
  }

  const type = raw.type === 'update' ? 'update' : 'create'
  const proposedStatus = String(raw.proposedStatus || raw.newStatus || '').trim() || 'on_time'
  const proposedReason = String(raw.proposedReason || raw.newReason || '').trim()
  const proposedNote = String(raw.proposedNote || raw.newNote || '').trim()
  const proposedCheckIn = String(raw.proposedCheckIn || '').trim()
  const proposedCheckOut = String(raw.proposedCheckOut || '').trim()

  return {
    ok: true,
    payload: {
      // Giữ id ổn định dựa trên legacy để idempotent khi chưa có legacy_source_id
      id: `acr-legacy-${legacySourceId}`,
      legacySourceId,
      type,
      attendanceId: String(raw.attendanceId || '').trim(),
      employeeId,
      employeeName: String(raw.employeeName || '').trim(),
      branchId: String(raw.branchId || '').trim() || null,
      branchName: String(raw.branchName || '').trim(),
      attendanceDate,
      oldStatus: String(raw.oldStatus || '').trim(),
      oldReason: String(raw.oldReason || '').trim(),
      oldNote: String(raw.oldNote || '').trim(),
      oldCheckIn: String(raw.oldCheckIn || '').trim(),
      oldCheckOut: String(raw.oldCheckOut || '').trim(),
      proposedStatus,
      proposedReason,
      proposedNote,
      proposedCheckIn,
      proposedCheckOut,
      evidenceNote: String(raw.evidenceNote || '').trim(),
      finalStatus: String(raw.finalStatus || '').trim(),
      finalReason: String(raw.finalReason || '').trim(),
      finalNote: String(raw.finalNote || '').trim(),
      finalCheckIn: String(raw.finalCheckIn || '').trim(),
      finalCheckOut: String(raw.finalCheckOut || '').trim(),
      status: statusMap.status,
      requestedAt: String(raw.requestedAt || '').trim() || new Date().toISOString(),
      requestedBy: String(raw.requestedBy || employeeId).trim(),
      requestedByName: String(raw.requestedByName || '').trim(),
      reviewedAt: raw.reviewedAt || null,
      reviewedBy: String(raw.reviewedBy || '').trim(),
      reviewedByName: String(raw.reviewedByName || '').trim(),
      reviewNote: String(raw.reviewNote || raw.rejectReason || '').trim(),
      rejectReason: String(raw.rejectReason || (statusMap.status === 'rejected' ? raw.reviewNote : '') || '').trim(),
      employeeNotified: Boolean(raw.employeeNotified),
    },
  }
}

/**
 * Chặn tạo pending trùng: DB pending hoặc legacy pending cùng employee+date.
 */
export function findPendingConflict(mergedRows, employeeId, attendanceDate, excludeId = '') {
  return (mergedRows ?? []).find((row) => (
    row.employeeId === employeeId
    && (row.date === attendanceDate || row.attendanceDate === attendanceDate)
    && row.status === 'pending'
    && row.id !== excludeId
  )) ?? null
}
