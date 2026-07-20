/** @deprecated Chỉ giữ cho test thuần — production dùng serviceInvoiceGuardRepository. */

export function invoiceMatchesService(invoice, { branchId, serviceId, durationId }) {
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

export { verifyNoInvoiceReferencesRemote } from '../repositories/serviceInvoiceGuardRepository'
