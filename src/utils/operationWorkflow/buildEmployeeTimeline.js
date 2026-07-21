import { getInvoicePayment, getInvoiceTips } from '../invoice'
import { loadManagerNotes } from './managerNotesStorage'

function timeOf(isoOrTime) {
  if (!isoOrTime) return '—'
  if (String(isoOrTime).includes('T')) {
    const d = new Date(isoOrTime)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  }
  return String(isoOrTime).slice(0, 5)
}

function sortKey(date, timeLike) {
  const t = timeLike && String(timeLike).includes('T')
    ? timeLike
    : `${date || ''}T${String(timeLike || '00:00').slice(0, 5)}:00`
  return t
}

/**
 * Build chronological timeline for one employee on one date (or range via invoices/attendance filtered).
 */
export function buildEmployeeTimeline({
  employeeId,
  date,
  invoices = [],
  attendanceRecords = [],
  notes = null,
}) {
  if (!employeeId) return []
  const events = []

  for (const row of attendanceRecords.filter((a) => a.employeeId === employeeId && (!date || a.date === date))) {
    const stamp = row.submittedAt || row.updatedAt || `${row.date}T08:00:00`
    events.push({
      id: `att-${row.id || row.date}-${row.status}`,
      at: stamp,
      sortAt: sortKey(row.date, stamp),
      timeLabel: timeOf(stamp),
      date: row.date,
      type: 'attendance',
      title: row.status === 'on_time' || String(row.status).includes('on_time')
        ? 'Check-in / chấm công'
        : `Chấm công · ${row.status}`,
      detail: row.note || row.reason || '',
    })
  }

  for (const inv of invoices.filter((i) => i.employeeId === employeeId && (!date || i.date === date))) {
    const tips = getInvoiceTips(inv)
    const revenue = getInvoicePayment(inv)
    const stamp = inv.invoiceTime
      ? `${inv.date}T${String(inv.invoiceTime).slice(0, 8)}`
      : inv.createdAt || `${inv.date}T12:00:00`
    events.push({
      id: `inv-${inv.id}`,
      at: stamp,
      sortAt: sortKey(inv.date, stamp),
      timeLabel: timeOf(inv.invoiceTime || stamp),
      date: inv.date,
      type: 'invoice',
      title: `Hóa đơn #${String(inv.id).slice(-6)}`,
      detail: `${inv.customerName || 'Khách'} · ${revenue.toLocaleString('vi-VN')}₫`,
      meta: { invoiceId: inv.id, revenue, tips },
    })
    if (tips > 0) {
      events.push({
        id: `tips-${inv.id}`,
        at: stamp,
        sortAt: sortKey(inv.date, stamp) + '.1',
        timeLabel: timeOf(inv.invoiceTime || stamp),
        date: inv.date,
        type: 'tips',
        title: `Tips ${tips.toLocaleString('vi-VN')}₫`,
        detail: inv.customerName || '',
      })
    }
    if (inv.customerRequested) {
      events.push({
        id: `req-${inv.id}`,
        at: stamp,
        sortAt: sortKey(inv.date, stamp) + '.2',
        timeLabel: timeOf(inv.invoiceTime || stamp),
        date: inv.date,
        type: 'requested',
        title: 'Khách yêu cầu',
        detail: inv.customerName || '',
      })
    }
  }

  const noteList = notes ?? loadManagerNotes({ employeeId, date, limit: 50 })
  for (const note of noteList) {
    events.push({
      id: `note-${note.id}`,
      at: note.createdAt,
      sortAt: note.createdAt || sortKey(note.date, '16:00'),
      timeLabel: timeOf(note.createdAt),
      date: note.date,
      type: 'manager_note',
      title: 'Ghi chú quản lý',
      detail: note.text,
      meta: { authorName: note.authorName },
    })
  }

  return events.sort((a, b) => String(a.sortAt).localeCompare(String(b.sortAt)))
}
