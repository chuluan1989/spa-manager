import { getBranchById } from '../constants/branches'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertBranchMinimal } from '../repositories/branchesRepository'
import { fetchEmployeeById } from '../repositories/employeesRepository'

/**
 * Kiểm tra chi nhánh + nhân viên đã tồn tại trên Supabase trước khi ghi hóa đơn/hồ sơ.
 * Tuyệt đối không tự tạo nhân viên mới.
 */
export async function ensureBranchAndEmployeeOnServer({
  branchId,
  employeeId,
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

  const remoteEmployee = await fetchEmployeeById(employeeId)
  if (!remoteEmployee) {
    throw new Error('Nhân viên không tồn tại.')
  }
  if (remoteEmployee.branchId && remoteEmployee.branchId !== branchId) {
    throw new Error('Nhân viên không thuộc chi nhánh này.')
  }
}
