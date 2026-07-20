import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { rowsToCamel } from './caseUtils'
import { filterInvoices, computeServiceReport } from '../utils/report'

const TABLE = 'invoices'
const STATS_COLUMNS = 'id, date, branch_id, service_ids, services, service_total'

/**
 * Tải hóa đơn từ Supabase (không dùng localStorage) và aggregate theo cùng logic báo cáo.
 */
export async function fetchServiceStatsMap({ branchId = '', fromDate = '', toDate = '' } = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải thống kê dịch vụ.')
  }

  let query = supabase
    .from(TABLE)
    .select(STATS_COLUMNS)
    .order('created_at', { ascending: false })
    .order('date', { ascending: false })

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)
  if (branchId) query = query.eq('branch_id', branchId)

  const { data, error } = await query
  if (error) throw error

  const invoices = rowsToCamel(data ?? [])
  const filtered = filterInvoices(invoices, { fromDate, toDate, branchId })
  const report = computeServiceReport(filtered)

  const byServiceId = new Map()
  for (const row of report) {
    if (!row.serviceId) continue
    byServiceId.set(String(row.serviceId), {
      soldCount: row.count,
      revenue: row.revenue,
    })
  }

  return { byServiceId, invoiceCount: filtered.length }
}

export function lookupServiceStats(statsMap, { durationId = '', serviceId = '' } = {}) {
  const durationStats = durationId ? statsMap.byServiceId.get(String(durationId)) : null
  if (durationStats) return durationStats

  const serviceStats = serviceId ? statsMap.byServiceId.get(String(serviceId)) : null
  if (serviceStats) return serviceStats

  return { soldCount: 0, revenue: 0 }
}
