import { isSupabaseConfigured } from '../lib/supabaseClient'

/** Prefix ID nhân viên UAT — chỉ các tài khoản này được thao tác trên Preview/Production. */
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

/** Reset / khóa trên live — chỉ tài khoản UAT. */
export function canMutateEmployeeAccountOnLive(employeeId) {
  if (!isLiveSupabaseEnvironment()) return true
  return isUatEmployeeId(employeeId)
}

export function canUseBranchWideBulkReset() {
  return !isLiveSupabaseEnvironment()
}

export function canUseSystemWideBulkReset() {
  return !isLiveSupabaseEnvironment()
}

export function liveMutationBlockedMessage(action = 'thao tác này') {
  return `${action} chỉ được phép với tài khoản UAT (${UAT_LOGIN_V2_PREFIX}*) trên Preview/Production.`
}
