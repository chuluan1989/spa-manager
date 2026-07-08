import { loadInvoices } from './invoiceStorage'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const PERMANENT_DELETE_BLOCKED_MESSAGE =
  'Nhân viên đã phát sinh dữ liệu hệ thống. Vui lòng chuyển sang trạng thái Nghỉ việc hoặc Lưu trữ để đảm bảo tính toàn vẹn dữ liệu.'

function employeeHasInvoiceHistory(employeeId, invoices = loadInvoices()) {
  return invoices.some(
    (invoice) =>
      invoice.employeeId === employeeId
      || invoice.supportEmployeeId === employeeId,
  )
}

async function employeeHasRemoteActivity(employeeId) {
  if (!isSupabaseConfigured || !employeeId) return false

  const checks = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('support_employee_id', employeeId),
    supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
    supabase.from('payroll_adjustments').select('id', { count: 'exact', head: true }).eq('employee_id', employeeId),
  ])

  return checks.some(({ count, error }) => !error && Number(count ?? 0) > 0)
}

/** Kiểm tra có thể xóa vĩnh viễn — chỉ khi chưa phát sinh hóa đơn/chấm công/lương. */
export function canPermanentDeleteEmployee(employeeId, invoices = loadInvoices()) {
  if (!employeeId) {
    return { allowed: false, reason: 'Không tìm thấy nhân viên.' }
  }
  if (employeeHasInvoiceHistory(employeeId, invoices)) {
    return { allowed: false, reason: PERMANENT_DELETE_BLOCKED_MESSAGE }
  }
  return { allowed: true, reason: '' }
}

export async function canPermanentDeleteEmployeeRemote(employeeId, invoices = loadInvoices()) {
  const local = canPermanentDeleteEmployee(employeeId, invoices)
  if (!local.allowed) return local

  const hasRemote = await employeeHasRemoteActivity(employeeId)
  if (hasRemote) {
    return { allowed: false, reason: PERMANENT_DELETE_BLOCKED_MESSAGE }
  }

  return { allowed: true, reason: '' }
}
