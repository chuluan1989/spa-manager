/**
 * Kiểm tra & khôi phục dữ liệu — CHỈ ĐỌC khi audit.
 * Không ghi đè localStorage trừ khi người dùng bấm Recovery có xác nhận.
 */
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchInvoices } from '../repositories/invoicesRepository'
import { fetchEmployees } from '../repositories/employeesRepository'
import { fetchExpenses } from '../repositories/expensesRepository'
import { loadInvoices } from './invoiceStorage'
import { loadEmployees } from './employeeStorage'
import { loadExpenses } from './expenseStorage'
import { getLocalSnapshotSummary } from './supabaseSync'
import {
  LEGACY_IMPORT_COMPLETED_KEY,
  LEGACY_IMPORT_LOG_KEY,
  scanLocalStorageForLegacyData,
} from './legacyStorageScanner'
import { createBackupSnapshot, restoreFromSnapshot } from './dataBackup'

/** Tất cả key canonical + legacy đã từng dùng trong mã nguồn. */
export const KNOWN_STORAGE_KEYS = {
  localStorage: [
    { key: 'spa-manager-invoices', entity: 'invoices', type: 'array' },
    { key: 'spa-manager-employees', entity: 'employees', type: 'array' },
    { key: 'spa-manager-expenses', entity: 'expenses', type: 'array' },
    { key: 'spa-manager-services', entity: 'services', type: 'array' },
    { key: 'spa-manager-branches', entity: 'branches', type: 'array' },
    { key: 'spa-manager-branch-pricing', entity: 'branchPricing', type: 'object' },
    { key: 'spa-manager-credentials', entity: 'credentials', type: 'object' },
    { key: 'spa-manager-permissions', entity: 'permissions', type: 'object' },
    { key: 'spa-manager-system-settings', entity: 'systemSettings', type: 'object' },
    { key: 'spa-manager-services-version', entity: 'meta', type: 'number|string' },
    { key: 'spa-manager-supabase-migrated-v1', entity: 'meta', type: 'boolean flag' },
    { key: 'spa-manager-pre-import-backup', entity: 'fullBackup', type: 'object' },
    { key: 'legacy_import_completed', entity: 'meta', type: 'boolean flag' },
    { key: 'spa-manager-legacy-import-log', entity: 'meta', type: 'array' },
    { key: 'spa-manager-current-user', entity: 'session (legacy)', type: 'object' },
    { key: 'old-spa-tours', entity: 'invoices (legacy)', type: 'array|object' },
  ],
  sessionStorage: [
    { key: 'spa-manager-current-user', entity: 'session', type: 'object' },
    { key: 'spa-manager-report-prefill', entity: 'ui', type: 'object' },
  ],
}

function byteSize(text) {
  if (text == null) return 0
  try {
    return new Blob([text]).size
  } catch {
    return String(text).length
  }
}

function describeValue(raw) {
  if (raw == null) {
    return { dataType: 'null', recordCount: 0, sample: null }
  }

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return { dataType: 'array', recordCount: parsed.length, sample: parsed[0] ?? null }
    }
    if (parsed && typeof parsed === 'object') {
      const arrays = Object.entries(parsed).filter(([, v]) => Array.isArray(v))
      if (arrays.length === 1 && arrays[0][0] === 'invoices') {
        return { dataType: 'backup object', recordCount: arrays[0][1].length, sample: arrays[0][1][0] ?? null }
      }
      const recordCount = arrays.reduce((sum, [, v]) => sum + v.length, 0) || Object.keys(parsed).length
      return { dataType: 'object', recordCount, sample: parsed }
    }
    return { dataType: typeof parsed, recordCount: 1, sample: parsed }
  } catch {
    return { dataType: 'string (non-JSON)', recordCount: raw ? 1 : 0, sample: raw.slice(0, 120) }
  }
}

function scanStorageArea(storage, areaName) {
  const rows = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    const raw = storage.getItem(key)
    const meta = describeValue(raw)
    rows.push({
      area: areaName,
      key,
      byteSize: byteSize(raw),
      ...meta,
      isKnown: KNOWN_STORAGE_KEYS[areaName]?.some((item) => item.key === key) ?? false,
    })
  }
  rows.sort((a, b) => b.byteSize - a.byteSize)
  return rows
}

async function scanIndexedDB() {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) {
    return [{ name: '(unsupported)', note: 'Trình duyệt không hỗ trợ indexedDB.databases()' }]
  }
  try {
    const dbs = await indexedDB.databases()
    return dbs.map((db) => ({
      name: db.name,
      version: db.version,
      note: 'IndexedDB — app Spa Manager không dùng trực tiếp (có thể từ extension/PWA)',
    }))
  } catch (error) {
    return [{ name: '(error)', note: error?.message ?? String(error) }]
  }
}

async function scanCacheStorage() {
  if (typeof caches === 'undefined') {
    return [{ name: '(unsupported)', note: 'Cache API không khả dụng' }]
  }
  try {
    const names = await caches.keys()
    const rows = []
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      rows.push({ name, entryCount: keys.length, note: 'Service Worker / Vercel asset cache — không chứa hóa đơn' })
    }
    return rows.length ? rows : [{ name: '(empty)', entryCount: 0, note: 'Không có cache' }]
  } catch (error) {
    return [{ name: '(error)', note: error?.message ?? String(error) }]
  }
}

async function probeSupabaseReadOnly() {
  if (!isSupabaseConfigured) {
    return { configured: false, reason: 'Chưa cấu hình VITE_SUPABASE_URL / ANON_KEY' }
  }
  try {
    const [invoices, employees, expenses] = await Promise.all([
      fetchInvoices(),
      fetchEmployees(),
      fetchExpenses(),
    ])
    return {
      configured: true,
      invoices: invoices?.length ?? 0,
      employees: employees?.length ?? 0,
      expenses: expenses?.length ?? 0,
      note: 'Chỉ đọc — không ghi',
    }
  } catch (error) {
    return { configured: true, error: error?.message ?? String(error) }
  }
}

function countInvoicesInRaw(raw) {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.length
    if (Array.isArray(parsed?.invoices)) return parsed.invoices.length
  } catch {
    return 0
  }
  return 0
}

function buildDiagnosis(audit) {
  const canonicalInvoices = audit.appReadable.invoices ?? 0
  const backupInvoices = countInvoicesInRaw(localStorage.getItem('spa-manager-pre-import-backup'))
  const legacyInvoices = audit.legacyScan?.counts?.invoices ?? 0
  const supabaseInvoices = audit.supabase?.invoices ?? null

  const sources = [
    { name: 'spa-manager-invoices (UI đang đọc)', count: canonicalInvoices },
    { name: 'spa-manager-pre-import-backup', count: backupInvoices },
    { name: 'Key legacy quét được', count: legacyInvoices },
    { name: 'Supabase cloud', count: supabaseInvoices },
  ].filter((s) => s.count != null)

  const maxCount = Math.max(...sources.map((s) => s.count ?? 0), 0)
  const recoverable = Math.max(backupInvoices, legacyInvoices, supabaseInvoices ?? 0)
  const recoveryPercent = maxCount > 0
    ? Math.round((Math.max(canonicalInvoices, recoverable) / maxCount) * 100)
    : (canonicalInvoices > 0 ? 100 : 0)

  const causes = []
  if (canonicalInvoices === 0 && backupInvoices > 0) {
    causes.push('Dữ liệu còn trong backup pre-import nhưng key chính trống — có thể bị import/clear nhầm.')
  }
  if (canonicalInvoices === 0 && legacyInvoices > 0) {
    causes.push('Dữ liệu nằm ở key legacy (vd. old-spa-tours) — app chỉ đọc spa-manager-invoices.')
  }
  if (supabaseInvoices != null && supabaseInvoices < backupInvoices) {
    causes.push('Supabase có ít hóa đơn hơn backup local — pull đồng bộ có thể đã ghi đè cache bằng bản thiếu.')
  }
  if (supabaseInvoices != null && supabaseInvoices > 0 && canonicalInvoices === 0) {
    causes.push('Supabase còn dữ liệu nhưng local trống — cần pull/merge, không xóa local.')
  }
  if (localStorage.getItem('spa-manager-supabase-migrated-v1') === 'true' && canonicalInvoices === 0) {
    causes.push('Đã đánh dấu migrated Supabase — thiết bị tin cloud là nguồn chính khi mở app.')
  }
  if (causes.length === 0 && canonicalInvoices === 0) {
    causes.push('Không thấy hóa đơn ở key canonical, backup, legacy scan, hoặc Supabase trên thiết bị này.')
  }
  if (causes.length === 0) {
    causes.push('Dữ liệu vẫn trong localStorage — có thể UI lọc theo chi nhánh/nhân viên hoặc tab/filters.')
  }

  return {
    sources,
    maxCount,
    recoverable,
    recoveryPercent,
    causes,
    dataPresent: maxCount > 0 || canonicalInvoices > 0,
    uiShows: canonicalInvoices,
  }
}

/** Quét toàn bộ — KHÔNG ghi storage. */
export async function auditAllStorage() {
  const legacyScan = scanLocalStorageForLegacyData()
  const appReadable = getLocalSnapshotSummary()
  const supabase = await probeSupabaseReadOnly()

  const audit = {
    auditedAt: new Date().toISOString(),
    localStorage: scanStorageArea(localStorage, 'localStorage'),
    sessionStorage: scanStorageArea(sessionStorage, 'sessionStorage'),
    indexedDB: await scanIndexedDB(),
    cacheStorage: await scanCacheStorage(),
    flags: {
      supabaseMigrated: localStorage.getItem('spa-manager-supabase-migrated-v1'),
      legacyImportCompleted: localStorage.getItem(LEGACY_IMPORT_COMPLETED_KEY),
      hasPreImportBackup: Boolean(localStorage.getItem('spa-manager-pre-import-backup')),
      legacyImportLogs: (() => {
        try {
          return JSON.parse(localStorage.getItem(LEGACY_IMPORT_LOG_KEY) || '[]').length
        } catch {
          return 0
        }
      })(),
    },
    appReadable,
    legacyScan: {
      totalKeys: legacyScan.totalKeys,
      scannedKeys: legacyScan.scannedKeys,
      counts: legacyScan.counts,
      totalRecords: legacyScan.totalRecords,
      keyReports: legacyScan.keyReports,
    },
    supabase,
    diagnosis: null,
  }

  audit.diagnosis = buildDiagnosis(audit)
  return audit
}

function mergeRecordsById(localList, remoteList) {
  const map = new Map()
  for (const item of localList) {
    if (item?.id) map.set(item.id, item)
  }
  for (const item of remoteList) {
    if (!item?.id) continue
    const existing = map.get(item.id)
    if (!existing) {
      map.set(item.id, item)
      continue
    }
    const existingTime = Date.parse(existing.updatedAt ?? existing.createdAt ?? 0)
    const remoteTime = Date.parse(item.updatedAt ?? item.createdAt ?? 0)
    map.set(item.id, remoteTime >= existingTime ? item : existing)
  }
  return [...map.values()]
}

/**
 * Khôi phục từ nguồn an toàn nhất — luôn backup snapshot trước khi ghi.
 * @param {'pre-import-backup'|'legacy-scan'|'merge-all'} strategy
 */
export function recoverInvoices(strategy = 'merge-all', { dryRun = false } = {}) {
  const before = loadInvoices()
  const backupRaw = localStorage.getItem('spa-manager-pre-import-backup')
  let backupInvoices = []
  try {
    if (backupRaw) backupInvoices = JSON.parse(backupRaw).invoices ?? []
  } catch {
    backupInvoices = []
  }

  const legacyScan = scanLocalStorageForLegacyData()
  const legacyInvoices = legacyScan.snapshot?.invoices ?? []

  let candidate = [...before]
  if (strategy === 'pre-import-backup' || strategy === 'merge-all') {
    candidate = mergeRecordsById(candidate, backupInvoices)
  }
  if (strategy === 'legacy-scan' || strategy === 'merge-all') {
    candidate = mergeRecordsById(candidate, legacyInvoices)
  }

  const report = {
    strategy,
    dryRun,
    beforeCount: before.length,
    afterCount: candidate.length,
    addedFromBackup: backupInvoices.length,
    addedFromLegacy: legacyInvoices.length,
    recovered: candidate.length - before.length,
  }

  if (dryRun) return { success: true, report, invoices: candidate }

  if (candidate.length === before.length) {
    return { success: false, report, error: 'Không có hóa đơn mới để khôi phục từ backup/legacy.' }
  }

  const snapshot = createBackupSnapshot()
  restoreFromSnapshot({
    ...snapshot,
    invoices: candidate,
  })

  report.snapshotSaved = true
  return { success: true, report, invoices: loadInvoices() }
}

export function formatAuditReport(audit) {
  const lines = []
  lines.push(`=== KHOẺ SPA — BÁO CÁO RECOVERY ===`)
  lines.push(`Thời gian: ${audit.auditedAt}`)
  lines.push('')
  lines.push('--- localStorage ---')
  for (const row of audit.localStorage) {
    lines.push(
      `${row.key} | ${row.byteSize} bytes | ${row.dataType} | ${row.recordCount} bản ghi | known=${row.isKnown}`,
    )
  }
  lines.push('')
  lines.push('--- sessionStorage ---')
  for (const row of audit.sessionStorage) {
    lines.push(
      `${row.key} | ${row.byteSize} bytes | ${row.dataType} | ${row.recordCount} bản ghi`,
    )
  }
  lines.push('')
  lines.push('--- App đang đọc ---')
  lines.push(JSON.stringify(audit.appReadable, null, 2))
  lines.push('')
  lines.push('--- Legacy scan ---')
  lines.push(JSON.stringify(audit.legacyScan.counts, null, 2))
  lines.push('')
  lines.push('--- Supabase (read-only) ---')
  lines.push(JSON.stringify(audit.supabase, null, 2))
  lines.push('')
  lines.push('--- Chẩn đoán ---')
  lines.push(JSON.stringify(audit.diagnosis, null, 2))
  return lines.join('\n')
}

export function downloadAuditReport(audit) {
  const blob = new Blob([formatAuditReport(audit)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `spa-recovery-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
