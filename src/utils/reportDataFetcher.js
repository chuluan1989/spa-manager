import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchExpensesFiltered } from '../repositories/expensesRepository'
import { fetchInvoicesFiltered } from '../repositories/invoicesRepository'
import { filterExpenses } from './expenseStorage'
import { loadExpenses } from './expenseStorage'
import { loadInvoices } from './invoiceStorage'
import { filterInvoices } from './report'

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

/**
 * Nguồn dữ liệu thống nhất cho Dashboard + Báo cáo + Doanh thu.
 * Supabase ưu tiên; gộp thêm bản ghi local; fallback local khi lỗi/mất mạng.
 */
export async function fetchReportPeriodData(filters = {}) {
  const {
    fromDate = '',
    toDate = '',
    branchId = '',
    employeeId = '',
    customerSearch = '',
  } = filters

  const localInvoices = filterInvoices(loadInvoices(), filters)
  const localExpenses = filterExpenses(loadExpenses(), filters)

  if (!isSupabaseConfigured) {
    return {
      invoices: localInvoices,
      expenses: localExpenses,
      source: 'local',
    }
  }

  try {
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
      invoices: mergeRowsById(localInvoices, Array.isArray(remoteInvoices) ? remoteInvoices : []),
      expenses: mergeRowsById(localExpenses, Array.isArray(remoteExpenses) ? remoteExpenses : []),
      source: 'cloud',
    }
  } catch (err) {
    return {
      invoices: localInvoices,
      expenses: localExpenses,
      source: 'local-fallback',
      error: err,
    }
  }
}
