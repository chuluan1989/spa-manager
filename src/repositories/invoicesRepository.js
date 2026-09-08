import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'invoices'

/** PostgREST mặc định cắt ~1000 dòng — phải paginate để báo cáo Admin đủ dữ liệu. */
export const INVOICE_FETCH_PAGE_SIZE = 1000

export const INVOICE_SCOPE_REQUIRED_MESSAGE =
  'Cần phạm vi ngày, chi nhánh hoặc nhân viên khi tải hóa đơn.'

export function hasInvoiceFetchScope(filters = {}) {
  return Boolean(
    filters.fromDate
    || filters.toDate
    || filters.branchId
    || filters.employeeId
    || String(filters.customerSearch ?? '').trim(),
  )
}

/** Cột có trên Supabase — không gửi field JS thừa (vd. serviceCommission). */
const SUPABASE_INVOICE_FIELDS = [
  'id', 'date', 'branchId', 'branchName', 'employeeId', 'employeeName',
  'supportEmployeeId', 'supportEmployeeName', 'customerName', 'customerPhone',
  'customerRequested', 'serviceIds', 'services', 'tips', 'paymentMethod', 'note',
  'serviceTotal', 'total', 'commission',
  'originalServiceTotal', 'discountInput', 'discountType', 'discountValue', 'discountAmount',
  'enteredBy', 'invoiceTime', 'createdAt', 'updatedAt',
  'homeBranchId', 'homeBranchName', 'updatedBy',
]

/**
 * Cột có thể thiếu trên production — strip ĐÚNG 1 cột theo lỗi, rồi retry.
 * Không xóa cả list. Không dùng trong ORDER BY.
 */
export const OPTIONAL_INVOICE_COLUMNS = [
  'customer_phone',
  'customer_requested',
  'invoice_time',
  'entered_by',
  'discount_input',
  'discount_type',
  'discount_value',
  'discount_amount',
  'original_service_total',
  'home_branch_id',
  'home_branch_name',
  'updated_by',
  'updated_at',
]

function toSupabaseInvoicePayload(invoice) {
  const payload = {}
  for (const key of SUPABASE_INVOICE_FIELDS) {
    if (invoice[key] !== undefined) payload[key] = invoice[key]
  }
  return payload
}

export function invoiceToRow(invoice) {
  const now = new Date().toISOString()
  return objectToSnakeRow({
    ...toSupabaseInvoicePayload(invoice),
    createdAt: invoice.createdAt ?? now,
    updatedAt: invoice.updatedAt ?? now,
  })
}

const MISSING_COLUMN_PATTERNS = [
  /column\s+(?:[\w]+\.)?([a-z0-9_]+)\s+does not exist/i,
  /could not find the ['"]([a-z0-9_]+)['"] column/i,
  /['"]([a-z0-9_]+)['"] column of ['"]invoices['"]/i,
]

/**
 * Lấy đúng 1 cột missing từ lỗi PostgREST/Postgres.
 * Không suy ra cả OPTIONAL_INVOICE_COLUMNS.
 */
export function parseMissingInvoiceColumn(errorMessage, remainingColumns = OPTIONAL_INVOICE_COLUMNS) {
  const text = String(errorMessage || '')
  if (!text) return null
  const remaining = remainingColumns.filter(Boolean)

  for (const pattern of MISSING_COLUMN_PATTERNS) {
    const match = text.match(pattern)
    const column = match?.[1]
    if (column && remaining.includes(column)) return column
  }

  const hits = remaining.filter((column) => text.includes(column))
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) {
    hits.sort((a, b) => b.length - a.length)
    return hits[0]
  }
  return null
}

export function stripNamedInvoiceColumns(rows, columns = []) {
  const drop = new Set((Array.isArray(columns) ? columns : [columns]).filter(Boolean))
  return rows.map((row) => {
    const next = { ...row }
    for (const column of drop) delete next[column]
    return next
  })
}

function isMissingColumnError(error) {
  return /column|schema cache|does not exist/i.test(String(error?.message || ''))
}

/**
 * Upsert từng bước: lỗi cột missing → xóa ĐÚNG cột đó → retry.
 * customer_requested chỉ bị bỏ khi error chỉ đúng cột đó (schema chưa có).
 */
export async function upsertInvoiceRowsWithRetry(rows, client = supabase) {
  let payload = rows
  const stripped = new Set()
  const maxAttempts = OPTIONAL_INVOICE_COLUMNS.length + 2

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await client.from(TABLE).upsert(payload, { onConflict: 'id' }).select('id')
    if (!error) {
      if (stripped.has('customer_requested')) {
        console.warn(
          '[Invoices] customer_requested bị bỏ khi sync — cần chạy migration 0012_invoice_customer_requested.sql trên Supabase.',
        )
      }
      return data
    }

    if (!isMissingColumnError(error)) throw error

    const remaining = OPTIONAL_INVOICE_COLUMNS.filter((column) => !stripped.has(column))
    const missing = parseMissingInvoiceColumn(error.message, remaining)
    if (!missing || stripped.has(missing)) throw error

    stripped.add(missing)
    payload = stripNamedInvoiceColumns(payload, [missing])
  }

  throw new Error('Invoice upsert: quá nhiều cột optional bị thiếu.')
}

async function upsertInvoiceRows(rows) {
  return upsertInvoiceRowsWithRetry(rows)
}

/**
 * Chạy query builder theo trang đến hết — tránh cắt 1000 dòng của PostgREST.
 * @param {() => object} buildQuery factory tạo query mới mỗi trang (kèm order/filter)
 * @returns {Promise<object[]>}
 */
export async function fetchAllInvoiceRows(buildQuery) {
  const all = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + INVOICE_FETCH_PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < INVOICE_FETCH_PAGE_SIZE) break
    from += INVOICE_FETCH_PAGE_SIZE
  }
  return all
}

function buildOrderedInvoicesQuery(selectColumns = '*') {
  return supabase
    .from(TABLE)
    .select(selectColumns)
    .order('created_at', { ascending: false })
    .order('date', { ascending: false })
}

/**
 * Lấy hóa đơn từ Supabase (có filter).
 * Sort: created_at DESC, date DESC — KHÔNG order theo invoice_time (cột có thể không tồn tại).
 * Paginate đến hết — không giới hạn 1000.
 */
export async function fetchInvoicesFiltered(filters = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }
  if (!hasInvoiceFetchScope(filters)) {
    throw new Error(INVOICE_SCOPE_REQUIRED_MESSAGE)
  }

  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    employeeId = '',
    customerSearch = '',
  } = filters

  const rows = await fetchAllInvoiceRows(() => {
    let query = buildOrderedInvoicesQuery('*')
    if (fromDate) query = query.gte('date', fromDate)
    if (toDate) query = query.lte('date', toDate)
    if (branchId) query = query.eq('branch_id', branchId)
    if (employeeId) {
      query = query.or(`employee_id.eq.${employeeId},support_employee_id.eq.${employeeId}`)
    }
    if (customerSearch.trim()) {
      query = query.ilike('customer_name', `%${customerSearch.trim()}%`)
    }
    return query
  })

  return rowsToCamel(rows)
}

/** Chunk `.in('id', …)` — tránh URL PostgREST quá dài. */
export const INVOICE_ID_FETCH_CHUNK = 100

const UNSYNCED_CHECK_COLUMNS = 'id,date,employee_id,total,created_at'

/**
 * Lấy đúng các hóa đơn theo id — O(số id), không tải lịch sử.
 * Live UI / unsynced-check PHẢI dùng hàm này hoặc fetchInvoicesFiltered.
 */
export async function fetchInvoicesByIds(ids = []) {
  const unique = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )]
  if (unique.length === 0) return []
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }

  const all = []
  for (let i = 0; i < unique.length; i += INVOICE_ID_FETCH_CHUNK) {
    const chunk = unique.slice(i, i + INVOICE_ID_FETCH_CHUNK)
    const { data, error } = await supabase
      .from(TABLE)
      .select(UNSYNCED_CHECK_COLUMNS)
      .in('id', chunk)
    if (error) throw error
    all.push(...(data ?? []))
  }
  return rowsToCamel(all)
}

/**
 * Lấy toàn bộ hóa đơn — chỉ recovery / migrate / verify.
 * UI và auto-sync KHÔNG được gọi hàm này.
 */
export async function fetchInvoices() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }
  const rows = await fetchAllInvoiceRows(() => buildOrderedInvoicesQuery('*'))
  return rowsToCamel(rows)
}

export async function upsertInvoice(invoice) {
  if (!isSupabaseConfigured || !invoice?.id) return null
  return upsertInvoiceRows([invoiceToRow(invoice)])
}

export async function upsertInvoices(invoices) {
  if (!isSupabaseConfigured || !Array.isArray(invoices) || invoices.length === 0) return
  const rows = invoices.map((invoice) => invoiceToRow(invoice))
  await upsertInvoiceRows(rows)
}

export async function deleteInvoiceRow(id) {
  if (!isSupabaseConfigured || !id) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

/** Multiplex listeners — Dashboard mounts nhiều hook cùng subscribe invoices. */
let invoicesRealtimeChannel = null
const invoicesRealtimeListeners = new Set()
/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let invoicesRealtimeSupabaseOverride = null

function invoicesRealtimeClient() {
  return invoicesRealtimeSupabaseOverride ?? supabase
}

function invoicesRealtimeEnabled() {
  return Boolean(invoicesRealtimeSupabaseOverride || isSupabaseConfigured)
}

/** Dev / verify: số listener đang đăng ký trên channel invoices. */
export function getInvoicesRealtimeListenerCount() {
  return invoicesRealtimeListeners.size
}

if (typeof globalThis !== 'undefined') {
  globalThis.__spaGetInvoicesRealtimeListenerCount = getInvoicesRealtimeListenerCount
}

/** Chỉ dùng trong verify tests — inject mock Supabase client. */
export function setInvoicesRealtimeSupabaseForTests(client) {
  invoicesRealtimeSupabaseOverride = client
}

/** Chỉ dùng trong verify tests — reset module state. */
export function resetInvoicesRealtimeSubscriptionsForTests() {
  if (invoicesRealtimeChannel) {
    invoicesRealtimeClient()?.removeChannel(invoicesRealtimeChannel)
  }
  invoicesRealtimeChannel = null
  invoicesRealtimeListeners.clear()
  invoicesRealtimeSupabaseOverride = null
}

function traceInvoicesRealtime(action) {
  if (import.meta.env?.DEV) {
    console.debug(
      `[invoices-realtime] ${action} listeners=${invoicesRealtimeListeners.size} channel=${invoicesRealtimeChannel ? 'on' : 'off'}`,
    )
  }
}

function notifyInvoicesRealtimeListeners() {
  for (const listener of invoicesRealtimeListeners) {
    try {
      listener()
    } catch {
      // Listener lỗi không được làm gãy channel chung.
    }
  }
}

function ensureInvoicesRealtimeChannel() {
  if (invoicesRealtimeChannel || !invoicesRealtimeEnabled()) return

  invoicesRealtimeChannel = invoicesRealtimeClient()
    .channel('spa-invoices-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      () => notifyInvoicesRealtimeListeners(),
    )
    .subscribe()
  traceInvoicesRealtime('channel:subscribe')
}

export function subscribeInvoicesChanges(onChange) {
  if (!invoicesRealtimeEnabled() || typeof onChange !== 'function') {
    return () => {}
  }

  const hadListener = invoicesRealtimeListeners.has(onChange)
  invoicesRealtimeListeners.add(onChange)
  ensureInvoicesRealtimeChannel()
  traceInvoicesRealtime(hadListener ? 'subscribe:duplicate-ref' : 'subscribe')

  return () => {
    if (!invoicesRealtimeListeners.has(onChange)) {
      traceInvoicesRealtime('unsubscribe:miss')
      return
    }
    invoicesRealtimeListeners.delete(onChange)
    traceInvoicesRealtime('unsubscribe')
    if (invoicesRealtimeListeners.size === 0 && invoicesRealtimeChannel) {
      invoicesRealtimeClient()?.removeChannel(invoicesRealtimeChannel)
      invoicesRealtimeChannel = null
      traceInvoicesRealtime('channel:remove')
    }
  }
}
