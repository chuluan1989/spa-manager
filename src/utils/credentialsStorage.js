import { ADMIN_BRANCH, ROLES } from '../constants/roles'
import {
  allocateEmployeeLoginUsername,
  computeBranchManagerLoginUsername,
  getEmployeeLoginUsername,
  getStoredEmployeeLoginUsername,
  isEmployeeLoginUsernameAvailable,
} from './loginUsername'
import { assignEmployeeUsernames, branchManagerUsername } from '../login/loginRules'
import { buildRegeneratedCredentials } from '../login/regenerateAllAccounts'
import { persistCredentialsPayload, upsertCredentials } from '../repositories/credentialsRepository'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  CANONICAL_BRANCH_BY_ID,
  CANONICAL_BRANCHES,
  resolveCanonicalBranchId,
} from '../constants/canonicalBranches'
import { getBranchName, getPasswordBranchName, loadBranches } from './branchStorage'
import { formatLastLogin, getAccountMeta, loadAccountMetadata } from './accountMetadataStorage'
import { isEmployeeLoginEligible, loadEmployees } from './employeeStorage'
import { getSessionUser, isSessionAdmin } from './storageAccess'
import { hashPassword, isPasswordHash, verifyPassword } from './passwordHash'
import {
  canMutateEmployeeAccountOnLive,
  canUseBranchWideBulkReset,
  canUseSystemWideBulkReset,
  isLiveSupabaseEnvironment,
  isUatEmployeeId,
  liveMutationBlockedMessage,
} from './uatAccountGuard'

export const MIN_PASSWORD_LENGTH = 8

const STORAGE_KEY = 'spa-manager-credentials'

async function pushCredentialsToSupabase(credentials) {
  if (!isSupabaseConfigured) return
  try {
    await upsertCredentials(credentials)
  } catch (error) {
    console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
    throw error
  }
}

export const DEFAULT_ADMIN_PASSWORD = 'admin123'

/** MK quản lý chuẩn từ cấu hình chi nhánh (vd: tramspa, khoespasoctrang). */
export function getBranchManagerCanonicalPassword(branchId) {
  const canonicalId = resolveCanonicalBranchId(branchId)
  const canonical = CANONICAL_BRANCH_BY_ID[canonicalId]
  if (canonical?.managerPassword) return canonical.managerPassword
  return `spa-${canonicalId || branchId}`
}

/** MK mặc định NV = tên hồ sơ hiện tại + tên chi nhánh (không dấu, không khoảng trắng). */
export function computeEmployeeProfileDefaultPassword(employeeName, branchId) {
  const namePart = String(employeeName ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
  const branchPart = String(getPasswordBranchName(branchId) ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
  return namePart + branchPart
}

export const DEFAULT_BRANCH_PASSWORDS = Object.fromEntries(
  CANONICAL_BRANCHES.map((branch) => [branch.id, branch.managerPassword]),
)

function buildDefaultCredentials() {
  return {
    admin: DEFAULT_ADMIN_PASSWORD,
    branches: {},
    branchPasswordMeta: {},
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

  for (const [branchId, password] of Object.entries(data.branches ?? {})) {
    branches[branchId] = await normalizeStoredPassword(password)
  }

  for (const [employeeId, entry] of Object.entries(data.employees ?? {})) {
    if (!entry?.password) continue
    employees[employeeId] = {
      branchId: entry.branchId ?? '',
      name: entry.name ?? '',
      loginUsername: entry.loginUsername ?? '',
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
      branches: data.branches ?? {},
      branchPasswordMeta: data.branchPasswordMeta ?? {},
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
  const stored = {
    ...normalized,
    branchPasswordMeta: current.branchPasswordMeta ?? {},
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  return stored
}

export function saveCredentials(credentials, { skipRemoteSync = false } = {}) {
  const current = loadCredentials()
  const normalized = {
    admin: credentials.admin ?? current.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: 'branches' in credentials
      ? (credentials.branches ?? {})
      : { ...current.branches, ...(credentials.branches ?? {}) },
    branchPasswordMeta: 'branchPasswordMeta' in credentials
      ? (credentials.branchPasswordMeta ?? {})
      : {
        ...(current.branchPasswordMeta ?? {}),
        ...(credentials.branchPasswordMeta ?? {}),
      },
    employees: 'employees' in credentials
      ? (credentials.employees ?? {})
      : { ...current.employees, ...(credentials.employees ?? {}) },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) {
    pushCredentialsToSupabase(normalized).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
    })
  }
  return normalized
}

export async function saveCredentialsAndSync(credentials, { skipRemoteSync = false } = {}) {
  const saved = saveCredentials(credentials, { skipRemoteSync: true })
  if (!skipRemoteSync) {
    await pushCredentialsToSupabase(saved)
  }
  return saved
}

export async function saveCredentialsHashed(credentials, { skipRemoteSync = false } = {}) {
  const current = loadCredentials()
  const normalized = await normalizeCredentials({
    admin: credentials.admin ?? current.admin ?? DEFAULT_ADMIN_PASSWORD,
    branches: { ...current.branches, ...(credentials.branches ?? {}) },
    employees: { ...current.employees, ...(credentials.employees ?? {}) },
  })
  const stored = {
    ...normalized,
    branchPasswordMeta: {
      ...(current.branchPasswordMeta ?? {}),
      ...(credentials.branchPasswordMeta ?? {}),
    },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  if (!skipRemoteSync) {
    pushCredentialsToSupabase(stored).catch((error) => {
      console.warn('[Supabase] Không thể đồng bộ tài khoản đăng nhập:', error?.message)
    })
  }
  return stored
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
 * Sync / repair chỉ cập nhật name + branchId — KHÔNG đổi loginUsername sau khi đã cấp.
 */
function buildEmployeeCredentialMeta(employee, existing = null) {
  const loginUsername = existing?.loginUsername
    || getStoredEmployeeLoginUsername(employee.id)
    || ''
  return {
    branchId: employee.branchId ?? existing?.branchId ?? '',
    name: employee.name ?? existing?.name ?? '',
    loginUsername,
    password: existing?.password,
    passwordUpdatedAt: existing?.passwordUpdatedAt ?? null,
    customPassword: Boolean(existing?.customPassword),
  }
}

function rememberEmployeeLoginUsername() {
  /* Login V2: username chỉ lưu trong employees[id].loginUsername */
}

async function resetEmployeeCredentialToDefault(credentials, employee) {
  const { usernames } = assignEmployeeUsernames(
    loadEmployees().filter(isEmployeeLoginEligible),
  )
  const loginUsername = credentials.employees?.[employee.id]?.loginUsername
    || usernames.get(employee.id)
    || allocateEmployeeLoginUsername(employee.name, employee.id)

  const plain = computeEmployeeProfileDefaultPassword(employee.name, employee.branchId)
  credentials.employees = {
    ...credentials.employees,
    [employee.id]: {
      branchId: employee.branchId ?? '',
      name: employee.name ?? '',
      loginUsername,
      password: await hashPassword(plain.toLowerCase()),
      passwordUpdatedAt: null,
      customPassword: false,
    },
  }
  return { employeeId: employee.id, username: loginUsername, defaultPassword: plain }
}

async function provisionEmployeeCredentialIfMissing(credentials, employee) {
  const current = credentials.employees?.[employee.id]
  const plainPassword = computeEmployeeProfileDefaultPassword(employee.name, employee.branchId)
  const nextHash = await hashPassword(plainPassword.toLowerCase())
  const { usernames } = assignEmployeeUsernames(
    loadEmployees().filter(isEmployeeLoginEligible),
  )
  const loginUsername = current?.loginUsername
    || usernames.get(employee.id)
    || allocateEmployeeLoginUsername(employee.name, employee.id)

  // Hồ sơ hiện tại là SSOT: MK mặc định luôn theo tên + chi nhánh hiện tại.
  if (current?.password && current.customPassword) {
    if (current.branchId !== employee.branchId || current.name !== employee.name) {
      credentials.employees[employee.id] = {
        ...current,
        branchId: employee.branchId ?? current.branchId,
        name: employee.name ?? current.name,
        loginUsername: current.loginUsername || loginUsername,
      }
      return true
    }
    return false
  }

  const next = {
    branchId: employee.branchId ?? '',
    name: employee.name ?? '',
    loginUsername,
    password: nextHash,
    passwordUpdatedAt: null,
    customPassword: false,
  }
  const unchanged = current?.password === next.password
    && current?.branchId === next.branchId
    && current?.name === next.name
    && current?.customPassword === false
  if (unchanged) return false

  credentials.employees[employee.id] = {
    ...current,
    ...next,
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
    // Chỉ cache local — không push lên Supabase (tránh ghi đè hash server bằng cache cũ).
    saveCredentials(credentials, { skipRemoteSync: true })
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
    // Chỉ cache local — không push lên Supabase (tránh ghi đè hash server bằng cache cũ).
    saveCredentials(credentials, { skipRemoteSync: true })
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
  // Chỉ cache local — không push full credentials (tránh ghi đè app_credentials lúc đăng nhập).
  return saveCredentials(credentials, { skipRemoteSync: true })
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
  credentials.branchPasswordMeta = {
    ...(credentials.branchPasswordMeta ?? {}),
    [branchId]: {
      passwordUpdatedAt: new Date().toISOString(),
      customPassword: true,
    },
  }
  return saveCredentialsAndSync(credentials)
}

export async function syncMissingBranchCredentials() {
  const branches = loadBranches()
  const credentials = await ensureCredentialsHashed()
  let changed = false

  for (const branch of branches) {
    if (!credentials.branches[branch.id]) {
      credentials.branches[branch.id] = await hashPassword(
        getBranchManagerCanonicalPassword(branch.id),
      )
      changed = true
    }
  }

  if (changed) {
    // Chỉ cache local — không push lên Supabase (tránh ghi đè hash server bằng cache cũ).
    saveCredentials(credentials, { skipRemoteSync: true })
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
  const entry = credentials.employees?.[employeeId]
  if (!entry) return credentials

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
      loginUsername: entry?.loginUsername ?? getStoredEmployeeLoginUsername(employeeId) ?? '',
      password: await hashPassword(passwordToStore),
      passwordUpdatedAt: new Date().toISOString(),
      customPassword: true,
    },
  }
  try {
    await saveCredentialsAndSync(credentials)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu' }
  }
}

/** Admin reset về mật khẩu mặc định — giữ username đã cấp, bắt buộc đổi MK lần đăng nhập tiếp theo. */
export async function resetEmployeePasswordToDefault(employeeId) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu nhân viên.' }
  }
  if (!canMutateEmployeeAccountOnLive(employeeId)) {
    return { success: false, error: liveMutationBlockedMessage('Reset mật khẩu') }
  }
  const employee = loadEmployees().find((item) => item.id === employeeId)
  if (!employee) {
    return { success: false, error: 'Không tìm thấy nhân viên.' }
  }
  const credentials = await ensureCredentialsHashed()
  try {
    const result = await resetEmployeeCredentialToDefault(credentials, employee)
    await saveCredentialsAndSync(credentials)
    return { success: true, ...result }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu mặc định' }
  }
}

export async function resetEmployeePasswordsBulk(employeeIds = []) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu hàng loạt.' }
  }
  const ids = [...new Set((employeeIds ?? []).filter(Boolean))]
  if (!ids.length) {
    return { success: false, error: 'Chưa chọn nhân viên nào.' }
  }

  const credentials = await ensureCredentialsHashed()
  const succeeded = []
  const failed = []
  const skipped = []

  for (const employeeId of ids) {
    if (employeeId === 'admin') {
      skipped.push({ employeeId, reason: 'Không reset Admin' })
      continue
    }
    if (!canMutateEmployeeAccountOnLive(employeeId)) {
      skipped.push({ employeeId, reason: 'Không phải tài khoản UAT — bỏ qua trên Production' })
      continue
    }
    const employee = loadEmployees().find((item) => item.id === employeeId)
    if (!employee || !isEmployeeLoginEligible(employee)) {
      skipped.push({ employeeId, reason: 'Không tìm thấy hoặc không đủ điều kiện đăng nhập' })
      continue
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await resetEmployeeCredentialToDefault(credentials, employee)
      succeeded.push(result)
    } catch (error) {
      failed.push({ employeeId, reason: error?.message ?? 'Lỗi không xác định' })
    }
  }

  if (!succeeded.length) {
    return {
      success: false,
      error: 'Không có tài khoản hợp lệ được reset.',
      succeeded: succeeded.length,
      failed: failed.length,
      skipped: skipped.length,
      details: { succeeded, failed, skipped },
    }
  }

  try {
    await saveCredentialsAndSync(credentials)
    return {
      success: true,
      count: succeeded.length,
      succeeded: succeeded.length,
      failed: failed.length,
      skipped: skipped.length,
      results: succeeded,
      details: { succeeded, failed, skipped },
    }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu mặc định hàng loạt' }
  }
}

export async function resetEmployeePasswordsByBranch(branchId) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu theo chi nhánh.' }
  }
  if (!canUseBranchWideBulkReset()) {
    return {
      success: false,
      error: 'Không được reset theo chi nhánh trên Preview/Production. Chỉ chọn tài khoản UAT.',
    }
  }
  if (!branchId) {
    return { success: false, error: 'Chưa chọn chi nhánh.' }
  }

  const employeeIds = loadEmployees()
    .filter((employee) => isEmployeeLoginEligible(employee) && employee.branchId === branchId)
    .map((employee) => employee.id)

  const credentials = await ensureCredentialsHashed()
  const employeeResults = []
  for (const employeeId of employeeIds) {
    const employee = loadEmployees().find((item) => item.id === employeeId)
    // eslint-disable-next-line no-await-in-loop
    employeeResults.push(await resetEmployeeCredentialToDefault(credentials, employee))
  }

  const branchPlain = getBranchManagerCanonicalPassword(branchId)
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(branchPlain),
  }
  credentials.branchPasswordMeta = {
    ...(credentials.branchPasswordMeta ?? {}),
    [branchId]: { passwordUpdatedAt: null, customPassword: false },
  }

  try {
    await saveCredentialsAndSync(credentials)
    return {
      success: true,
      branchId,
      employeeCount: employeeResults.length,
      branchManager: {
        username: computeBranchManagerLoginUsername(branchId),
        defaultPassword: branchPlain,
      },
      results: employeeResults,
    }
  } catch {
    return { success: false, error: 'Không thể reset mật khẩu theo chi nhánh' }
  }
}

export async function resetAllLoginPasswordsToDefault() {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu toàn hệ thống.' }
  }
  if (!canUseSystemWideBulkReset()) {
    return {
      success: false,
      error: 'Không được reset toàn hệ thống trên Preview/Production. Chỉ chọn tài khoản UAT.',
    }
  }

  const credentials = await ensureCredentialsHashed()
  const employeeResults = []
  for (const employee of loadEmployees().filter(isEmployeeLoginEligible)) {
    // eslint-disable-next-line no-await-in-loop
    employeeResults.push(await resetEmployeeCredentialToDefault(credentials, employee))
  }

  const branchResults = []
  for (const branch of loadBranches()) {
    const plain = getBranchManagerCanonicalPassword(branch.id)
    credentials.branches = {
      ...credentials.branches,
      [branch.id]: await hashPassword(plain),
    }
    credentials.branchPasswordMeta = {
      ...(credentials.branchPasswordMeta ?? {}),
      [branch.id]: { passwordUpdatedAt: null, customPassword: false },
    }
    branchResults.push({
      branchId: branch.id,
      username: computeBranchManagerLoginUsername(branch.id),
      defaultPassword: plain,
    })
  }

  try {
    await saveCredentialsAndSync(credentials)
    return {
      success: true,
      employeeCount: employeeResults.length,
      branchCount: branchResults.length,
      employeeResults,
      branchResults,
    }
  } catch {
    return { success: false, error: 'Không thể reset mật khẩu toàn hệ thống' }
  }
}

/** Admin đổi username nhân viên — không tự đổi theo tên trong Hồ sơ. */
export async function updateEmployeeLoginUsername(employeeId, nextUsername) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được đổi username.' }
  }
  if (!canMutateEmployeeAccountOnLive(employeeId)) {
    return { success: false, error: liveMutationBlockedMessage('Đổi username') }
  }

  const normalized = String(nextUsername ?? '').trim().toLowerCase()
  if (!normalized || normalized.length < 2) {
    return { success: false, error: 'Username phải có ít nhất 2 ký tự.' }
  }
  if (!/^[a-z0-9]+$/.test(normalized)) {
    return { success: false, error: 'Username chỉ gồm chữ thường và số, không dấu.' }
  }
  if (!isEmployeeLoginUsernameAvailable(normalized, employeeId)) {
    return { success: false, error: 'Username đã được sử dụng hoặc trùng tài khoản hệ thống.' }
  }

  const employee = loadEmployees().find((item) => item.id === employeeId)
  if (!employee) {
    return { success: false, error: 'Không tìm thấy nhân viên.' }
  }

  const credentials = await ensureCredentialsHashed()
  const entry = credentials.employees?.[employeeId]
  credentials.employees = {
    ...credentials.employees,
    [employeeId]: {
      branchId: entry?.branchId ?? employee.branchId ?? '',
      name: entry?.name ?? employee.name ?? '',
      loginUsername: normalized,
      password: entry?.password ?? '',
      passwordUpdatedAt: entry?.passwordUpdatedAt ?? null,
      customPassword: Boolean(entry?.customPassword),
    },
  }

  try {
    await saveCredentialsAndSync(credentials)
    return { success: true, username: normalized }
  } catch {
    return { success: false, error: 'Không thể lưu username mới' }
  }
}

export async function resetBranchPasswordToDefault(branchId) {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được reset mật khẩu chi nhánh.' }
  }
  const credentials = await ensureCredentialsHashed()
  const plain = getBranchManagerCanonicalPassword(branchId)
  credentials.branches = {
    ...credentials.branches,
    [branchId]: await hashPassword(plain),
  }
  credentials.branchPasswordMeta = {
    ...(credentials.branchPasswordMeta ?? {}),
    [branchId]: { passwordUpdatedAt: null, customPassword: false },
  }
  try {
    await saveCredentialsAndSync(credentials)
    return {
      success: true,
      defaultPassword: plain,
      username: computeBranchManagerLoginUsername(branchId),
    }
  } catch {
    return { success: false, error: 'Không thể lưu mật khẩu mặc định' }
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
  if (!currentOk) {
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
    await saveCredentialsAndSync(credentials)
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
    ...loadBranches().map((branch) => {
      const meta = credentials.branchPasswordMeta?.[branch.id] ?? {}
      return {
        id: branch.id,
        accountKey: branch.id,
        label: `QL ${branch.name}`,
        username: branchManagerUsername(branch.id),
        branchId: branch.id,
        branchName: branch.name,
        role: 'Quản lý chi nhánh',
        status: metadata[branch.id]?.locked ? 'locked' : 'active',
        lastLogin: formatLastLogin(metadata[branch.id]?.lastLogin),
        passwordUpdatedAt: meta.passwordUpdatedAt ?? null,
        hasChangedPassword: Boolean(meta.customPassword),
        isBranchManager: true,
      }
    }),
    ...loadEmployees().filter(isEmployeeLoginEligible).map((employee) => {
      const accountKey = `employee:${employee.id}`
      const entry = credentials.employees?.[employee.id]
      return {
        id: employee.id,
        accountKey,
        label: employee.name || employee.id,
        username: getEmployeeLoginUsername(employee),
        branchId: employee.branchId,
        branchName: getBranchName(employee.branchId),
        role: 'Nhân viên',
        status: metadata[accountKey]?.locked ? 'locked' : 'active',
        lastLogin: formatLastLogin(metadata[accountKey]?.lastLogin),
        passwordUpdatedAt: entry?.passwordUpdatedAt ?? null,
        hasChangedPassword: Boolean(entry?.customPassword),
        isEmployee: true,
      }
    }),
  ]
}

function mergeBranchCredentials(local, remote) {
  const branches = { ...(local.branches ?? {}) }
  const branchPasswordMeta = { ...(local.branchPasswordMeta ?? {}) }

  for (const [branchId, remotePassword] of Object.entries(remote.branches ?? {})) {
    if (!remotePassword) continue
    const localPassword = branches[branchId]
    const localMeta = branchPasswordMeta[branchId] ?? {}
    const remoteMeta = remote.branchPasswordMeta?.[branchId] ?? {}

    if (!localPassword) {
      branches[branchId] = remotePassword
      if (remoteMeta.passwordUpdatedAt || remoteMeta.customPassword) {
        branchPasswordMeta[branchId] = {
          passwordUpdatedAt: remoteMeta.passwordUpdatedAt ?? null,
          customPassword: Boolean(remoteMeta.customPassword),
        }
      }
      continue
    }

    const localAt = Date.parse(localMeta.passwordUpdatedAt ?? 0) || 0
    const remoteAt = Date.parse(remoteMeta.passwordUpdatedAt ?? 0) || 0
    // Hòa timestamp → ưu tiên remote (SSOT sau sync/reset admin).
    const preferRemotePassword = remoteAt >= localAt

    if (preferRemotePassword) {
      branches[branchId] = remotePassword
      branchPasswordMeta[branchId] = {
        passwordUpdatedAt: remoteMeta.passwordUpdatedAt ?? localMeta.passwordUpdatedAt ?? null,
        customPassword: Boolean(remoteMeta.customPassword),
      }
    } else {
      branches[branchId] = localPassword
      branchPasswordMeta[branchId] = {
        passwordUpdatedAt: localMeta.passwordUpdatedAt ?? remoteMeta.passwordUpdatedAt ?? null,
        customPassword: Boolean(localMeta.customPassword),
      }
    }
  }

  return { branches, branchPasswordMeta }
}

/**
 * Sinh lại toàn bộ tài khoản QL chi nhánh + nhân viên từ Hồ sơ hiện tại.
 * Admin giữ nguyên mật khẩu. Không legacy, không fallback.
 */
export async function regenerateAllAccountsFromProfiles() {
  if (!isSessionAdmin()) {
    return { success: false, error: 'Chỉ Admin mới được cập nhật toàn bộ tài khoản.' }
  }

  if (isLiveSupabaseEnvironment() && !isSupabaseConfigured) {
    return {
      success: false,
      error: 'Supabase chưa cấu hình — không thể ghi app_credentials lên server.',
    }
  }

  const current = await ensureCredentialsHashed()
  const built = await buildRegeneratedCredentials(current.admin)

  try {
    let remotePayload = built.credentials
    if (isSupabaseConfigured) {
      remotePayload = await persistCredentialsPayload(built.credentials)
    }
    saveCredentials(
      {
        admin: remotePayload.admin,
        branches: remotePayload.branches,
        branchPasswordMeta: remotePayload.branchPasswordMeta,
        employees: remotePayload.employees,
      },
      { skipRemoteSync: true },
    )
  } catch (error) {
    return {
      success: false,
      error: error?.message ?? 'Không thể ghi app_credentials lên Supabase',
      exportRows: built.exportRows,
      duplicateResolutions: built.duplicateResolutions,
      failures: built.failures,
      summary: built.summary,
    }
  }

  return {
    success: true,
    exportRows: built.exportRows,
    duplicateResolutions: built.duplicateResolutions,
    failures: built.failures,
    summary: built.summary,
  }
}

/** pullAll credentials: gộp name/branch; password chỉ lấy từ payload đã lưu (Change/Reset), không regenerate. */
export function mergeCredentialsPreservingPasswords(localCredentials, remoteCredentials) {
  const local = localCredentials ?? buildDefaultCredentials()
  const remote = remoteCredentials ?? {}
  const employees = { ...(local.employees ?? {}) }
  const { branches, branchPasswordMeta } = mergeBranchCredentials(local, remote)

  for (const [employeeId, remoteEntry] of Object.entries(remote.employees ?? {})) {
    if (!remoteEntry?.password) continue
    const localEntry = employees[employeeId]
    if (!localEntry?.password) {
      employees[employeeId] = {
        branchId: remoteEntry.branchId ?? '',
        name: remoteEntry.name ?? '',
        loginUsername: remoteEntry.loginUsername ?? '',
        password: remoteEntry.password,
        passwordUpdatedAt: remoteEntry.passwordUpdatedAt ?? null,
        customPassword: Boolean(remoteEntry.customPassword),
      }
      continue
    }

    const localAt = Date.parse(localEntry.passwordUpdatedAt ?? 0) || 0
    const remoteAt = Date.parse(remoteEntry.passwordUpdatedAt ?? 0) || 0
    // Hòa timestamp → ưu tiên remote (SSOT sau sync/reset theo hồ sơ).
    const preferRemotePassword = remoteAt >= localAt

    employees[employeeId] = {
      branchId: remoteEntry.branchId || localEntry.branchId || '',
      name: remoteEntry.name || localEntry.name || '',
      loginUsername: remoteEntry.loginUsername || localEntry.loginUsername || '',
      password: preferRemotePassword ? remoteEntry.password : localEntry.password,
      passwordUpdatedAt: preferRemotePassword
        ? (remoteEntry.passwordUpdatedAt ?? localEntry.passwordUpdatedAt ?? null)
        : (localEntry.passwordUpdatedAt ?? remoteEntry.passwordUpdatedAt ?? null),
      customPassword: Boolean(
        preferRemotePassword ? remoteEntry.customPassword : localEntry.customPassword,
      ),
    }
  }

  return {
    admin: remote.admin ?? local.admin,
    branches,
    branchPasswordMeta,
    employees,
  }
}
