/**
 * Dữ liệu nhân viên chỉ dùng trong smoke-test — KHÔNG gọi từ app production.
 */
import {
  normalizeEmployee,
  saveEmployees,
  loadEmployees,
  EMPLOYEE_STATUS,
} from '../src/utils/employeeStorage.js'
import {
  GIA_LAI_EMPLOYEE_ROSTER,
  buildGiaLaiEmployeeId,
} from '../src/utils/giaLaiEmployeeRoster.js'

const DEFAULT_EMPLOYEE_NAMES = {
  'vinh-long': ['Linh', 'Thơ', 'Bơ', 'Đậu', 'Diệu', 'Thảo', 'Trâm'],
  'tra-vinh': ['Mai Nhi', 'Nhật Hà', 'Trúc Trinh', 'Diễm Trinh', 'Trà My'],
  'bac-lieu': ['Thảo Cầm', 'Thu Hương', 'Thanh Thư', 'Mỹ Nhiên', 'Yến'],
  'soc-trang': ['Chị 7', 'Bảo Trân', 'Tịnh', 'Ly Ly', 'Quyên', 'An Nhỏ'],
  'tram-spa': ['Thanh', 'Nhu Hà', 'Trúc Ly', 'Cherry', 'Lan Anh'],
  'song-khoe-spa': ['Úc', 'Hải Anh', 'Di Di', 'Ngân', 'Ánh'],
  'gia-lai-1': ['Thu Diễm', 'Thu Hiền', 'Tường Vy', 'Thảo Nguyên', 'Phương Thảo', 'Thị Minh Hạ', 'Hồng Nhung'],
  'gia-lai-2': ['Bảo Ngọc', 'Kim Huệ', 'Mỹ Hạnh', 'Như Ý', 'Thiên Kim', 'Gia Hân'],
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildDefaultTestEmployees() {
  const employees = []
  for (const [branchId, names] of Object.entries(DEFAULT_EMPLOYEE_NAMES)) {
    for (const name of names) {
      employees.push(normalizeEmployee({
        id: `${branchId}-${slugify(name)}`,
        name,
        branchId,
        status: EMPLOYEE_STATUS.ACTIVE,
      }))
    }
  }
  return employees
}

/** Ghi danh sách nhân viên mặc định vào localStorage test. */
export function seedDefaultTestEmployees() {
  saveEmployees(buildDefaultTestEmployees())
}

/** Ghi roster Gia Lai vào localStorage test (không auto-repair). */
export function seedGiaLaiTestEmployees() {
  const existing = loadEmployees()
  const byId = new Map(existing.map((emp) => [emp.id, emp]))

  for (const [branchId, names] of Object.entries(GIA_LAI_EMPLOYEE_ROSTER)) {
    for (const name of names) {
      const id = buildGiaLaiEmployeeId(branchId, name)
      byId.set(id, normalizeEmployee({
        id,
        name,
        branchId,
        status: EMPLOYEE_STATUS.ACTIVE,
        position: 'KTV',
      }))
    }
  }

  saveEmployees([...byId.values()])
}
