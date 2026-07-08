import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'

/**
 * Hóa đơn từ Supabase — dùng cho CRM / báo cáo phụ.
 * Không merge LocalStorage, không fallback dữ liệu cục bộ.
 */
export async function fetchMergedInvoices(scope = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
  }

  const remoteRows = await fetchInvoicesFiltered(scope)
  return {
    invoices: Array.isArray(remoteRows) ? remoteRows : [],
    source: 'cloud',
  }
}
