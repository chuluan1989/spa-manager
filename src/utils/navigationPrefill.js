const REPORT_PREFILL_KEY = 'spa-manager-report-prefill'
const DRILL_DOWN_PREFILL_KEY = 'spa-manager-drill-down-prefill'
const INVOICE_EDIT_KEY = 'spa-manager-invoice-edit-id'
const INVOICE_CREATE_DATE_KEY = 'spa-manager-invoice-create-date'

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

/** Prefill ngày tour khi nhân viên nhập bổ sung hóa đơn cũ. */
export function setInvoiceCreateDatePrefill(date) {
  if (date) sessionStorage.setItem(INVOICE_CREATE_DATE_KEY, date)
}

export function consumeInvoiceCreateDatePrefill() {
  const date = sessionStorage.getItem(INVOICE_CREATE_DATE_KEY)
  sessionStorage.removeItem(INVOICE_CREATE_DATE_KEY)
  return date || null
}

const PAYROLL_CLOSE_PREFILL_KEY = 'spa-manager-payroll-close-prefill'
const APP_NAVIGATE_KEY = 'spa-manager-app-navigate-once'

/** Prefill tháng/kỳ khi mở Lương từ banner nhắc chốt. */
export function setPayrollClosePrefill({ billingMonth, cycle } = {}) {
  if (!billingMonth || !cycle) return
  sessionStorage.setItem(
    PAYROLL_CLOSE_PREFILL_KEY,
    JSON.stringify({ billingMonth, cycle }),
  )
}

export function consumePayrollClosePrefill() {
  const raw = sessionStorage.getItem(PAYROLL_CLOSE_PREFILL_KEY)
  sessionStorage.removeItem(PAYROLL_CLOSE_PREFILL_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Điều hướng app một lần (Tour / Chấm công / Lương) từ panel chốt kỳ. */
export function requestAppNavigate(pageId) {
  if (!pageId) return
  sessionStorage.setItem(APP_NAVIGATE_KEY, pageId)
  window.dispatchEvent(new Event('spa-app-navigate'))
}

export function consumeAppNavigate() {
  const pageId = sessionStorage.getItem(APP_NAVIGATE_KEY)
  sessionStorage.removeItem(APP_NAVIGATE_KEY)
  return pageId || null
}
