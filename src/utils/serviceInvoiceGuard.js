import { loadInvoices } from './invoiceStorage'

function invoiceMatchesService(invoice, { branchId, serviceId, durationId }) {
  if (branchId && invoice.branchId !== branchId) return false

  const ids = new Set()
  if (Array.isArray(invoice.serviceIds)) {
    for (const id of invoice.serviceIds) ids.add(String(id))
  }
  if (Array.isArray(invoice.services)) {
    for (const line of invoice.services) {
      if (line?.id) ids.add(String(line.id))
    }
  }

  if (durationId && ids.has(String(durationId))) return true
  if (serviceId && ids.has(String(serviceId))) return true
  return false
}

/** Kiểm tra dịch vụ/thời lượng đã xuất hiện trong hóa đơn (cache local + remote đã sync). */
export function hasServiceInvoiceReferences({ branchId = '', serviceId = '', durationId = '' } = {}) {
  if (!serviceId && !durationId) return false

  const invoices = loadInvoices()
  return invoices.some((invoice) => invoiceMatchesService(invoice, { branchId, serviceId, durationId }))
}

export function countServiceInvoiceStats(invoices, { branchId, fromDate, toDate, durationId, serviceId }) {
  let count = 0
  let revenue = 0

  for (const invoice of invoices) {
    if (branchId && invoice.branchId !== branchId) continue
    if (fromDate && invoice.date < fromDate) continue
    if (toDate && invoice.date > toDate) continue
    if (!invoiceMatchesService(invoice, { branchId, serviceId, durationId })) continue

    count += 1
    const lines = Array.isArray(invoice.services) ? invoice.services : []
    const matched = lines.filter(
      (line) => String(line.id) === String(durationId) || String(line.id) === String(serviceId),
    )
    if (matched.length > 0) {
      revenue += matched.reduce((sum, line) => sum + Number(line.price ?? 0), 0)
    } else {
      revenue += Number(invoice.serviceTotal ?? 0)
    }
  }

  return { count, revenue }
}
