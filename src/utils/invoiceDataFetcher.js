import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { loadInvoices } from './invoiceStorage'

function mergeRowsById(localRows, remoteRows) {
  const map = new Map()
  for (const row of localRows ?? []) {
    if (row?.id) map.set(row.id, row)
  }
  for (const row of remoteRows ?? []) {
    if (row?.id) map.set(row.id, row)
  }
  return [...map.values()]
}

/** Hóa đơn cloud + local — dùng cho CRM, Lương, Chi nhánh. */
export async function fetchMergedInvoices(scope = {}) {
  const localRows = loadInvoices()

  if (!isSupabaseConfigured) {
    return { invoices: localRows, source: 'local' }
  }

  try {
    const remoteRows = await fetchInvoicesFiltered(scope)
    return {
      invoices: mergeRowsById(localRows, Array.isArray(remoteRows) ? remoteRows : []),
      source: 'cloud',
    }
  } catch (err) {
    return { invoices: localRows, source: 'local-fallback', error: err }
  }
}
