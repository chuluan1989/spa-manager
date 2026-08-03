import { isSupabaseConfigured } from '../lib/supabaseClient'

/** Chặn Admin sửa bảng giá/% khi offline hoặc chưa cấu hình Supabase. */
export function getServicePricingEditBlockReason() {
  if (!isSupabaseConfigured) {
    return 'Supabase chưa cấu hình. Không thể chỉnh bảng giá.'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Không thể chỉnh bảng giá khi đang offline.'
  }
  return ''
}

export function assertCanEditServicePricing() {
  const reason = getServicePricingEditBlockReason()
  if (reason) throw new Error(reason)
}

export function isServicePricingEditable() {
  return !getServicePricingEditBlockReason()
}
