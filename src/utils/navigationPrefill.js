const REPORT_PREFILL_KEY = 'spa-manager-report-prefill'
const INVOICE_EDIT_KEY = 'spa-manager-invoice-edit-id'

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

export function setInvoiceEditPrefill(invoiceId) {
  if (invoiceId) sessionStorage.setItem(INVOICE_EDIT_KEY, invoiceId)
}

export function consumeInvoiceEditPrefill() {
  const id = sessionStorage.getItem(INVOICE_EDIT_KEY)
  sessionStorage.removeItem(INVOICE_EDIT_KEY)
  return id || null
}
