import { notifyDataSynced } from '../supabaseSync'
import { appendOperationAudit } from './operationAuditLog'
import { AUDIT_ACTIONS, NOTE_PRESETS, OW_STORAGE_KEYS } from './operationWorkflowConstants'

function readList() {
  try {
    const raw = localStorage.getItem(OW_STORAGE_KEYS.managerNotes)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeList(list) {
  localStorage.setItem(OW_STORAGE_KEYS.managerNotes, JSON.stringify(list.slice(-2000)))
  notifyDataSynced(['operation-workflow'])
}

export function loadManagerNotes({
  employeeId = '',
  branchId = '',
  date = '',
  limit = 100,
} = {}) {
  let list = readList()
  if (employeeId) list = list.filter((n) => n.employeeId === employeeId)
  if (branchId) list = list.filter((n) => n.branchId === branchId)
  if (date) list = list.filter((n) => (n.date || n.createdAt?.slice(0, 10)) === date)
  return list.slice(-limit).reverse()
}

export function addManagerNote({
  employeeId,
  employeeName = '',
  branchId = '',
  date,
  text,
  authorId = '',
  authorName = '',
}) {
  const body = String(text ?? '').trim()
  if (!employeeId || !body) return null
  const entry = {
    id: `ow-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    employeeName,
    branchId,
    date: date || new Date().toISOString().slice(0, 10),
    text: body,
    authorId,
    authorName,
    createdAt: new Date().toISOString(),
  }
  const list = readList()
  list.push(entry)
  writeList(list)
  appendOperationAudit({
    action: AUDIT_ACTIONS.NOTE_ADD,
    entityType: 'manager_note',
    entityId: entry.id,
    entityName: employeeName || employeeId,
    branchId,
    oldValue: null,
    newValue: { text: body },
    details: body.slice(0, 120),
  })
  return entry
}

export function deleteManagerNote(noteId) {
  if (!noteId) return false
  const list = readList()
  const idx = list.findIndex((n) => n.id === noteId)
  if (idx < 0) return false
  const [removed] = list.splice(idx, 1)
  writeList(list)
  appendOperationAudit({
    action: AUDIT_ACTIONS.NOTE_DELETE,
    entityType: 'manager_note',
    entityId: noteId,
    entityName: removed?.employeeName || '',
    branchId: removed?.branchId || '',
    oldValue: removed,
    newValue: null,
    details: removed?.text?.slice(0, 120) || '',
  })
  return true
}

export { NOTE_PRESETS }
