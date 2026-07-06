import { canAddInvoice, canDeleteInvoice, canEditInvoice, filterByUserBranch, getCurrentUserBranch, isAdmin } from '../constants/auth'
import { getSelectedServiceDetails } from './invoice'

const STORAGE_KEY = 'spa-manager-invoices'

export function getTodayDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getMonthStartDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function ensureInvoiceSnapshot(invoice) {
  if (Array.isArray(invoice.services) && invoice.services.length > 0) {
    return invoice
  }

  if (!Array.isArray(invoice.serviceIds) || invoice.serviceIds.length === 0) {
    return { ...invoice, services: invoice.services ?? [] }
  }

  return {
    ...invoice,
    services: getSelectedServiceDetails(invoice.serviceIds, invoice.branchId ?? ''),
  }
}

function migrateInvoices(invoices) {
  let changed = false
  const migrated = invoices.map((invoice) => {
    const hasSnapshot = Array.isArray(invoice.services) && invoice.services.length > 0
    if (hasSnapshot) return invoice
    const next = ensureInvoiceSnapshot(invoice)
    if (Array.isArray(next.services) && next.services.length > 0) changed = true
    return next
  })

  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
  }

  return migrated
}

export function loadInvoices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return migrateInvoices(data)
  } catch {
    return []
  }
}

export function getInvoiceById(id) {
  return loadInvoices().find((invoice) => invoice.id === id) ?? null
}

export function saveInvoice(invoice) {
  if (!canAddInvoice()) {
    return { success: false, error: 'Bạn không có quyền thêm hóa đơn.' }
  }

  const branchId = invoice.branchId ?? ''
  if (!isAdmin() && branchId !== getCurrentUserBranch()) {
    return { success: false, error: 'Bạn không có quyền thêm hóa đơn chi nhánh này.' }
  }

  const snapshot = ensureInvoiceSnapshot(invoice)
  const invoices = loadInvoices()
  invoices.unshift(snapshot)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  return { success: true, invoice: snapshot, invoices }
}

export function updateInvoice(id, data) {
  if (!canEditInvoice()) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn.' }
  }

  const invoices = loadInvoices()
  const index = invoices.findIndex((invoice) => invoice.id === id)
  if (index === -1) {
    return { success: false, error: 'Không tìm thấy hóa đơn.' }
  }

  const current = invoices[index]
  const scoped = filterByUserBranch([current])
  if (!isAdmin() && scoped.length === 0) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn này.' }
  }

  const updated = ensureInvoiceSnapshot({
    ...current,
    ...data,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  invoices[index] = updated
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  return { success: true, invoice: updated, invoices }
}

export function deleteInvoice(id) {
  if (!canDeleteInvoice()) {
    return { success: false, error: 'Bạn không có quyền xóa hóa đơn.' }
  }

  const current = getInvoiceById(id)
  if (!current) {
    return { success: false, error: 'Không tìm thấy hóa đơn.' }
  }

  const scoped = filterByUserBranch([current])
  if (!isAdmin() && scoped.length === 0) {
    return { success: false, error: 'Bạn không có quyền xóa hóa đơn này.' }
  }

  const invoices = loadInvoices().filter((inv) => inv.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  return { success: true, invoices }
}

export function createInvoiceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
