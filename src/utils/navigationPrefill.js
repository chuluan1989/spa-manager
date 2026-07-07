const REPORT_PREFILL_KEY = 'spa-manager-report-prefill'
const DRILL_DOWN_PREFILL_KEY = 'spa-manager-drill-down-prefill'
const INVOICE_EDIT_KEY = 'spa-manager-invoice-edit-id'

export function setDrillDownPrefill(payload) {
  sessionStorage.setItem(DRILL_DOWN_PREFILL_KEY, JSON.stringify(payload))
}

export function consumeDrillDownPrefill() {
  const raw = sessionStorage.getItem(DRILL_DOWN_PREFILL_KEY)
  sessionStorage.removeItem(DRILL_DOWN_PREFILL_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** @deprecated Dùng setDrillDownPrefill */
export function setReportPrefill(filters) {
  setDrillDownPrefill({ level: 'branch', filters })
}

export function consumeReportPrefill() {
  const drill = consumeDrillDownPrefill()
  if (drill?.filters) return drill.filters
  const raw = sessionStorage.getItem(REPORT_PREFILL_KEY)
  sessionStorage.removeItem(REPORT_PREFILL_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setInvoiceEditPrefill(invoiceId) {
  if (invoiceId) sessionStorage.setItem(INVOICE_EDIT_KEY, invoiceId)
}

export function consumeInvoiceEditPrefill() {
  const id = sessionStorage.getItem(INVOICE_EDIT_KEY)
  sessionStorage.removeItem(INVOICE_EDIT_KEY)
  return id || null
}
