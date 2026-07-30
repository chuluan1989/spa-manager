import { getPasswordBranchName, resolveCanonicalBranchId } from '../constants/canonicalBranches'
import { loadBranches } from '../constants/branches'

/** Chuẩn hóa chuỗi đăng nhập / mật khẩu: bỏ dấu, lowercase, chỉ a-z0-9. */
export function normalizeLoginText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

/** QL chi nhánh: tram-spa → tramspa */
export function branchManagerUsername(branchId) {
  return normalizeLoginText(String(branchId ?? '').replace(/-/g, ''))
}

/** QL chi nhánh: tramspa123 */
export function branchManagerDefaultPassword(branchId) {
  return `${branchManagerUsername(branchId)}123`
}

/** NV: Hồng Thương → hongthuong */
export function employeeUsernameFromName(fullName) {
  return normalizeLoginText(fullName)
}

/** NV: username + tên chi nhánh (vd: hongthuongvinhlong, thanhtramspa) */
export function employeeDefaultPassword(loginUsername, branchId) {
  const branchPart = normalizeLoginText(
    getPasswordBranchName(resolveCanonicalBranchId(branchId)),
  )
  return normalizeLoginText(loginUsername) + branchPart
}

/**
 * Cấp username duy nhất cho danh sách nhân viên (ổn định, có hậu tố số khi trùng).
 * @returns {{ usernames: Map<string,string>, duplicateResolutions: Array<{employeeId,name,base,assigned}> }}
 */
export function assignEmployeeUsernames(employees) {
  const reserved = new Set(['admin'])
  for (const branch of loadBranches()) {
    reserved.add(branchManagerUsername(branch.id))
  }

  const sorted = [...employees].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const usernames = new Map()
  const duplicateResolutions = []

  for (const employee of sorted) {
    const base = employeeUsernameFromName(employee.name)
    if (!base) {
      usernames.set(employee.id, '')
      continue
    }

    let candidate = base
    if (reserved.has(candidate)) {
      let suffix = 2
      while (reserved.has(`${base}${suffix}`)) suffix += 1
      candidate = `${base}${suffix}`
      duplicateResolutions.push({
        employeeId: employee.id,
        name: employee.name,
        base,
        assigned: candidate,
      })
    }

    reserved.add(candidate)
    usernames.set(employee.id, candidate)
  }

  return { usernames, duplicateResolutions }
}

export function buildBranchManagerAccountRows() {
  return loadBranches().map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    username: branchManagerUsername(branch.id),
    defaultPassword: branchManagerDefaultPassword(branch.id),
    role: 'branch_manager',
  }))
}
