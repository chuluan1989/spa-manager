/** Debounce + visibility helpers for live payroll/KPI/attendance refetch. */

export const LIVE_RELOAD_DEBOUNCE_MS = 400

export function isDocumentVisible() {
  if (typeof document === 'undefined') return true
  return document.visibilityState !== 'hidden'
}

export function changedEntitiesInclude(detail, names = []) {
  const changed = Array.isArray(detail?.changedEntities) ? detail.changedEntities : []
  if (changed.includes('*')) return true
  return names.some((name) => changed.includes(name))
}

export function createDebouncedLiveReload(reload, delayMs = LIVE_RELOAD_DEBOUNCE_MS) {
  let timer = null
  const run = (opts) => {
    if (!isDocumentVisible()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      reload(opts)
    }, delayMs)
  }
  run.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return run
}
