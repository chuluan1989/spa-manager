import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'invoices'
const OPTIONAL_INVOICE_COLUMNS = ['customer_phone', 'invoice_time', 'entered_by']

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
