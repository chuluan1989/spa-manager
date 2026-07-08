import { ADMIN_BRANCH } from '../constants/roles'
import { computeEmployeeDefaultPassword } from '../constants/loginCredentials'
import { upsertCredentials } from '../repositories/credentialsRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getBranchName, loadBranches } from './branchStorage'
import { formatLastLogin, getAccountMeta, loadAccountMetadata } from './accountMetadataStorage'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { hashPassword, isPasswordHash, verifyPassword } from './passwordHash'

const STORAGE_KEY = 'spa-manager-credentials'

function pushCredentialsToSupabase(credentials) {
  if (!isSupabaseConfigured) return
  upsertCredentials(credentials).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
  })
}

export const DEFAULT_ADMIN_PASSWORD = 'admin123'

export const DEFAULT_BRANCH_PASSWORDS = {
  'vinh-long': 'khoespavinhlong',
  'tra-vinh': 'khoespatravinh',
  'bac-lieu': 'khoespabaclieu',
  'soc-trang': 'khoespasoctrang',
  'tram-spa': 'tramspa',
  'song-khoe-spa': 'songkhoespa',
  'gia-lai-1': 'khoespagialai1',
  'gia-lai-2': 'khoespagialai2',
  'gia-lai-3': 'khoespagialai3',
}

function buildDefaultCredentials() {
  return {
    admin: DEFAULT_ADMIN_PASSWORD,
    branches: { ...DEFAULT_BRANCH_PASSWORDS },
    employees: {},
  }
}

async function normalizeStoredPassword(value) {
  if (!value) return value
  if (isPasswordHash(value)) return value
  return hashPassword(value)
}

async function normalizeCredentials(data) {
  const admin = await normalizeStoredPassword(data.admin ?? DEFAULT_ADMIN_PASSWORD)
  const branches = {}
  const employees = {}

  for (const [branchId, password] of Object.entries({
    ...DEFAULT_BRANCH_PASSWORDS,
    ...(data.branches ?? {}),
  })) {
    branches[branchId] = await normalizeStoredPassword(password)
  }

  for (const [employeeId, entry] of Object.entries(data.employees ?? {})) {
    if (!entry?.password) continue
    employees[employeeId] = {
      branchId: entry.branchId ?? '',
      name: entry.name ?? '',
      password: await normalizeStoredPassword(entry.password),
    }
  }

  return { admin, branches, employees }
}

export function loadCredentials() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults = buildDefaultCredentials()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return defaults
    }
    const data = JSON.parse(raw)
    return {
      admin: data.admin ?? DEFAULT_ADMIN_PASSWORD,
      branches: { ...DEFAULT_BRANCH_PASSWORDS, ...(data.branches ?? {}) },
      employees: data.employees ?? {},
    }
  } catch {
    return buildDefaultCredentials()
  }
}

export async function ensureCredentialsHashed() {
  const current = loadCredentials()
  const needsHash = !isPasswordHash(current.admin)
    || Object.values(current.branches).some((password) => !isPasswordHash(password))
    || Object.values(current.employees ?? {}).some((entry) => entry?.password && !isPasswordHash(entry.password))

  if (!needsHash) return current

  const normalized = await normalizeCredentials(current)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function saveCredentials(credentials, { skipRemoteSync = false } = {}) {
  const current = loadCredentials()
  const normalized = {
    admin: credentials.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: { ...current.branches, ...(credentials.branches ?? {}) },
    employees: { ...current.employees, ...(credentials.employees ?? {}) },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushCredentialsToSupabase(normalized)
  return normalized
}

export async function saveCredentialsHashed(credentials, { skipRemoteSync = false } = {}) {
  const current = loadCredentials()
  const normalized = await normalizeCredentials({
    admin: credentials.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: { ...current.branches, ...(credentials.branches ?? {}) },
    employees: { ...current.employees, ...(credentials.employees ?? {}) },
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushCredentialsToSupabase(normalized)
  return normalized
}

export function getAdminPassword() {
  return loadCredentials().admin
}

export function getBranchPassword(branchId) {
  return loadCredentials().branches[branchId] ?? ''
}

export async function verifyAdminPassword(password) {
  const credentials = await ensureCredentialsHashed()
  return verifyPassword(password, credentials.admin)
}

export async function verifyBranchPassword(branchId, password) {
  const credentials = await ensureCredentialsHashed()
  return verifyPassword(password, credentials.branches[branchId] ?? '')
}

export async function verifyEmployeePassword(employeeId, password) {
  const credentials = await ensureCredentialsHashed()
  const entry = credentials.employees?.[employeeId]
  if (!entry?.password) return false
  return verifyPassword(password.trim().toLowerCase(), entry.password)
}

export async function syncEmployeeCredentialsFromEmployees() {
  const employees = loadEmployees().filter(isEmployeeLoginEligible)
  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}
  let changed = false

  for (const employee of employees) {
    const plainPassword = computeEmployeeDefaultPassword(
      employee.name,
      getBranchName(employee.branchId),
    )
    const nextEntry = {
      branchId: employee.branchId,
      name: employee.name,
      password: await hashPassword(plainPassword),
    }
    const current = credentials.employees[employee.id]
    if (
      !current
      || current.branchId !== nextEntry.branchId
      || current.name !== nextEntry.name
      || !isPasswordHash(current.password)
      || !(await verifyPassword(plainPassword, current.password))
    ) {
      credentials.employees[employee.id] = nextEntry
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return credentials
}

/** Sửa credentials sai branch_id / employee_id — không xóa nhân viên. */
export async function repairEmployeeCredentials() {
  const employees = loadEmployees()
  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}
  let changed = false

  for (const employee of employees) {
    if (!isEmployeeLoginEligible(employee)) continue
    const plainPassword = computeEmployeeDefaultPassword(
      employee.name,
      getBranchName(employee.branchId),
    )
    const current = credentials.employees[employee.id]
    const needsCreate = !current
    const wrongBranch = current?.branchId && current.branchId !== employee.branchId
    const wrongName = current?.name && current.name !== employee.name
    const wrongPassword = current?.password && !(await verifyPassword(plainPassword, current.password))

    if (needsCreate || wrongBranch || wrongName || wrongPassword) {
      credentials.employees[employee.id] = {
        branchId: employee.branchId,
        name: employee.name,
        password: await hashPassword(plainPassword),
      }
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return { changed, credentials }
}

/** Đồng bộ credential một nhân viên sau khi đổi chi nhánh / tên. */
export async function syncEmployeeCredentialForEmployee(employeeId) {
  const employee = loadEmployees().find((item) => item.id === employeeId)
  if (!employee || !isEmployeeLoginEligible(employee)) return null

  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}

  const plainPassword = computeEmployeeDefaultPassword(
    employee.name,
    getBranchName(employee.branchId),
  )
  credentials.employees[employee.id] = {
    branchId: employee.branchId,
    name: employee.name,
    password: await hashPassword(plainPassword),
  }
  return saveCredentials(credentials)
}

export async function updateAdminPassword(password) {
  const credentials = loadCredentials()
  credentials.admin = await hashPassword(password)
  return saveCredentials(credentials)
}

export async function updateBranchPassword(branchId, password) {
  const credentials = loadCredentials()
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(password),
  }
  return saveCredentials(credentials)
}

export async function syncMissingBranchCredentials() {
  const branches = loadBranches()
  const credentials = await ensureCredentialsHashed()
  let changed = false

  for (const branch of branches) {
    if (!credentials.branches[branch.id]) {
      credentials.branches[branch.id] = await hashPassword(`spa-${branch.id}`)
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return credentials
}

export async function registerBranchCredential(branchId, password) {
  const credentials = loadCredentials()
  const value = password?.trim() || `spa-${branchId}`
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(value),
  }
  return saveCredentials(credentials)
}

export function removeBranchCredential(branchId) {
  const credentials = loadCredentials()
  if (!credentials.branches?.[branchId]) return credentials
  const { [branchId]: _removed, ...rest } = credentials.branches
  return saveCredentials({ ...credentials, branches: rest })
}

export async function updateEmployeePassword(employeeId, password) {
  const credentials = loadCredentials()
  const entry = credentials.employees?.[employeeId]
  if (!entry) {
    return { success: false, error: 'Không tìm thấy tài khoản nhân viên.' }
  }
  credentials.employees = {
    ...credentials.employees,
    [employeeId]: {
      ...entry,
      password: await hashPassword(password),
    },
  }
  saveCredentials(credentials)
  return { success: true }
}

export function getAccountList() {
  const credentials = loadCredentials()
  const metadata = loadAccountMetadata()
  const mask = (value) => (isPasswordHash(value) ? '••••••••' : value)

  return [
    {
      id: 'admin',
      label: 'Admin',
      branchId: ADMIN_BRANCH,
      branchName: 'Tất cả',
      role: 'Admin',
      password: mask(credentials.admin),
      status: metadata.admin?.locked ? 'locked' : 'active',
      lastLogin: formatLastLogin(metadata.admin?.lastLogin),
    },
    ...loadBranches().map((branch) => ({
      id: branch.id,
      label: `QL ${branch.name}`,
      branchId: branch.id,
      branchName: branch.name,
      role: 'Quản lý chi nhánh',
      password: mask(credentials.branches[branch.id] ?? ''),
      status: metadata[branch.id]?.locked ? 'locked' : 'active',
      lastLogin: formatLastLogin(metadata[branch.id]?.lastLogin),
    })),
  ]
}

export function getAccountMetaForKey(accountKey) {
  return getAccountMeta(accountKey)
}
