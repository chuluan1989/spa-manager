import { ADMIN_BRANCH, ROLES } from '../constants/roles'
import { computeEmployeeDefaultPassword } from '../constants/loginCredentials'
import { upsertCredentials } from '../repositories/credentialsRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { CANONICAL_BRANCHES } from '../constants/canonicalBranches'
import { getBranchName, getPasswordBranchName, loadBranches } from './branchStorage'
import { formatLastLogin, getAccountMeta, loadAccountMetadata } from './accountMetadataStorage'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { getSessionUser, isSessionAdmin } from './storageAccess'
import { hashPassword, isPasswordHash, verifyPassword } from './passwordHash'

export const MIN_PASSWORD_LENGTH = 8

const STORAGE_KEY = 'spa-manager-credentials'

function pushCredentialsToSupabase(credentials) {
  if (!isSupabaseConfigured) return
  upsertCredentials(credentials).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
  })
}

export const DEFAULT_ADMIN_PASSWORD = 'admin123'

export const DEFAULT_BRANCH_PASSWORDS = Object.fromEntries(
  CANONICAL_BRANCHES.map((branch) => [branch.id, branch.managerPassword]),
)

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
      passwordUpdatedAt: entry.passwordUpdatedAt ?? null,
      customPassword: Boolean(entry.customPassword),
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

/**
 * Password tuyệt đối: chỉ Change Password / Reset Password được ghi password.
 * Sync / repair / hydrate chỉ được tạo credential lần đầu hoặc cập nhật name/branchId.
 */
function buildEmployeeCredentialMeta(employee, existing = null) {
  return {
    branchId: employee.branchId ?? existing?.branchId ?? '',
    name: employee.name ?? existing?.name ?? '',
    password: existing?.password,
    passwordUpdatedAt: existing?.passwordUpdatedAt ?? null,
    customPassword: Boolean(existing?.customPassword),
  }
}

async function provisionEmployeeCredentialIfMissing(credentials, employee) {
  const current = credentials.employees?.[employee.id]
  if (current?.password) {
    const nextMeta = buildEmployeeCredentialMeta(employee, current)
    if (
      nextMeta.branchId !== current.branchId
      || nextMeta.name !== current.name
    ) {
      credentials.employees[employee.id] = {
        ...current,
        branchId: nextMeta.branchId,
        name: nextMeta.name,
        // password / passwordUpdatedAt / customPassword giữ nguyên
      }
      return true
    }
    return false
  }

  const plainPassword = computeEmployeeDefaultPassword(
    employee.name,
    getPasswordBranchName(employee.branchId),
  )
  credentials.employees[employee.id] = {
    branchId: employee.branchId ?? '',
    name: employee.name ?? '',
    password: await hashPassword(plainPassword),
    passwordUpdatedAt: null,
    customPassword: false,
  }
  return true
}

export async function syncEmployeeCredentialsFromEmployees() {
  const employees = loadEmployees().filter(isEmployeeLoginEligible)
  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}
  let changed = false

  for (const employee of employees) {
    // eslint-disable-next-line no-await-in-loop
    if (await provisionEmployeeCredentialIfMissing(credentials, employee)) {
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return credentials
}

/** Sửa credentials sai branch_id / employee_id — không xóa nhân viên, không đụng password. */
export async function repairEmployeeCredentials() {
  const employees = loadEmployees()
  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}
  let changed = false

  for (const employee of employees) {
    if (!isEmployeeLoginEligible(employee)) continue
    // eslint-disable-next-line no-await-in-loop
    if (await provisionEmployeeCredentialIfMissing(credentials, employee)) {
      changed = true
    }
  }

  if (changed) {
    saveCredentials(credentials)
  }

  return { changed, credentials }
}

/** Đồng bộ name/branchId credential — không ghi đè password. */
export async function syncEmployeeCredentialForEmployee(employeeId) {
  const employee = loadEmployees().find((item) => item.id === employeeId)
  if (!employee || !isEmployeeLoginEligible(employee)) return null

  const credentials = await ensureCredentialsHashed()
  credentials.employees = credentials.employees ?? {}
  await provisionEmployeeCredentialIfMissing(credentials, employee)
  return saveCredentials(credentials)
}

/**
 * Validate mật khẩu mới (self-change + admin reset).
 * Trả về password đã trim; không log / không lưu plaintext ngoài credentials hash.
 */
export function validateNewPassword(newPassword, confirmPassword, { currentPassword } = {}) {
  const next = String(newPassword ?? '')
  const confirm = String(confirmPassword ?? '')
  const current = String(currentPassword ?? '')

  if (!next.trim()) {
    return { ok: false, error: 'Vui lòng nhập mật khẩu mới' }
  }
  if (next !== next.trim()) {
    return { ok: false, error: 'Mật khẩu không được có khoảng trắng ở đầu hoặc cuối' }
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Mật khẩu mới tối thiểu ${MIN_PASSWORD_LENGTH} ký tự` }
  }
  if (!/[A-Za-zÀ-ỹ]/.test(next) || !/\d/.test(next)) {
    return { ok: false, error: 'Mật khẩu mới cần có ít nhất 1 chữ cái và 1 chữ số' }
  }
  if (confirm !== next) {
    return { ok: false, error: 'Mật khẩu xác nhận không khớp' }
  }
  if (current && next === current.trim()) {
    return { ok: false, error: 'Mật khẩu mới không được giống mật khẩu hiện tại' }
  }
  return { ok: true, password: next }
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

export function removeEmployeeCredential(employeeId) {
  if (!employeeId) return loadCredentials()
  const credentials = loadCredentials()
  if (!credentials.employees?.[employeeId]) return credentials
  const { [employeeId]: _removed, ...rest } = credentials.employees
  const next = { ...credentials, employees: rest }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  pushCredentialsToSupabase(next)
  return next
}

export async function pruneInactiveEmployeeCredentials() {
  const employees = loadEmployees()
  const eligibleIds = new Set(employees.filter(isEmployeeLoginEligible).map((employee) => employee.id))
  const credentials = await ensureCredentialsHashed()
  const nextEmployees = { ...(credentials.employees ?? {}) }
  let changed = false

  for (const employeeId of Object.keys(nextEmployees)) {
    if (!eligibleIds.has(employeeId)) {
      delete nextEmployees[employeeId]
      changed = true
    }
  }

  if (!changed) return credentials
  const next = { ...credentials, employees: nextEmployees }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  pushCredentialsToSupabase(next)
  return next
}

/** Admin Reset Password — đặt mật khẩu mới, không đọc mật khẩu cũ. */
export async function updateEmployeePassword(employeeId, password, confirmPassword = password) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu nhân viên.' }
  }
  const validated = validateNewPassword(password, confirmPassword)
  if (!validated.ok) return { success: false, error: validated.error }

  const credentials = await ensureCredentialsHashed()
  const entry = credentials.employees?.[employeeId]
  const employee = loadEmployees().find((item) => item.id === employeeId)
  if (!entry && !employee) {
    return { success: false, error: 'Không tìm thấy tài khoản nhân viên.' }
  }

  // Hash lowercase để khớp verifyEmployeePassword (login luôn lower-case input).
  const passwordToStore = validated.password.toLowerCase()
  credentials.employees = {
    ...credentials.employees,
    [employeeId]: {
      branchId: entry?.branchId ?? employee?.branchId ?? '',
      name: entry?.name ?? employee?.name ?? '',
      password: await hashPassword(passwordToStore),
      passwordUpdatedAt: new Date().toISOString(),
      customPassword: true,
    },
  }
  try {
    saveCredentials(credentials)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu' }
  }
}

/** Nhân viên tự đổi mật khẩu (cần mật khẩu hiện tại). Chỉ đổi tài khoản đang đăng nhập. */
export async function changeOwnEmployeePassword({
  employeeId,
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const session = getSessionUser()
  if (!session || session.role !== ROLES.EMPLOYEE || session.employeeId !== employeeId) {
    return { success: false, error: 'Bạn chỉ được đổi mật khẩu của chính mình.' }
  }
  if (!employeeId) return { success: false, error: 'Không xác định được nhân viên.' }
  if (!String(currentPassword ?? '').trim()) {
    return { success: false, error: 'Vui lòng nhập mật khẩu hiện tại' }
  }
  const validated = validateNewPassword(newPassword, confirmPassword, { currentPassword })
  if (!validated.ok) return { success: false, error: validated.error }

  const credentials = await ensureCredentialsHashed()
  let entry = credentials.employees?.[employeeId]
  if (!entry?.password) {
    const employee = loadEmployees().find((item) => item.id === employeeId)
    if (!employee) return { success: false, error: 'Không tìm thấy tài khoản nhân viên.' }
    await provisionEmployeeCredentialIfMissing(credentials, employee)
    entry = credentials.employees[employeeId]
  }

  const currentOk = await verifyEmployeePassword(employeeId, currentPassword)
  const employee = loadEmployees().find((item) => item.id === employeeId)
  const defaultOk = employee
    ? String(currentPassword).trim().toLowerCase()
      === computeEmployeeDefaultPassword(employee.name, getPasswordBranchName(employee.branchId))
    : false
  if (!currentOk && !defaultOk) {
    return { success: false, error: 'Mật khẩu hiện tại không đúng' }
  }

  const passwordToStore = validated.password.toLowerCase()
  if (passwordToStore === String(currentPassword).trim().toLowerCase()) {
    return { success: false, error: 'Mật khẩu mới không được giống mật khẩu hiện tại' }
  }

  credentials.employees[employeeId] = {
    ...entry,
    password: await hashPassword(passwordToStore),
    passwordUpdatedAt: new Date().toISOString(),
    customPassword: true,
  }
  try {
    saveCredentials(credentials)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu' }
  }
}

/** Quản lý chi nhánh tự đổi mật khẩu chi nhánh. Chỉ đổi tài khoản đang đăng nhập. */
export async function changeOwnBranchPassword({
  branchId,
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const session = getSessionUser()
  if (!session || session.role !== ROLES.BRANCH_MANAGER || session.branch !== branchId) {
    return { success: false, error: 'Bạn chỉ được đổi mật khẩu của chính mình.' }
  }
  if (!branchId) return { success: false, error: 'Không xác định được chi nhánh.' }
  if (!String(currentPassword ?? '').trim()) {
    return { success: false, error: 'Vui lòng nhập mật khẩu hiện tại' }
  }
  const validated = validateNewPassword(newPassword, confirmPassword, { currentPassword })
  if (!validated.ok) return { success: false, error: validated.error }
  if (!(await verifyBranchPassword(branchId, currentPassword))) {
    return { success: false, error: 'Mật khẩu hiện tại không đúng' }
  }
  try {
    await updateBranchPassword(branchId, validated.password)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu' }
  }
}

/** Admin tự đổi mật khẩu (cần mật khẩu hiện tại). */
export async function changeOwnAdminPassword({
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const session = getSessionUser()
  if (!session || session.role !== ROLES.ADMIN) {
    return { success: false, error: 'Bạn chỉ được đổi mật khẩu của chính mình.' }
  }
  if (!String(currentPassword ?? '').trim()) {
    return { success: false, error: 'Vui lòng nhập mật khẩu hiện tại' }
  }
  const validated = validateNewPassword(newPassword, confirmPassword, { currentPassword })
  if (!validated.ok) return { success: false, error: validated.error }
  if (!(await verifyAdminPassword(currentPassword))) {
    return { success: false, error: 'Mật khẩu hiện tại không đúng' }
  }
  try {
    await updateAdminPassword(validated.password)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu' }
  }
}

export function getEmployeePasswordUpdatedAt(employeeId) {
  const entry = loadCredentials().employees?.[employeeId]
  return entry?.passwordUpdatedAt ?? null
}

export function getAccountList() {
  const credentials = loadCredentials()
  const metadata = loadAccountMetadata()

  return [
    {
      id: 'admin',
      accountKey: 'admin',
      label: 'Admin',
      username: 'admin',
      branchId: ADMIN_BRANCH,
      branchName: 'Tất cả',
      role: 'Admin',
      status: metadata.admin?.locked ? 'locked' : 'active',
      lastLogin: formatLastLogin(metadata.admin?.lastLogin),
      passwordUpdatedAt: null,
    },
    ...loadBranches().map((branch) => ({
      id: branch.id,
      accountKey: branch.id,
      label: `QL ${branch.name}`,
      username: branch.id,
      branchId: branch.id,
      branchName: branch.name,
      role: 'Quản lý chi nhánh',
      status: metadata[branch.id]?.locked ? 'locked' : 'active',
      lastLogin: formatLastLogin(metadata[branch.id]?.lastLogin),
      passwordUpdatedAt: null,
    })),
    ...loadEmployees().filter(isEmployeeLoginEligible).map((employee) => {
      const accountKey = `employee:${employee.id}`
      const entry = credentials.employees?.[employee.id]
      return {
        id: employee.id,
        accountKey,
        label: employee.name || employee.id,
        username: employee.id,
        branchId: employee.branchId,
        branchName: getBranchName(employee.branchId),
        role: 'Nhân viên',
        status: metadata[accountKey]?.locked ? 'locked' : 'active',
        lastLogin: formatLastLogin(metadata[accountKey]?.lastLogin),
        passwordUpdatedAt: entry?.passwordUpdatedAt ?? null,
        isEmployee: true,
      }
    }),
  ]
}

/** pullAll credentials: gộp name/branch; password chỉ lấy từ payload đã lưu (Change/Reset), không regenerate. */
export function mergeCredentialsPreservingPasswords(localCredentials, remoteCredentials) {
  const local = localCredentials ?? buildDefaultCredentials()
  const remote = remoteCredentials ?? {}
  const employees = { ...(local.employees ?? {}) }

  for (const [employeeId, remoteEntry] of Object.entries(remote.employees ?? {})) {
    if (!remoteEntry?.password) continue
    const localEntry = employees[employeeId]
    if (!localEntry?.password) {
      employees[employeeId] = {
        branchId: remoteEntry.branchId ?? '',
        name: remoteEntry.name ?? '',
        password: remoteEntry.password,
        passwordUpdatedAt: remoteEntry.passwordUpdatedAt ?? null,
        customPassword: Boolean(remoteEntry.customPassword),
      }
      continue
    }

    const localAt = Date.parse(localEntry.passwordUpdatedAt ?? 0) || 0
    const remoteAt = Date.parse(remoteEntry.passwordUpdatedAt ?? 0) || 0
    const preferRemotePassword = remoteAt > localAt
      || (remoteAt === localAt && remoteEntry.customPassword && !localEntry.customPassword)

    employees[employeeId] = {
      branchId: remoteEntry.branchId || localEntry.branchId || '',
      name: remoteEntry.name || localEntry.name || '',
      password: preferRemotePassword ? remoteEntry.password : localEntry.password,
      passwordUpdatedAt: preferRemotePassword
        ? (remoteEntry.passwordUpdatedAt ?? localEntry.passwordUpdatedAt ?? null)
        : (localEntry.passwordUpdatedAt ?? remoteEntry.passwordUpdatedAt ?? null),
      customPassword: Boolean(
        preferRemotePassword ? remoteEntry.customPassword : localEntry.customPassword,
      ) || Boolean(remoteEntry.customPassword) || Boolean(localEntry.customPassword),
    }
  }

  return {
    admin: remote.admin ?? local.admin,
    branches: { ...(local.branches ?? {}), ...(remote.branches ?? {}) },
    employees,
  }
}
