import { fetchSettings, upsertSettings } from './settingsRepository'
import { loadSystemSettings, saveSystemSettings } from '../utils/systemSettingsStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function emptyState() {
  return {
    dayReviews: {},
    overrides: {},
  }
}

function readLocalState() {
  const settings = loadSystemSettings()
  return {
    dayReviews: settings.payroll1DayReviews && typeof settings.payroll1DayReviews === 'object'
      ? settings.payroll1DayReviews
      : {},
    overrides: settings.payroll1Overrides && typeof settings.payroll1Overrides === 'object'
      ? settings.payroll1Overrides
      : {},
  }
}

function writeLocalState(state) {
  const settings = loadSystemSettings()
  saveSystemSettings({
    ...settings,
    payroll1DayReviews: state.dayReviews,
    payroll1Overrides: state.overrides,
  }, { skipRemoteSync: true })
}

async function readRemoteState() {
  if (!isSupabaseConfigured) return readLocalState()
  const remote = await fetchSettings()
  if (!remote || typeof remote !== 'object') return readLocalState()
  return {
    dayReviews: remote.payroll1DayReviews && typeof remote.payroll1DayReviews === 'object'
      ? remote.payroll1DayReviews
      : {},
    overrides: remote.payroll1Overrides && typeof remote.payroll1Overrides === 'object'
      ? remote.payroll1Overrides
      : {},
  }
}

async function writeRemoteState(state) {
  if (!isSupabaseConfigured) {
    writeLocalState(state)
    return state
  }
  const remote = (await fetchSettings()) || {}
  const next = {
    ...remote,
    payroll1DayReviews: state.dayReviews,
    payroll1Overrides: state.overrides,
  }
  await upsertSettings(next)
  writeLocalState(state)
  return state
}

export function normalizeDayReview(row) {
  if (!row) return null
  return {
    id: row.id ?? '',
    employeeId: row.employeeId ?? '',
    branchId: row.branchId ?? '',
    dayDate: row.dayDate ?? '',
    reviewStatus: row.reviewStatus ?? '',
    updatedAt: row.updatedAt ?? '',
    updatedBy: row.updatedBy ?? '',
  }
}

export function normalizeOverride(row) {
  if (!row) return null
  return {
    employeeId: row.employeeId ?? '',
    branchId: row.branchId ?? '',
    manualUnlock: Boolean(row.manualUnlock),
    adminConfirmed: Boolean(row.adminConfirmed),
    updatedAt: row.updatedAt ?? '',
    updatedBy: row.updatedBy ?? '',
  }
}

export function buildDayReviewId(employeeId, dayDate) {
  return `${employeeId}|${dayDate}`
}

export async function fetchPayroll1DayReviews({ employeeId = '', branchId = '', fromDate = '', toDate = '' } = {}) {
  const state = await readRemoteState()
  return Object.values(state.dayReviews)
    .map(normalizeDayReview)
    .filter(Boolean)
    .filter((row) => {
      if (employeeId && row.employeeId !== employeeId) return false
      if (branchId && row.branchId !== branchId) return false
      if (fromDate && row.dayDate < fromDate) return false
      if (toDate && row.dayDate > toDate) return false
      return true
    })
}

export async function upsertPayroll1DayReview(review) {
  const state = await readRemoteState()
  const id = review.id || buildDayReviewId(review.employeeId, review.dayDate)
  const nextReview = normalizeDayReview({
    ...review,
    id,
    updatedAt: new Date().toISOString(),
  })
  const next = {
    ...state,
    dayReviews: {
      ...state.dayReviews,
      [id]: nextReview,
    },
  }
  await writeRemoteState(next)
  return nextReview
}

export async function fetchPayroll1Overrides({ employeeId = '', branchId = '' } = {}) {
  const state = await readRemoteState()
  return Object.values(state.overrides)
    .map(normalizeOverride)
    .filter(Boolean)
    .filter((row) => {
      if (employeeId && row.employeeId !== employeeId) return false
      if (branchId && row.branchId !== branchId) return false
      return true
    })
}

export async function upsertPayroll1Override(override) {
  const state = await readRemoteState()
  const nextOverride = normalizeOverride({
    ...override,
    updatedAt: new Date().toISOString(),
  })
  const next = {
    ...state,
    overrides: {
      ...state.overrides,
      [override.employeeId]: nextOverride,
    },
  }
  await writeRemoteState(next)
  return nextOverride
}

export { emptyState }
