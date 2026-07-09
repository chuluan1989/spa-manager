import { getBranchById } from '../constants/branches'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranchMinimal } from '../repositories/branchesRepository'
import { upsertEmployeeMinimal } from '../repositories/employeesRepository'

/**
 * Đảm bảo chi nhánh + nhân viên tồn tại trên Supabase trước khi ghi hóa đơn/hồ sơ.
 * (Cùng nguyên tắc với chấm công — tránh lỗi FK branch_id trên production.)
 */
export async function ensureBranchAndEmployeeOnServer({
  branchId,
  employeeId,
  employeeName = '',
  employeeStatus = 'active',
}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình. Không thể lưu dữ liệu.')
  }
  if (!branchId) {
    throw new Error('Thiếu chi nhánh.')
  }
  if (!employeeId) {
    throw new Error('Thiếu nhân viên.')
  }

  const branch = getBranchById(branchId)
  if (!branch?.id) {
    throw new Error('Không tìm thấy chi nhánh.')
  }

  await upsertBranchMinimal(branch)
  await upsertEmployeeMinimal({
    id: employeeId,
    branchId,
    name: employeeName,
    status: employeeStatus ?? 'active',
  })
}
