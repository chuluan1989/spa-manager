/**
 * Roster Gia Lai — chỉ còn utility (ID/mật khẩu). Không tự sinh nhân viên.
 */
import {
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN7_BRANCH_ID,
} from '../constants/giaLaiBranches'

export const GIA_LAI_ROSTER_VERSION_KEY = 'spa-manager-gia-lai-roster-version'
export const GIA_LAI_ROSTER_VERSION = '2026-07-08-v1'

export const GIA_LAI_EMPLOYEE_ROSTER = {
  [GIA_LAI_CN3_BRANCH_ID]: [
    'Thu Diễm',
    'Thu Hiền',
    'Tường Vy',
    'Thảo Nguyên',
    'Phương Thảo',
    'Thị Minh Hạ',
    'Hồng Nhung',
  ],
  [GIA_LAI_CN7_BRANCH_ID]: [
    'Bảo Ngọc',
    'Kim Huệ',
    'Mỹ Hạnh',
    'Như Ý',
    'Thiên Kim',
    'Gia Hân',
  ],
}

export function slugifyEmployeeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeEmployeeNameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

export function buildGiaLaiEmployeeId(branchId, name) {
  return `${branchId}-${slugifyEmployeeName(name)}`
}

export function computeGiaLaiLoginPassword(employeeName) {
  return normalizeEmployeeNameKey(employeeName) + 'gialai'
}

/** @deprecated Không còn tự sinh/sửa roster — Admin quản lý nhân viên thủ công. */
export function repairGiaLaiEmployeeRoster() {
  return { changed: false, activated: [], resigned: [], created: [] }
}

/** @deprecated Chỉ giữ API — credentials đồng bộ qua repairEmployeeCredentials. */
export async function syncGiaLaiEmployeeCredentials() {
  return []
}
