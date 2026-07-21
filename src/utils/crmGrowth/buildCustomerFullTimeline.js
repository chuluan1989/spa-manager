import { getCareLogsForCustomer } from '../customerProfileStorage'
import { getInvoicePayment, getInvoiceServiceDetails, getInvoiceTips } from '../invoice'
import { getBranchName } from '../branchStorage'
import {
  TIMELINE_EVENT_LABELS,
  TIMELINE_EVENT_TYPES,
} from './crmGrowthConstants'

function eventSortKey(event) {
  const date = event.date || '0000-00-00'
  const time = event.time || '00:00'
  return `${date}T${time}`
}

/**
 * Full customer timeline — invoices, first visit, care notes, follow-up dates.
 * Sorted newest → oldest.
 */
export function buildCustomerFullTimeline(profile) {
  const events = []
  const invoices = [...(profile.invoices ?? [])]
    .sort((a, b) => {
      const dateCmp = (a.date ?? '').localeCompare(b.date ?? '')
      if (dateCmp !== 0) return dateCmp
      return String(a.invoiceTime ?? '').localeCompare(String(b.invoiceTime ?? ''))
    })

  if (profile.firstVisitDate) {
    const firstInv = invoices[0]
    events.push({
      id: `first-${profile.key}`,
      type: TIMELINE_EVENT_TYPES.FIRST_VISIT,
      typeLabel: TIMELINE_EVENT_LABELS[TIMELINE_EVENT_TYPES.FIRST_VISIT],
      date: profile.firstVisitDate,
      time: firstInv?.invoiceTime || '',
      title: 'Lần đầu đến spa',
      branchName: firstInv?.branchName || profile.primaryBranchName || getBranchName(profile.primaryBranchId) || '—',
      employeeName: firstInv?.employeeName || profile.primaryEmployeeName || '—',
      services: getInvoiceServiceDetails(firstInv || {}).map((s) => s.name).join(', ') || '—',
      tips: firstInv ? getInvoiceTips(firstInv) : 0,
      ticketRevenue: firstInv ? getInvoicePayment(firstInv) : 0,
      customerRequested: Boolean(firstInv?.customerRequested),
      note: '',
      invoice: firstInv || null,
    })
  }

  for (const invoice of invoices) {
    const services = getInvoiceServiceDetails(invoice)
    events.push({
      id: `inv-${invoice.id}`,
      type: TIMELINE_EVENT_TYPES.INVOICE,
      typeLabel: TIMELINE_EVENT_LABELS[TIMELINE_EVENT_TYPES.INVOICE],
      date: invoice.date ?? '',
      time: invoice.invoiceTime ?? '',
      title: `Hóa đơn · ${invoice.employeeName || '—'}`,
      branchName: invoice.branchName || getBranchName(invoice.branchId) || '—',
      employeeName: invoice.employeeName || '—',
      services: services.map((s) => s.name).join(', ') || '—',
      tips: getInvoiceTips(invoice),
      ticketRevenue: getInvoicePayment(invoice),
      customerRequested: Boolean(invoice.customerRequested),
      note: invoice.note || '',
      invoice,
    })
  }

  const careLogs = getCareLogsForCustomer(profile.key)
  for (const log of careLogs) {
    events.push({
      id: `care-${log.id}`,
      type: TIMELINE_EVENT_TYPES.CARE_NOTE,
      typeLabel: TIMELINE_EVENT_LABELS[TIMELINE_EVENT_TYPES.CARE_NOTE],
      date: log.careDate || (log.createdAt || '').slice(0, 10),
      time: (log.createdAt || '').slice(11, 16) || '',
      title: `Chăm sóc · ${log.caretaker || '—'}`,
      branchName: profile.primaryBranchName || '—',
      employeeName: log.caretaker || '—',
      services: '',
      tips: 0,
      ticketRevenue: 0,
      customerRequested: false,
      note: [log.content, log.result].filter(Boolean).join(' · '),
      followUpDate: log.followUpDate || '',
      invoice: null,
    })

    if (log.followUpDate) {
      events.push({
        id: `follow-${log.id}`,
        type: TIMELINE_EVENT_TYPES.FOLLOW_UP,
        typeLabel: TIMELINE_EVENT_LABELS[TIMELINE_EVENT_TYPES.FOLLOW_UP],
        date: log.followUpDate,
        time: '',
        title: 'Ngày được liên hệ lại',
        branchName: profile.primaryBranchName || '—',
        employeeName: log.caretaker || '—',
        services: '',
        tips: 0,
        ticketRevenue: 0,
        customerRequested: false,
        note: log.content || '',
        invoice: null,
      })
    }
  }

  return events.sort((a, b) => eventSortKey(b).localeCompare(eventSortKey(a)))
}
