import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpensesFiltered } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'

/**
 * Nguồn dữ liệu thống nhất cho Dashboard + Báo cáo + Doanh thu.
 * Chỉ lấy từ Supabase — không merge/fallback LocalStorage.
 */
export async function fetchReportPeriodData(filters = {}) {
  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    employeeId = '',
    customerSearch = '',
  } = filters

  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể tải dữ liệu báo cáo.')
  }

  const [remoteInvoices, remoteExpenses] = await Promise.all([
    fetchInvoicesFiltered({
      fromDate,
      toDate,
      branchId,
      employeeId,
      customerSearch,
    }),
    fetchExpensesFiltered({ fromDate, toDate, branchId }),
  ])

  return {
    invoices: Array.isArray(remoteInvoices) ? remoteInvoices : [],
    expenses: Array.isArray(remoteExpenses) ? remoteExpenses : [],
    source: 'cloud',
  }
}
