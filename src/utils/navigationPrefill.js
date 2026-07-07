const REPORT_PREFILL_KEY = 'spa-manager-report-prefill'

export function setReportPrefill(filters) {
  sessionStorage.setItem(REPORT_PREFILL_KEY, JSON.stringify(filters))
}

export function consumeReportPrefill() {
  const raw = sessionStorage.getItem(REPORT_PREFILL_KEY)
  sessionStorage.removeItem(REPORT_PREFILL_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
