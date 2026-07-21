import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'invoices'

/** Cột có trên Supabase — không gửi field JS thừa (vd. serviceCommission). */
const SUPABASE_INVOICE_FIELDS = [
  'id', 'date', 'branchId', 'branchName', 'employeeId', 'employeeName',
  'supportEmployeeId', 'supportEmployeeName', 'customerName', 'customerPhone',
  'customerRequested', 'serviceIds', 'services', 'tips', 'paymentMethod', 'note',
  'serviceTotal', 'total', 'commission',
  'originalServiceTotal', 'discountInput', 'discountType', 'discountValue', 'discountAmount',
  'enteredBy', 'invoiceTime', 'createdAt', 'updatedAt',
]

/** Cột có thể thiếu trên production — chỉ strip khi UPSERT, KHÔNG dùng trong ORDER BY. */
const OPTIONAL_INVOICE_COLUMNS = [
  'customer_phone',
  'customer_requested',
  'invoice_time',
  'entered_by',
  'discount_input',
  'discount_type',
  'discount_value',
  'discount_amount',
  'original_service_total',
]

function toSupabaseInvoicePayload(invoice) {
  const payload = {}
  for (const key of SUPABASE_INVOICE_FIELDS) {
    if (invoice[key] !== undefined) payload[key] = invoice[key]
  }
  return payload
}

function invoiceToRow(invoice) {
  const now = new Date().toISOString()
  return objectToSnakeRow({
    ...toSupabaseInvoicePayload(invoice),
    createdAt: invoice.createdAt ?? now,
    updatedAt: invoice.updatedAt ?? now,
  })
}

function stripOptionalInvoiceColumns(rows) {
  return rows.map((row) => {
    const next = { ...row }
    for (const column of OPTIONAL_INVOICE_COLUMNS) {
      delete next[column]
    }
    return next
  })
}

async function upsertInvoiceRows(rows) {
  let payload = rows
  let { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' }).select('id')

  if (
    error
    && OPTIONAL_INVOICE_COLUMNS.some((column) => String(error.message).includes(column))
  ) {
    payload = stripOptionalInvoiceColumns(rows)
    ;({ data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' }).select('id'))
  }

  // Production có thể thiếu updated_at hoặc cột mới — strip và thử lại.
  if (error && /column|schema cache|does not exist/i.test(String(error.message))) {
    payload = payload.map((row) => {
      const next = { ...row }
      delete next.updated_at
      delete next.customer_requested
      delete next.invoice_time
      delete next.entered_by
      delete next.discount_input
      delete next.discount_type
      delete next.discount_value
      delete next.discount_amount
      delete next.original_service_total
      delete next.customer_phone
      return next
    })
    ;({ data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'id' }).select('id'))
  }

  if (error) throw error
  return data
}

/**
 * Lấy hóa đơn từ Supabase.
 * Sort: created_at DESC, date DESC — KHÔNG order theo invoice_time (cột có thể không tồn tại).
 */
export async function fetchInvoicesFiltered(filters = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }

  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    employeeId = '',
    customerSearch = '',
  } = filters

  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .order('date', { ascending: false })

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)
  if (employeeId) {
    query = query.or(`employee_id.eq.${employeeId},support_employee_id.eq.${employeeId}`)
  }
  if (customerSearch.trim()) {
    query = query.ilike('customer_name', `%${customerSearch.trim()}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return rowsToCamel(data ?? [])
}

export async function fetchInvoices() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .order('date', { ascending: false })
  if (error) throw error
  return rowsToCamel(data ?? [])
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
  if (invoicesRealtimeChannel || !isSupabaseConfigured) return

  invoicesRealtimeChannel = supabase
    .channel('spa-invoices-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      () => notifyInvoicesRealtimeListeners(),
    )
    .subscribe()
}

export function subscribeInvoicesChanges(onChange) {
  if (!isSupabaseConfigured || typeof onChange !== 'function') {
    return () => {}
  }

  invoicesRealtimeListeners.add(onChange)
  ensureInvoicesRealtimeChannel()

  return () => {
    invoicesRealtimeListeners.delete(onChange)
    if (invoicesRealtimeListeners.size === 0 && invoicesRealtimeChannel) {
      supabase.removeChannel(invoicesRealtimeChannel)
      invoicesRealtimeChannel = null
    }
  }
}
