import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'invoices'
const OPTIONAL_INVOICE_COLUMNS = [
  'customer_phone',
  'invoice_time',
  'entered_by',
  'discount_input',
  'discount_type',
  'discount_value',
  'discount_amount',
  'original_service_total',
]

function invoiceToRow(invoice) {
  return objectToSnakeRow({
    ...invoice,
    createdAt: invoice.createdAt ?? new Date().toISOString(),
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
  let { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (
    error
    && OPTIONAL_INVOICE_COLUMNS.some((column) => String(error.message).includes(column))
  ) {
    ;({ error } = await supabase.from(TABLE).upsert(stripOptionalInvoiceColumns(rows), { onConflict: 'id' }))
  }
  if (error) throw error
}

export async function fetchInvoicesFiltered(filters = {}) {
  if (!isSupabaseConfigured) return null

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
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })

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
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return rowsToCamel(data)
}

export async function upsertInvoice(invoice) {
  if (!isSupabaseConfigured || !invoice?.id) return
  await upsertInvoiceRows([invoiceToRow(invoice)])
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
