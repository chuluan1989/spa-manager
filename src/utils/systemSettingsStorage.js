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
  payroll1Enabled: false,
  payroll1PeriodStart: '2026-07-01',
  payroll1LockDate: '2026-07-18',
  payroll1DayReviews: {},
  payroll1Overrides: {},
  autoAbsentEnabled: false,
  autoAbsentCloseTime: '00:05',
  /** Rỗng = chưa cấu hình → không tự chạy auto-absent. */
  autoAbsentApplyFrom: '',
  autoAbsentPenaltyAmount: 100000,
  autoAbsentWorkDays: [1, 2, 3, 4, 5, 6],
  autoAbsentHolidays: [],
  autoAbsentExemptEmployeeIds: [],
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
  const current = loadSystemSettings()
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
    payroll1Enabled: settings.payroll1Enabled === true,
    payroll1PeriodStart: settings.payroll1PeriodStart?.trim?.()
      || DEFAULT_SYSTEM_SETTINGS.payroll1PeriodStart,
    payroll1LockDate: settings.payroll1LockDate?.trim?.()
      || DEFAULT_SYSTEM_SETTINGS.payroll1LockDate,
    // Giữ trạng thái kỳ lương 1 (Supabase SSOT) khi lưu cài đặt khác.
    payroll1DayReviews: settings.payroll1DayReviews ?? current.payroll1DayReviews ?? {},
    payroll1Overrides: settings.payroll1Overrides ?? current.payroll1Overrides ?? {},
    autoAbsentEnabled: settings.autoAbsentEnabled === true,
    autoAbsentCloseTime: settings.autoAbsentCloseTime?.trim?.()
      || DEFAULT_SYSTEM_SETTINGS.autoAbsentCloseTime,
    autoAbsentApplyFrom: settings.autoAbsentApplyFrom?.trim?.() || '',
    autoAbsentPenaltyAmount: Math.max(
      0,
      Number.parseInt(String(settings.autoAbsentPenaltyAmount ?? DEFAULT_SYSTEM_SETTINGS.autoAbsentPenaltyAmount), 10)
        || DEFAULT_SYSTEM_SETTINGS.autoAbsentPenaltyAmount,
    ),
    autoAbsentWorkDays: Array.isArray(settings.autoAbsentWorkDays)
      ? settings.autoAbsentWorkDays.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
      : DEFAULT_SYSTEM_SETTINGS.autoAbsentWorkDays,
    autoAbsentHolidays: Array.isArray(settings.autoAbsentHolidays)
      ? settings.autoAbsentHolidays.map((d) => String(d).trim()).filter(Boolean)
      : [],
    autoAbsentExemptEmployeeIds: Array.isArray(settings.autoAbsentExemptEmployeeIds)
      ? settings.autoAbsentExemptEmployeeIds.map((id) => String(id).trim()).filter(Boolean)
      : [],
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
