import { isSupabaseConfigured } from '../lib/supabaseClient'

const PROFILE_KEY = 'spa-manager-customer-profiles'
const CARE_KEY = 'spa-manager-customer-care'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadCustomerProfiles() {
  return readJson(PROFILE_KEY, {})
}

export function saveCustomerProfiles(profiles) {
  writeJson(PROFILE_KEY, profiles)
}

export function getCustomerProfileOverride(customerKey) {
  const profiles = loadCustomerProfiles()
  return profiles[customerKey] ?? {}
}

export function saveCustomerProfileOverride(customerKey, data) {
  const profiles = loadCustomerProfiles()
  profiles[customerKey] = {
    ...(profiles[customerKey] ?? {}),
    ...data,
    updatedAt: new Date().toISOString(),
  }
  saveCustomerProfiles(profiles)
  return profiles[customerKey]
}

export function loadCustomerCareLogs() {
  return readJson(CARE_KEY, [])
}

export function saveCustomerCareLogs(logs) {
  writeJson(CARE_KEY, logs)
}

export function getCareLogsForCustomer(customerKey) {
  return loadCustomerCareLogs()
    .filter((log) => log.customerKey === customerKey)
    .sort((a, b) => (b.careDate ?? '').localeCompare(a.careDate ?? ''))
}

export function addCustomerCareLog(entry) {
  const logs = loadCustomerCareLogs()
  const log = {
    id: `care-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    customerKey: entry.customerKey,
    careDate: entry.careDate ?? new Date().toISOString().slice(0, 10),
    caretaker: entry.caretaker ?? '',
    content: entry.content?.trim?.() ?? '',
    result: entry.result?.trim?.() ?? '',
    followUpDate: entry.followUpDate ?? '',
    createdAt: new Date().toISOString(),
  }
  logs.unshift(log)
  saveCustomerCareLogs(logs)
  if (isSupabaseConfigured) {
    // Optional remote sync hook — localStorage remains source for offline CRM care notes.
  }
  return log
}

export function loadCustomerProfileMap() {
  return loadCustomerProfiles()
}
