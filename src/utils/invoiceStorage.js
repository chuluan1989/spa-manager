import {
  canAddInvoice,
  canDeleteInvoice,
  canEditInvoice,
  filterByUserBranch,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { getSelectedServiceDetails } from './invoice'
import { normalizeCustomerPhone } from './validators'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { deleteInvoiceRow, upsertInvoice, fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { notifyDataSynced } from './dataSyncEvents'
import { ensureBranchAndEmployeeOnServer } from './syncForeignKeys'

const DUPLICATE_INVOICE_MESSAGE =
  'Hóa đơn này có dấu hiệu bị nhập trùng nhiều lần. Vui lòng kiểm tra lại.'

/** Đếm in-flight saves cùng fingerprint để chặn double-click song song. */
const pendingDuplicateCounts = new Map()

function getInvoiceServiceFingerprint(invoice) {
  if (Array.isArray(invoice?.serviceIds) && invoice.serviceIds.length > 0) {
    return [...invoice.serviceIds].map(String).sort().join(',')
  }
  const services = Array.isArray(invoice?.services) ? invoice.services : []
  return services
    .map((service) => String(service?.id || service?.name || ''))
    .filter(Boolean)
    .sort()
    .join(',')
}

export function buildInvoiceDuplicateKey(invoice) {
  const phone = normalizeCustomerPhone(invoice?.customerPhone ?? '')
  const total = Number(invoice?.total ?? 0)
  return [
    invoice?.branchId ?? '',
    invoice?.employeeId ?? '',
    phone,
    getInvoiceServiceFingerprint(invoice),
    String(total),
    invoice?.date ?? '',
  ].join('|')
}

function invoicesMatchDuplicateKey(invoice, key) {
  return buildInvoiceDuplicateKey(invoice) === key
}

async function countDuplicateInvoices(snapshot) {
  const key = buildInvoiceDuplicateKey(snapshot)
  let count = 0

  if (isSupabaseConfigured) {
    try {
      const rows = await fetchInvoicesFiltered({
        fromDate: snapshot.date,
        toDate: snapshot.date,
        branchId: snapshot.branchId,
        employeeId: snapshot.employeeId,
      })
      count = (rows ?? []).filter((invoice) => invoicesMatchDuplicateKey(invoice, key)).length
    } catch {
      count = loadInvoices().filter((invoice) => invoicesMatchDuplicateKey(invoice, key)).length
    }
  } else {
    count = loadInvoices().filter((invoice) => invoicesMatchDuplicateKey(invoice, key)).length
  }

  return count + (pendingDuplicateCounts.get(key) ?? 0)
}

function beginDuplicateGuard(key) {
  pendingDuplicateCounts.set(key, (pendingDuplicateCounts.get(key) ?? 0) + 1)
}

function endDuplicateGuard(key) {
  const next = (pendingDuplicateCounts.get(key) ?? 1) - 1
  if (next <= 0) pendingDuplicateCounts.delete(key)
  else pendingDuplicateCounts.set(key, next)
}

async function pushInvoiceToSupabase(invoice) {
  if (!isSupabaseConfigured || !invoice) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu hóa đơn.')
  }
  const data = await upsertInvoice(invoice)
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Supabase không xác nhận đã lưu hóa đơn.')
  }
  return data
}

async function pushInvoiceDeletionToSupabase(id) {
  if (!isSupabaseConfigured || !id) {
    throw new Error('Supabase chưa cấu hình. Không thể xoá hóa đơn.')
  }
  await deleteInvoiceRow(id)
}

const EMPLOYEE_EDITABLE_INVOICE_FIELDS = [
  'date',
  'invoiceTime',
  'customerName',
  'customerPhone',
  'customerRequested',
  'serviceIds',
  'services',
  'tips',
  'paymentMethod',
  'note',
  'originalServiceTotal',
  'discountInput',
  'discountType',
  'discountValue',
  'discountAmount',
  'serviceTotal',
  'total',
  'commission',
]

function pickEmployeeEditableInvoiceFields(data) {
  const picked = {}
  for (const key of EMPLOYEE_EDITABLE_INVOICE_FIELDS) {
    if (data[key] !== undefined) picked[key] = data[key]
  }
  return picked
}

const STORAGE_KEY = 'spa-manager-invoices'

function logInvoiceSave(action, invoice, extra = {}) {
  const services = Array.isArray(invoice?.services) ? invoice.services : []
  console.info(`[Invoice] ${action}`, {
    id: invoice?.id,
    employee_id: invoice?.employeeId,
    branch_id: invoice?.branchId,
    invoice_date: invoice?.date,
    created_at: invoice?.createdAt,
    customer_name: invoice?.customerName,
    customer_phone: invoice?.customerPhone,
    service: services.map((s) => s?.name ?? s?.id).join(', '),
    price: invoice?.serviceTotal,
    discount: invoice?.discountAmount,
    tips: invoice?.tips,
    total: invoice?.total,
    ...extra,
  })
}

function logInvoiceSaveError(action, invoice, error) {
  console.error(`[Invoice] ${action} FAILED`, {
    id: invoice?.id,
    employee_id: invoice?.employeeId,
    branch_id: invoice?.branchId,
    invoice_date: invoice?.date,
    error: error?.message ?? String(error),
  })
}

export function getTodayDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getMonthStartDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function normalizeInvoiceCustomerFields(invoice) {
  return {
    ...invoice,
    customerName: String(invoice.customerName ?? '').trim(),
    customerPhone: normalizeCustomerPhone(invoice.customerPhone ?? ''),
    customerRequested: Boolean(invoice.customerRequested),
  }
}

function ensureInvoiceSnapshot(invoice) {
  if (Array.isArray(invoice.services) && invoice.services.length > 0) {
    return invoice
  }

  if (!Array.isArray(invoice.serviceIds) || invoice.serviceIds.length === 0) {
    return { ...invoice, services: invoice.services ?? [] }
  }

  return {
    ...invoice,
    services: getSelectedServiceDetails(
      invoice.serviceIds,
      invoice.branchId ?? '',
      [],
      invoice.branchName ?? '',
    ),
  }
}

function migrateInvoices(invoices) {
  let changed = false
  const migrated = invoices.map((invoice) => {
    const hasSnapshot = Array.isArray(invoice.services) && invoice.services.length > 0
    if (hasSnapshot) return invoice
    const next = ensureInvoiceSnapshot(invoice)
    if (Array.isArray(next.services) && next.services.length > 0) changed = true
    return next
  })

  if (changed) {
    writeInvoiceCache(migrated, { action: 'migrateSnapshots' })
  }

  return migrated
}

export function loadInvoices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return migrateInvoices(data)
  } catch {
    return []
  }
}

export function getInvoiceById(id) {
  return loadInvoices().find((invoice) => invoice.id === id) ?? null
}

function isStorageQuotaError(error) {
  return error?.name === 'QuotaExceededError'
    || error?.code === 22
    || /quota/i.test(String(error?.message ?? ''))
}

/** Giới hạn cache phụ — UI Admin vẫn đọc đủ từ Supabase. */
export const INVOICE_CACHE_LIMIT = 100

const SAVE_IN_FLIGHT_MESSAGE = 'Đang lưu hóa đơn, vui lòng đợi...'

/** Chặn double-click tạo nhiều request song song (id khác nhau). */
let saveInvoiceInFlight = false
let updateInvoiceInFlightId = null

function warnInvoiceCacheFailure(error, context = {}) {
  console.warn('[Invoice] Cache spa-manager-invoices bỏ qua — không ảnh hưởng dữ liệu Supabase.', {
    error: error?.message ?? String(error),
    quotaExceeded: isStorageQuotaError(error),
    ...context,
  })
}

/** Ghi cache phụ — lỗi quota chỉ warn, không ném, không rollback Supabase. */
function writeInvoiceCache(list, context = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []))
    return true
  } catch (error) {
    warnInvoiceCacheFailure(error, {
      count: Array.isArray(list) ? list.length : 0,
      ...context,
    })
    return false
  }
}

function readInvoiceCacheRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function sortInvoicesForCache(list) {
  return [...list].sort((a, b) => {
    const dateCmp = String(b?.date ?? '').localeCompare(String(a?.date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? ''))
  })
}

/**
 * Cache có giới hạn từ danh sách remote, nhưng giữ hóa đơn local-only
 * (ứng viên migrate) — không xóa trước khi server đã đủ / migrate xong.
 */
function buildBoundedInvoiceCache(remoteList) {
  const remote = Array.isArray(remoteList) ? remoteList : []
  const remoteIds = new Set(remote.map((invoice) => invoice?.id).filter(Boolean))
  const localOnly = readInvoiceCacheRaw().filter(
    (invoice) => invoice?.id && !remoteIds.has(invoice.id),
  )
  const boundedRemote = sortInvoicesForCache(remote).slice(0, INVOICE_CACHE_LIMIT)
  const byId = new Map()
  for (const invoice of localOnly) byId.set(invoice.id, invoice)
  for (const invoice of boundedRemote) byId.set(invoice.id, invoice)
  return [...byId.values()]
}

/** Sau save/update remote: cập nhật cache phụ (giới hạn), lỗi chỉ warn. */
function patchInvoiceCacheAfterRemote(invoice) {
  if (!invoice?.id) return
  const existing = readInvoiceCacheRaw().filter((row) => row?.id !== invoice.id)
  const next = sortInvoicesForCache([invoice, ...existing])
  const keepSaved = next.filter((row) => row.id === invoice.id)
  const others = next.filter((row) => row.id !== invoice.id).slice(0, INVOICE_CACHE_LIMIT - 1)
  writeInvoiceCache([...keepSaved, ...others], { action: 'patch', id: invoice.id })
}

function removeInvoiceFromCache(id) {
  const next = readInvoiceCacheRaw().filter((invoice) => invoice?.id !== id)
  writeInvoiceCache(next, { action: 'delete', id })
}

/** Ghi đè cache phụ từ Supabase — không unbounded; trả về list remote đầy đủ cho caller. */
export function replaceAllInvoices(invoices) {
  const list = Array.isArray(invoices) ? invoices : []
  const toStore = buildBoundedInvoiceCache(list)
  writeInvoiceCache(toStore, {
    action: 'replaceAll',
    remoteCount: list.length,
    cachedCount: toStore.length,
  })
  return list
}

export async function saveInvoice(invoice) {
  if (!canAddInvoice()) {
    return { success: false, error: 'Bạn không có quyền thêm hóa đơn.' }
  }

  if (saveInvoiceInFlight) {
    return { success: false, error: SAVE_IN_FLIGHT_MESSAGE }
  }
  saveInvoiceInFlight = true

  try {
    let payload = invoice

    if (isEmployee()) {
      const employeeId = getCurrentUserEmployeeId()
      const branchId = getCurrentUserBranch()
      payload = {
        ...invoice,
        branchId,
        branchName: getBranchName(branchId),
        employeeId,
        employeeName: getEmployeeById(employeeId)?.name ?? invoice.employeeName ?? '',
        supportEmployeeId: '',
        supportEmployeeName: '',
      }
    }

    const branchId = payload.branchId ?? ''
    if (!isAdmin() && branchId !== getCurrentUserBranch()) {
      return { success: false, error: 'Bạn không có quyền thêm hóa đơn chi nhánh này.' }
    }

    const snapshot = normalizeInvoiceCustomerFields(ensureInvoiceSnapshot({
      ...payload,
      enteredBy: payload.enteredBy ?? getCurrentUserName(),
      createdAt: payload.createdAt ?? new Date().toISOString(),
    }))

    if (!isSupabaseConfigured) {
      const duplicateCount = await countDuplicateInvoices(snapshot)
      if (duplicateCount >= 2) {
        return { success: false, error: DUPLICATE_INVOICE_MESSAGE }
      }
      const invoices = loadInvoices()
      invoices.unshift(snapshot)
      if (!writeInvoiceCache(invoices, { action: 'saveLocal' })) {
        return { success: false, error: 'Không thể lưu hóa đơn vào bộ nhớ máy (LocalStorage đầy).' }
      }
      notifyDataSynced(['invoices'])
      return { success: true, invoice: snapshot, invoices }
    }

    return await saveInvoiceRemote(snapshot)
  } finally {
    saveInvoiceInFlight = false
  }
}

async function saveInvoiceRemote(snapshot) {
  const duplicateKey = buildInvoiceDuplicateKey(snapshot)
  let guardStarted = false
  try {
    const duplicateCount = await countDuplicateInvoices(snapshot)
    if (duplicateCount >= 2) {
      return { success: false, error: DUPLICATE_INVOICE_MESSAGE }
    }

    beginDuplicateGuard(duplicateKey)
    guardStarted = true
    await ensureBranchAndEmployeeOnServer({
      branchId: snapshot.branchId ?? '',
      employeeId: snapshot.employeeId ?? '',
    })
    await pushInvoiceToSupabase(snapshot)
    logInvoiceSave('save OK', snapshot)
  } catch (error) {
    logInvoiceSaveError('save', snapshot, error)
    return { success: false, error: error?.message ?? 'Không thể lưu hóa đơn lên máy chủ.' }
  } finally {
    if (guardStarted) endDuplicateGuard(duplicateKey)
  }

  // Supabase đã thành công — cache phụ thất bại chỉ warn.
  patchInvoiceCacheAfterRemote(snapshot)
  notifyDataSynced(['invoices'])
  return { success: true, invoice: snapshot, invoices: loadInvoices() }
}

export function updateInvoice(id, data, currentFromCaller = null) {
  const current = currentFromCaller ?? getInvoiceById(id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy hóa đơn.' }
  }

  if (updateInvoiceInFlightId) {
    return Promise.resolve({ success: false, error: SAVE_IN_FLIGHT_MESSAGE })
  }

  const invoices = loadInvoices()
  const index = invoices.findIndex((invoice) => invoice.id === id)

  if (!canEditInvoice(current)) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn.' }
  }

  const scoped = filterByUserBranch([current])
  if (!isAdmin() && scoped.length === 0) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn này.' }
  }

  // Nhân viên chỉ được sửa nội dung dịch vụ/khách/tips/thanh toán/ghi chú;
  // không được đổi chi nhánh, nhân viên chính, nhân viên hỗ trợ — kể cả khi
  // dữ liệu gửi lên (qua code/browser) cố tình chứa các trường này.
  // Quản lý được sửa nội dung HĐ chi nhánh mình nhưng không đổi branch_id.
  const safeData = isEmployee()
    ? {
        ...pickEmployeeEditableInvoiceFields(data),
        branchId: current.branchId,
        branchName: current.branchName,
        employeeId: current.employeeId,
        employeeName: current.employeeName,
        supportEmployeeId: current.supportEmployeeId,
        supportEmployeeName: current.supportEmployeeName,
      }
    : isAdmin()
      ? data
      : {
          ...data,
          branchId: current.branchId,
          branchName: current.branchName,
        }

  const updated = normalizeInvoiceCustomerFields(ensureInvoiceSnapshot({
    ...current,
    ...safeData,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  }))

  if (!isSupabaseConfigured) {
    if (index === -1) {
      invoices.unshift(updated)
    } else {
      invoices[index] = updated
    }
    if (!writeInvoiceCache(invoices, { action: 'updateLocal', id })) {
      return { success: false, error: 'Không thể cập nhật hóa đơn trên bộ nhớ máy (LocalStorage đầy).' }
    }
    notifyDataSynced(['invoices'])
    return { success: true, invoice: updated, invoices }
  }

  updateInvoiceInFlightId = updated.id
  return updateInvoiceRemote(updated).finally(() => {
    updateInvoiceInFlightId = null
  })
}

async function updateInvoiceRemote(updated) {
  try {
    await ensureBranchAndEmployeeOnServer({
      branchId: updated.branchId ?? '',
      employeeId: updated.employeeId ?? '',
    })
    await pushInvoiceToSupabase(updated)
    logInvoiceSave('update OK', updated)
  } catch (error) {
    logInvoiceSaveError('update', updated, error)
    return { success: false, error: error?.message ?? 'Không thể cập nhật hóa đơn lên máy chủ.' }
  }

  patchInvoiceCacheAfterRemote(updated)
  notifyDataSynced(['invoices'])
  return { success: true, invoice: updated, invoices: loadInvoices() }
}

export function deleteInvoice(id, currentFromCaller = null) {
  if (!canDeleteInvoice()) {
    return { success: false, error: 'Bạn không có quyền xóa hóa đơn.' }
  }

  const current = currentFromCaller ?? getInvoiceById(id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy hóa đơn.' }
  }

  const scoped = filterByUserBranch([current])
  if (!isAdmin() && scoped.length === 0) {
    return { success: false, error: 'Bạn không có quyền xóa hóa đơn này.' }
  }

  if (!isSupabaseConfigured) {
    const invoices = loadInvoices().filter((inv) => inv.id !== id)
    if (!writeInvoiceCache(invoices, { action: 'deleteLocal', id })) {
      return { success: false, error: 'Không thể xoá hóa đơn trên bộ nhớ máy (LocalStorage đầy).' }
    }
    notifyDataSynced(['invoices'])
    return { success: true, invoices }
  }

  return deleteInvoiceRemote(id)
}

async function deleteInvoiceRemote(id) {
  try {
    await pushInvoiceDeletionToSupabase(id)
  } catch (error) {
    return { success: false, error: error?.message ?? 'Không thể xoá hóa đơn trên máy chủ.' }
  }

  removeInvoiceFromCache(id)
  notifyDataSynced(['invoices'])
  return { success: true, invoices: loadInvoices() }
}

export function createInvoiceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
