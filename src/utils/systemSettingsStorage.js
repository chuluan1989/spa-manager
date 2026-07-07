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
  note: '',
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
    systemName: settings.systemName?.trim() ?? DEFAULT_SYSTEM_SETTINGS.systemName,
    brandName: settings.brandName?.trim() ?? DEFAULT_SYSTEM_SETTINGS.brandName,
    hotline: settings.hotline?.trim() ?? '',
    note: settings.note?.trim() ?? '',
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  if (!skipRemoteSync) pushSettingsToSupabase(normalized)
  return normalized
}
