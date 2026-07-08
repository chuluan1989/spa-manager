/**
 * Đồng bộ lại nhân viên Gia Lai 1 & Gia Lai 2.
 * - Soft-lock nhân viên cũ (resigned) — không hard delete.
 * - Thêm/activate danh sách mới.
 * - Mật khẩu mặc định: tên không dấu + "gialai" (passwordName chi nhánh = "Gia Lai").
 */
import {
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN7_BRANCH_ID,
} from '../constants/giaLaiBranches'
import {
  EMPLOYEE_STATUS,
  loadEmployees,
  normalizeEmployee,
  saveEmployees,
} from './employeeStorage'
import { syncEmployeeCredentialForEmployee } from './credentialsStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertEmployee } from '../repositories/employeesRepository'

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

function findExistingForRoster(employees, branchId, name) {
  const wantedId = buildGiaLaiEmployeeId(branchId, name)
  const byId = employees.find((emp) => emp.id === wantedId)
  if (byId) return byId

  const nameKey = normalizeEmployeeNameKey(name)
  return employees.find(
    (emp) =>
      emp.branchId === branchId
      && normalizeEmployeeNameKey(emp.name) === nameKey,
  ) ?? null
}

/**
 * Áp dụng roster một lần (idempotent theo version key).
 */
export function repairGiaLaiEmployeeRoster({ force = false } = {}) {
  if (!force) {
    try {
      if (localStorage.getItem(GIA_LAI_ROSTER_VERSION_KEY) === GIA_LAI_ROSTER_VERSION) {
        return { changed: false, activated: [], resigned: [], created: [] }
      }
    } catch {
      /* continue */
    }
  }

  const employees = loadEmployees().map((row) => normalizeEmployee(row))
  const byId = new Map(employees.map((emp) => [emp.id, emp]))
  const activated = []
  const resigned = []
  const created = []
  const keepIds = new Set()

  for (const [branchId, names] of Object.entries(GIA_LAI_EMPLOYEE_ROSTER)) {
    for (const name of names) {
      const wantedId = buildGiaLaiEmployeeId(branchId, name)
      const existing = findExistingForRoster([...byId.values()], branchId, name)

      if (existing) {
        const next = normalizeEmployee({
          ...existing,
          name,
          branchId,
          status: EMPLOYEE_STATUS.ACTIVE,
          endDate: '',
        })
        byId.set(existing.id, next)
        keepIds.add(existing.id)
        activated.push(existing.id)
      } else {
        const next = normalizeEmployee({
          id: wantedId,
          name,
          branchId,
          status: EMPLOYEE_STATUS.ACTIVE,
          position: 'KTV',
          startDate: new Date().toISOString().slice(0, 10),
        })
        byId.set(wantedId, next)
        keepIds.add(wantedId)
        created.push(wantedId)
      }
    }

    for (const emp of [...byId.values()]) {
      if (emp.branchId !== branchId) continue
      if (keepIds.has(emp.id)) continue
      if (emp.status === EMPLOYEE_STATUS.RESIGNED || emp.status === EMPLOYEE_STATUS.ARCHIVED) {
        continue
      }
      byId.set(emp.id, normalizeEmployee({
        ...emp,
        status: EMPLOYEE_STATUS.RESIGNED,
        endDate: emp.endDate || new Date().toISOString().slice(0, 10),
        note: [emp.note, 'Ngừng làm — thay roster Gia Lai 2026-07-08'].filter(Boolean).join(' · '),
      }))
      resigned.push(emp.id)
    }
  }

  const nextEmployees = [...byId.values()]
  saveEmployees(nextEmployees)

  if (isSupabaseConfigured) {
    for (const id of [...new Set([...activated, ...created, ...resigned])]) {
      const emp = byId.get(id)
      if (!emp) continue
      upsertEmployee(emp).catch((error) => {
        console.warn('[GiaLaiRoster] Không đẩy được nhân viên lên Supabase:', error?.message)
      })
    }
  }

  try {
    localStorage.setItem(GIA_LAI_ROSTER_VERSION_KEY, GIA_LAI_ROSTER_VERSION)
  } catch {
    /* ignore */
  }

  return {
    changed: activated.length + resigned.length + created.length > 0,
    activated,
    resigned,
    created,
  }
}

/** Đồng bộ credential đăng nhập cho nhân viên active Gia Lai 1/2. */
export async function syncGiaLaiEmployeeCredentials() {
  const branchIds = new Set(Object.keys(GIA_LAI_EMPLOYEE_ROSTER))
  const employees = loadEmployees().filter(
    (emp) => branchIds.has(emp.branchId) && emp.status === EMPLOYEE_STATUS.ACTIVE,
  )

  for (const employee of employees) {
    await syncEmployeeCredentialForEmployee(employee.id)
  }

  return employees.map((emp) => emp.id)
}
