import {
  canAddInvoice,
  canDeleteInvoice,
  canEditInvoice,
  filterByUserBranch,
  getCurrentUserBranch,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  isAdmin,
  isEmployee,
} from '../constants/auth'
import { getBranchName } from './branchStorage'
import { getEmployeeById } from './employeeStorage'
import { getSelectedServiceDetails } from './invoice'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { deleteInvoiceRow, upsertInvoice } from '../repositories/invoicesRepository'
import { notifyDataSynced } from './dataSyncEvents'

function pushInvoiceToSupabase(invoice) {
  if (!isSupabaseConfigured || !invoice) return
  upsertInvoice(invoice).catch((error) => {
    console.warn('[Supabase] Không thể đồng bộ hóa đơn:', error?.message)
  })
}

function pushInvoiceDeletionToSupabase(id) {
  if (!isSupabaseConfigured || !id) return
  deleteInvoiceRow(id).catch((error) => {
    console.warn('[Supabase] Không thể xoá hóa đơn trên máy chủ:', error?.message)
  })
}

const EMPLOYEE_EDITABLE_INVOICE_FIELDS = [
  'date',
  'invoiceTime',
  'customerName',
  'customerPhone',
  'serviceIds',
  'services',
  'tips',
  'paymentMethod',
  'note',
  'originalServiceTotal',
  'discountInput',
  'discountType',
  'discountValue',
  'discountAmount',
  'serviceTotal',
  'total',
  'commission',
]

function pickEmployeeEditableInvoiceFields(data) {
  const picked = {}
  for (const key of EMPLOYEE_EDITABLE_INVOICE_FIELDS) {
    if (data[key] !== undefined) picked[key] = data[key]
  }
  return picked
}

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
    services: getSelectedServiceDetails(
      invoice.serviceIds,
      invoice.branchId ?? '',
      [],
      invoice.branchName ?? '',
    ),
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

/** Ghi đè toàn bộ cache LocalStorage — dùng khi kéo dữ liệu mới nhất từ Supabase về. */
export function replaceAllInvoices(invoices) {
  const list = Array.isArray(invoices) ? invoices : []
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  return list
}

export function saveInvoice(invoice) {
  if (!canAddInvoice()) {
    return { success: false, error: 'Bạn không có quyền thêm hóa đơn.' }
  }

  let payload = invoice

  // Nhân viên chỉ được tạo hóa đơn cho chính mình, tại chi nhánh của mình.
  // Ép cứng ở storage layer để chặn mọi thao tác sửa qua code/browser.
  if (isEmployee()) {
    const employeeId = getCurrentUserEmployeeId()
    const branchId = getCurrentUserBranch()
    payload = {
      ...invoice,
      branchId,
      branchName: getBranchName(branchId),
      employeeId,
      employeeName: getEmployeeById(employeeId)?.name ?? invoice.employeeName ?? '',
      supportEmployeeId: '',
      supportEmployeeName: '',
    }
  }

  const branchId = payload.branchId ?? ''
  if (!isAdmin() && branchId !== getCurrentUserBranch()) {
    return { success: false, error: 'Bạn không có quyền thêm hóa đơn chi nhánh này.' }
  }

  const snapshot = ensureInvoiceSnapshot({
    ...payload,
    enteredBy: payload.enteredBy ?? getCurrentUserName(),
    createdAt: payload.createdAt ?? new Date().toISOString(),
  })
  const invoices = loadInvoices()
  invoices.unshift(snapshot)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  pushInvoiceToSupabase(snapshot)
  notifyDataSynced(['invoices'])
  return { success: true, invoice: snapshot, invoices }
}

export function updateInvoice(id, data) {
  const invoices = loadInvoices()
  const index = invoices.findIndex((invoice) => invoice.id === id)
  if (index === -1) {
    return { success: false, error: 'Không tìm thấy hóa đơn.' }
  }

  const current = invoices[index]

  if (!canEditInvoice(current)) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn.' }
  }

  const scoped = filterByUserBranch([current])
  if (!isAdmin() && scoped.length === 0) {
    return { success: false, error: 'Bạn không có quyền sửa hóa đơn này.' }
  }

  // Nhân viên chỉ được sửa nội dung dịch vụ/khách/tips/thanh toán/ghi chú;
  // không được đổi chi nhánh, nhân viên chính, nhân viên hỗ trợ — kể cả khi
  // dữ liệu gửi lên (qua code/browser) cố tình chứa các trường này.
  const safeData = isEmployee()
    ? {
        ...pickEmployeeEditableInvoiceFields(data),
        branchId: current.branchId,
        branchName: current.branchName,
        employeeId: current.employeeId,
        employeeName: current.employeeName,
        supportEmployeeId: current.supportEmployeeId,
        supportEmployeeName: current.supportEmployeeName,
      }
    : data

  const updated = ensureInvoiceSnapshot({
    ...current,
    ...safeData,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  invoices[index] = updated
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  pushInvoiceToSupabase(updated)
  notifyDataSynced(['invoices'])
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
  pushInvoiceDeletionToSupabase(id)
  notifyDataSynced(['invoices'])
  return { success: true, invoices }
}

export function createInvoiceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
