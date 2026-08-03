import { getInvoiceCustomerTotal } from './invoice'
import {
  PAYMENT_METHODS,
  normalizePaymentMethod,
} from '../constants/paymentMethods'

/** Tiền thực thu / tổng khách trả — field `total` hoặc payment + tips. */
export function getInvoiceCollectedAmount(invoice) {
  return getInvoiceCustomerTotal(invoice)
}

/**
 * Tổng hợp dòng tiền theo phương thức (HĐ đã filter theo chi nhánh phục vụ nếu cần).
 */
export function aggregatePaymentMethodTotals(invoices = []) {
  let cashAmount = 0
  let bankTransferAmount = 0
  let unknownAmount = 0
  let cashCount = 0
  let bankTransferCount = 0
  let unknownCount = 0

  for (const invoice of invoices) {
    const amount = getInvoiceCollectedAmount(invoice)
    const method = normalizePaymentMethod(invoice?.paymentMethod)
    if (method === PAYMENT_METHODS.CASH) {
      cashAmount += amount
      cashCount += 1
    } else if (method === PAYMENT_METHODS.BANK_TRANSFER) {
      bankTransferAmount += amount
      bankTransferCount += 1
    } else {
      unknownAmount += amount
      unknownCount += 1
    }
  }

  const totalCollected = cashAmount + bankTransferAmount + unknownAmount
  return {
    cashAmount,
    bankTransferAmount,
    unknownAmount,
    totalCollected,
    cashCount,
    bankTransferCount,
    unknownCount,
    cashRatePercent: totalCollected > 0 ? Math.round((cashAmount / totalCollected) * 1000) / 10 : 0,
    bankTransferRatePercent: totalCollected > 0
      ? Math.round((bankTransferAmount / totalCollected) * 1000) / 10
      : 0,
  }
}
