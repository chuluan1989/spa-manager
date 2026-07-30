import { isSupabaseConfigured } from '../lib/supabaseClient'
import { isSessionAdmin } from './storageAccess'

/** Prefix ID nhân viên UAT — dùng cho tài khoản thử nghiệm / evidence. */
export const UAT_LOGIN_V2_PREFIX = 'uat-login-v2-'

export const UAT_LOGIN_V2_EMPLOYEE_IDS = {
  THUY_AN_1: `${UAT_LOGIN_V2_PREFIX}thuy-an-1`,
  THUY_AN_2: `${UAT_LOGIN_V2_PREFIX}thuy-an-2`,
}

let forceLiveSupabaseMode = false

/** Script UAT Production gọi khi module supabase load trước env. */
export function setForceLiveSupabaseMode(enabled = true) {
  forceLiveSupabaseMode = Boolean(enabled)
}

/** Preview/Production live = Supabase đã cấu hình (dữ liệu thật). */
export function isLiveSupabaseEnvironment() {
  return forceLiveSupabaseMode || isSupabaseConfigured
}

export function isUatEmployeeId(employeeId) {
  return String(employeeId ?? '').startsWith(UAT_LOGIN_V2_PREFIX)
}

export function isUatEmployeeAccount(account) {
  return Boolean(account?.isEmployee && isUatEmployeeId(account.id))
}

/**
 * Admin được phép quản lý mọi tài khoản NV thật trên Preview/Production.
 * Non-admin trên live vẫn chỉ thao tác UAT (nếu có đường gọi khác).
 */
export function canMutateEmployeeAccountOnLive(_employeeId) {
  if (isSessionAdmin()) return true
  if (!isLiveSupabaseEnvironment()) return true
  return isUatEmployeeId(_employeeId)
}

export function canUseBranchWideBulkReset() {
  if (isSessionAdmin()) return true
  return !isLiveSupabaseEnvironment()
}

export function canUseSystemWideBulkReset() {
  if (isSessionAdmin()) return true
  return !isLiveSupabaseEnvironment()
}

export function liveMutationBlockedMessage(action = 'thao tác này') {
  return `${action} chỉ được phép với Admin hoặc tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*).`
}
