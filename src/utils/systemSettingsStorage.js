import { isSupabaseConfigured } from '../lib/supabaseClient'
import { upsertSettings } from '../repositories/settingsRepository'

const STORAGE_KEY = 'spa-manager-system-settings'

function pushSettingsToSupabase(settings) {
  if (!isSupabaseConfigured) return
  upsertSettings(settings).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ cài đặt hệ thống:', error?.message)
  })
}

export const DEFAULT_SYSTEM_SETTINGS = {
  systemName: 'Spa Manager',
  brandName: 'Sống Khoẻ Spa',
  hotline: '',
  slogan: '',
  primaryColor: '#D4AF37',
  logoUrl: '',
  allowDiscount: true,
  allowTips: true,
  allowEmployeeEditOwnInvoice: true,
  allowManagerEditBranchInvoice: true,
  onlyAdminDeleteInvoice: true,
  requireCompleteProfileBeforeTour: true,
  employeeProfileDeadline: '2026-07-10',
  realtimeEnabled: true,
  warnLegacyLocalStorage: true,
  vipCustomerThreshold: 10000000,
}

export function loadSystemSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SYSTEM_SETTINGS))
      return { ...DEFAULT_SYSTEM_SETTINGS }
    }
    const data = JSON.parse(raw)
    return { ...DEFAULT_SYSTEM_SETTINGS, ...data }
  } catch {
    return { ...DEFAULT_SYSTEM_SETTINGS }
  }
}

export function saveSystemSettings(settings, { skipRemoteSync = false } = {}) {
  const normalized = {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...settings,
    systemName: settings.systemName?.trim() ?? DEFAULT_SYSTEM_SETTINGS.systemName,
    brandName: settings.brandName?.trim() ?? DEFAULT_SYSTEM_SETTINGS.brandName,
    hotline: settings.hotline?.trim() ?? '',
    slogan: settings.slogan?.trim() ?? '',
    primaryColor: settings.primaryColor?.trim() || DEFAULT_SYSTEM_SETTINGS.primaryColor,
    logoUrl: settings.logoUrl ?? '',
    allowDiscount: Boolean(settings.allowDiscount),
    allowTips: Boolean(settings.allowTips),
    allowEmployeeEditOwnInvoice: Boolean(settings.allowEmployeeEditOwnInvoice),
    allowManagerEditBranchInvoice: Boolean(settings.allowManagerEditBranchInvoice),
    onlyAdminDeleteInvoice: Boolean(settings.onlyAdminDeleteInvoice),
    requireCompleteProfileBeforeTour: Boolean(settings.requireCompleteProfileBeforeTour),
    employeeProfileDeadline: settings.employeeProfileDeadline?.trim?.()
      || DEFAULT_SYSTEM_SETTINGS.employeeProfileDeadline,
    realtimeEnabled: Boolean(settings.realtimeEnabled),
    warnLegacyLocalStorage: Boolean(settings.warnLegacyLocalStorage),
    vipCustomerThreshold: Math.max(
      0,
      Number.parseInt(String(settings.vipCustomerThreshold ?? DEFAULT_SYSTEM_SETTINGS.vipCustomerThreshold), 10)
        || DEFAULT_SYSTEM_SETTINGS.vipCustomerThreshold,
    ),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushSettingsToSupabase(normalized)
  return normalized
}

export function toggleSystemSetting(key, value) {
  const settings = loadSystemSettings()
  settings[key] = value
  return saveSystemSettings(settings)
}
