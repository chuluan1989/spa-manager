import { isSupabaseConfigured } from '../lib/supabaseClient'
import { ROLES } from '../constants/roles'
import { fetchInvoices, upsertInvoice } from '../repositories/invoicesRepository'
import { rowToCamel } from '../repositories/caseUtils'
import { loadInvoices } from './invoiceStorage'
import { notifyDataSynced } from './dataSyncEvents'
import { ensureBranchAndEmployeeOnServer } from './syncForeignKeys'
import {
  normalizeLegacyInvoice,
  scanLocalStorageForLegacyData,
} from './legacyStorageScanner'

const CANONICAL_INVOICE_KEY = 'spa-manager-invoices'
const LEGACY_INVOICE_KEYS = ['old-spa-tours']
export const INVOICE_MIGRATE_LOG_KEY = 'spa-manager-invoice-migrate-log'

function readJsonArrayFromKey(key, storage = localStorage) {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.invoices)) return parsed.invoices
    if (Array.isArray(parsed?.tours)) return parsed.tours
    return []
  } catch {
    return []
  }
}

function normalizeCollectedInvoice(raw) {
  if (!raw || typeof raw !== 'object') return null
  try {
    const legacy = normalizeLegacyInvoice(raw)
    if (!legacy?.id) return null
    const camel = rowToCamel(raw)
    return {
      ...legacy,
      customerRequested: Boolean(camel.customerRequested ?? camel.customer_requested ?? legacy.customerRequested),
      discountInput: camel.discountInput ?? camel.discount_input ?? '',
      discountType: camel.discountType ?? camel.discount_type ?? '',
      discountValue: Number(camel.discountValue ?? camel.discount_value ?? 0),
      discountAmount: Number(camel.discountAmount ?? camel.discount_amount ?? 0),
      originalServiceTotal: Number(
        camel.originalServiceTotal ?? camel.original_service_total ?? legacy.serviceTotal ?? 0,
      ),
      paymentMethod: camel.paymentMethod ?? camel.payment_method ?? legacy.paymentMethod ?? 'cash',
      enteredBy: camel.enteredBy ?? camel.entered_by ?? '',
      supportEmployeeId: camel.supportEmployeeId ?? camel.support_employee_id ?? legacy.supportEmployeeId ?? '',
      supportEmployeeName: camel.supportEmployeeName ?? camel.support_employee_name ?? legacy.supportEmployeeName ?? '',
      note: camel.note ?? legacy.note ?? '',
      commission: Number(camel.commission ?? legacy.commission ?? 0),
      updatedAt: camel.updatedAt ?? camel.updated_at ?? legacy.createdAt,
    }
  } catch {
    return null
  }
}

/** Gom hóa đơn từ spa-manager-invoices, old-spa-tours và các key liên quan trong localStorage. */
export function collectAllLocalInvoices(storage = localStorage) {
  const byId = new Map()

  const add = (raw) => {
    const normalized = normalizeCollectedInvoice(raw)
    if (normalized?.id) byId.set(normalized.id, normalized)
  }

  for (const invoice of loadInvoices()) add(invoice)

  for (const key of LEGACY_INVOICE_KEYS) {
    for (const raw of readJsonArrayFromKey(key, storage)) add(raw)
  }

  const scan = scanLocalStorageForLegacyData({ storage })
  for (const raw of scan.snapshot.invoices ?? []) add(raw)

  return [...byId.values()]
}

export function scopeInvoicesForUser(invoices, user) {
  if (!user?.role || !Array.isArray(invoices)) return []

  if (user.role === ROLES.ADMIN) return invoices

  if (user.role === ROLES.BRANCH_MANAGER) {
    const branchId = user.branch ?? ''
    return invoices.filter((invoice) => invoice.branchId === branchId)
  }

  const employeeId = user.employeeId ?? ''
  return invoices.filter(
    (invoice) => invoice.employeeId === employeeId || invoice.supportEmployeeId === employeeId,
  )
}

/** Khóa chống trùng theo nội dung: created_at + employee_id + total + ngày HĐ. */
export function buildInvoiceContentFingerprint(invoice) {
  return [
    String(invoice?.createdAt ?? '').trim(),
    String(invoice?.employeeId ?? '').trim(),
    String(invoice?.total ?? 0),
    String(invoice?.date ?? '').trim(),
  ].join('|')
}

/** Khóa đầy đủ gồm local id — dùng khi cần so khớp chính xác theo id. */
export function buildInvoiceDedupKey(invoice) {
  return [
    String(invoice?.id ?? '').trim(),
    buildInvoiceContentFingerprint(invoice),
  ].join('|')
}

export function buildRemoteInvoiceIndex(remoteInvoices) {
  const ids = new Set()
  const fingerprints = new Set()
  const contentFingerprints = new Set()

  for (const invoice of remoteInvoices ?? []) {
    if (invoice?.id) ids.add(invoice.id)
    fingerprints.add(buildInvoiceDedupKey(invoice))
    contentFingerprints.add(buildInvoiceContentFingerprint(invoice))
  }

  return { ids, fingerprints, contentFingerprints, total: remoteInvoices?.length ?? 0 }
}

export function isInvoiceAlreadyOnRemote(invoice, remoteIndex) {
  if (!invoice || !remoteIndex) return false
  if (invoice.id && remoteIndex.ids.has(invoice.id)) return true
  if (remoteIndex.contentFingerprints?.has(buildInvoiceContentFingerprint(invoice))) return true
  return remoteIndex.fingerprints.has(buildInvoiceDedupKey(invoice))
}

export function findUnsyncedLocalInvoices(localInvoices, remoteIndex) {
  return (localInvoices ?? []).filter((invoice) => !isInvoiceAlreadyOnRemote(invoice, remoteIndex))
}

/**
 * Kiểm tra hóa đơn local chưa có trên Supabase (theo phạm vi user).
 * Chỉ đọc localStorage + fetch Supabase — không ghi.
 */
export async function checkUnsyncedLocalInvoices(user, storage = localStorage) {
  if (!isSupabaseConfigured) {
    return { hasUnsynced: false, count: 0, pending: [], error: 'Supabase chưa cấu hình.' }
  }
  if (!user?.role) {
    return { hasUnsynced: false, count: 0, pending: [], error: null }
  }

  const scoped = scopeInvoicesForUser(collectAllLocalInvoices(storage), user)
  if (scoped.length === 0) {
    return { hasUnsynced: false, count: 0, pending: [], error: null }
  }

  try {
    const remote = await fetchInvoices()
    const remoteIndex = buildRemoteInvoiceIndex(remote)
    const pending = findUnsyncedLocalInvoices(scoped, remoteIndex)
    return {
      hasUnsynced: pending.length > 0,
      count: pending.length,
      pending,
      error: null,
      localTotal: scoped.length,
      remoteTotal: remoteIndex.total,
    }
  } catch (error) {
    return {
      hasUnsynced: false,
      count: 0,
      pending: [],
      error: error?.message ?? 'Không thể kiểm tra hóa đơn trên Supabase.',
    }
  }
}

function appendMigrateLog(entry, storage = localStorage) {
  try {
    const raw = storage.getItem(INVOICE_MIGRATE_LOG_KEY)
    const logs = raw ? JSON.parse(raw) : []
    const next = Array.isArray(logs) ? logs : []
    next.unshift({ at: new Date().toISOString(), ...entry })
    storage.setItem(INVOICE_MIGRATE_LOG_KEY, JSON.stringify(next.slice(0, 30)))
  } catch {
    // không chặn migrate nếu log lỗi
  }
}

function logMigrate(action, invoice, extra = {}) {
  console.info(`[Invoice Migrate] ${action}`, {
    id: invoice?.id,
    employee_id: invoice?.employeeId,
    branch_id: invoice?.branchId,
    invoice_date: invoice?.date,
    created_at: invoice?.createdAt,
    total: invoice?.total,
    ...extra,
  })
}

/**
 * Đẩy hóa đơn cũ từ localStorage lên Supabase.
 * Không xóa localStorage — chỉ ghi Supabase khi upsert xác nhận thành công.
 */
export async function migrateLocalInvoicesToSupabase(user, storage = localStorage) {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase chưa cấu hình.' }
  }
  if (!user?.role) {
    return { success: false, error: 'Chưa đăng nhập.' }
  }

  const check = await checkUnsyncedLocalInvoices(user, storage)
  if (check.error) {
    return { success: false, error: check.error, imported: 0, skipped: 0, failed: 0, errors: [] }
  }

  const pending = check.pending ?? []
  if (pending.length === 0) {
    return {
      success: true,
      empty: true,
      message: 'Không có hóa đơn cũ cần đồng bộ.',
      imported: 0,
      skipped: (check.localTotal ?? 0) - 0,
      failed: 0,
      errors: [],
    }
  }

  const remoteIndex = buildRemoteInvoiceIndex(await fetchInvoices())
  let imported = 0
  let skipped = 0
  let failed = 0
  const errors = []

  for (const invoice of pending) {
    if (isInvoiceAlreadyOnRemote(invoice, remoteIndex)) {
      skipped += 1
      continue
    }

    try {
      await ensureBranchAndEmployeeOnServer({
        branchId: invoice.branchId ?? '',
        employeeId: invoice.employeeId ?? '',
      })

      const data = await upsertInvoice(invoice)
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Supabase không xác nhận đã lưu hóa đơn.')
      }

      remoteIndex.ids.add(invoice.id)
      remoteIndex.fingerprints.add(buildInvoiceDedupKey(invoice))
      remoteIndex.contentFingerprints.add(buildInvoiceContentFingerprint(invoice))
      imported += 1
      logMigrate('import OK', invoice)
    } catch (error) {
      failed += 1
      const message = error?.message ?? String(error)
      errors.push({ id: invoice.id, message })
      logMigrate('import FAILED', invoice, { error: message })
    }
  }

  const success = failed === 0
  if (imported > 0) {
    notifyDataSynced(['invoices'])
  }

  if (success && imported > 0) {
    appendMigrateLog({
      role: user.role,
      imported,
      skipped,
      failed,
      keys: [CANONICAL_INVOICE_KEY, ...LEGACY_INVOICE_KEYS],
    }, storage)
  }

  return {
    success,
    imported,
    skipped,
    failed,
    errors,
    message: success
      ? `Đã đồng bộ ${imported} hóa đơn cũ lên hệ thống.`
      : `Đồng bộ một phần: ${imported} thành công, ${failed} lỗi.`,
  }
}

export function shouldShowUnsyncedInvoicesBanner(user) {
  if (!user?.role || !isSupabaseConfigured) return false
  return user.role === ROLES.EMPLOYEE || user.role === ROLES.BRANCH_MANAGER
}
