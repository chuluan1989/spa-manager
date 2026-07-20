export const BRANCH_SUPPORT_SERVICE_ID = 'branch-support-service'
export const BRANCH_SUPPORT_SERVICE_NAME = 'DỊCH VỤ HỖ TRỢ'

/** Dịch vụ ảo — giá và hoa hồng do nhân viên nhập lúc tạo hóa đơn. */
export function createBranchSupportCatalogEntry() {
  return {
    id: BRANCH_SUPPORT_SERVICE_ID,
    name: BRANCH_SUPPORT_SERVICE_NAME,
    price: 0,
    commissionPercent: 0,
    status: 'active',
    isSupportService: true,
  }
}

export function isBranchSupportServiceId(serviceId) {
  return serviceId === BRANCH_SUPPORT_SERVICE_ID
}

export function isBranchSupportInvoice(invoice) {
  if (!invoice) return false
  if (Array.isArray(invoice.serviceIds) && invoice.serviceIds.includes(BRANCH_SUPPORT_SERVICE_ID)) {
    return true
  }
  return getInvoiceServiceDetails(invoice).some(
    (service) => service.id === BRANCH_SUPPORT_SERVICE_ID || service.isSupportService,
  )
}

function getInvoiceServiceDetails(invoice) {
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) {
    return invoice.services
  }
  return []
}
