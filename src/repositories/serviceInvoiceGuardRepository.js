import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const TABLE = 'invoices'
const VERIFY_ERROR = 'Chưa thể xác minh lịch sử hóa đơn. Vui lòng thử lại.'

async function findInvoiceReference(branchId, id) {
  if (!id) return false

  const { data: byServiceIds, error: idsError } = await supabase
    .from(TABLE)
    .select('id')
    .eq('branch_id', branchId)
    .contains('service_ids', [String(id)])
    .limit(1)

  if (idsError) throw idsError
  if (byServiceIds?.length) return true

  const { data: byServices, error: servicesError } = await supabase
    .from(TABLE)
    .select('id')
    .eq('branch_id', branchId)
    .contains('services', [{ id: String(id) }])
    .limit(1)

  if (servicesError) throw servicesError
  return Boolean(byServices?.length)
}

/**
 * Kiểm tra tham chiếu hóa đơn trên Supabase — FAIL CLOSED khi lỗi mạng/query.
 * @returns {{ ok: true, hasReference: boolean } | { ok: false, error: string }}
 */
export async function verifyNoInvoiceReferencesRemote({
  branchId = '',
  serviceId = '',
  durationId = '',
} = {}) {
  if (!branchId) {
    return { ok: false, error: VERIFY_ERROR }
  }

  if (!isSupabaseConfigured) {
    return { ok: false, error: VERIFY_ERROR }
  }

  const ids = [...new Set([durationId, serviceId].filter(Boolean).map(String))]
  if (!ids.length) {
    return { ok: true, hasReference: false }
  }

  try {
    for (const id of ids) {
      const found = await findInvoiceReference(branchId, id)
      if (found) return { ok: true, hasReference: true }
    }
    return { ok: true, hasReference: false }
  } catch {
    return { ok: false, error: VERIFY_ERROR }
  }
}
