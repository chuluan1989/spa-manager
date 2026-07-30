/**
 * Employee branch timeline — Design Freeze: chuyển công tác đa chi nhánh.
 *
 * Ba khái niệm:
 * - Current Branch: employees.branchId (login, giá/lương mới, HĐ/chấm công mới)
 * - Record Branch: invoice/attendance/payroll.branchId (bất biến sau tạo)
 * - Branch History: employees.branchHistory[] (timeline + validate)
 *
 * TODO(phase-later): tách branch_history JSONB → bảng employee_branch_history.
 */

import { resolveCanonicalBranchId } from '../constants/canonicalBranches'

function normalizeDate(value) {
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

/**
 * @param {object|null|undefined} entry
 * @returns {object|null}
 */
export function normalizeBranchHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const effectiveDate = normalizeDate(entry.effectiveDate || entry.transferDate)
  const fromBranchId = resolveCanonicalBranchId(
    entry.fromBranchId || entry.from_branch_id || entry.branchId || '',
  )
  const toBranchId = resolveCanonicalBranchId(entry.toBranchId || entry.to_branch_id || '')
  if (!effectiveDate && !fromBranchId && !toBranchId) return null
  return {
    ...entry,
    effectiveDate,
    fromBranchId,
    toBranchId,
  }
}

/**
 * @param {object|null|undefined} employee
 * @returns {Array<object>}
 */
export function getSortedBranchHistory(employee) {
  return [...(employee?.branchHistory ?? [])]
    .map(normalizeBranchHistoryEntry)
    .filter(Boolean)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)))
}

/**
 * Chi nhánh hiện tại — chỉ dùng cho login, tạo mới, quyền.
 * @param {object|null|undefined} employee
 */
export function getCurrentEmployeeBranch(employee) {
  return resolveCanonicalBranchId(employee?.branchId ?? '')
}

/**
 * Chi nhánh nhân viên tại một ngày — suy từ branch_history timeline.
 * Quy ước: date >= effectiveDate => áp dụng toBranchId (hỗ trợ nhiều lần chuyển, kể cả quay lại CN cũ).
 *
 * @param {object|null|undefined} employee
 * @param {string} date YYYY-MM-DD
 */
export function getEmployeeBranchAtDate(employee, date) {
  const recordDate = normalizeDate(date)
  if (!employee) return ''
  if (!recordDate) return getCurrentEmployeeBranch(employee)

  const history = getSortedBranchHistory(employee)
  if (history.length === 0) {
    return getCurrentEmployeeBranch(employee)
  }

  let branchAtDate = history[0].fromBranchId || getCurrentEmployeeBranch(employee)
  for (const entry of history) {
    if (entry.effectiveDate && recordDate >= entry.effectiveDate && entry.toBranchId) {
      branchAtDate = entry.toBranchId
    }
  }
  return branchAtDate
}

/**
 * Các giai đoạn làm việc theo chi nhánh (phục vụ UI timeline / payroll breakdown).
 * @param {object|null|undefined} employee
 * @returns {Array<{ branchId: string, fromDate: string|null, toDate: string|null }>}
 */
export function getEmployeeBranchSegments(employee) {
  const history = getSortedBranchHistory(employee)
  if (history.length === 0) {
    const branchId = getCurrentEmployeeBranch(employee)
    return branchId ? [{ branchId, fromDate: null, toDate: null }] : []
  }

  const segments = []
  let activeBranch = history[0].fromBranchId || getCurrentEmployeeBranch(employee)
  let segmentFrom = null

  for (const entry of history) {
    if (!entry.effectiveDate || !entry.toBranchId) continue
    segments.push({
      branchId: activeBranch,
      fromDate: segmentFrom,
      toDate: entry.effectiveDate,
    })
    activeBranch = entry.toBranchId
    segmentFrom = entry.effectiveDate
  }

  segments.push({
    branchId: activeBranch,
    fromDate: segmentFrom,
    toDate: null,
  })

  return segments.filter((segment) => Boolean(segment.branchId))
}

/**
 * Validate cấu trúc branch_history (không sửa DB).
 * @param {object|null|undefined} employee
 */
export function validateBranchHistory(employee) {
  const issues = []
  const history = getSortedBranchHistory(employee)
  const employeeId = employee?.id ?? '—'

  if (history.length === 0) {
    return { ok: true, issues, history }
  }

  let previousTo = ''
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index]
    const label = `entry[${index}]`

    if (!entry.effectiveDate) {
      issues.push(`${employeeId}: ${label} thiếu effectiveDate`)
    }
    if (!entry.fromBranchId) {
      issues.push(`${employeeId}: ${label} thiếu fromBranchId`)
    }
    if (!entry.toBranchId) {
      issues.push(`${employeeId}: ${label} thiếu toBranchId`)
    }
    if (entry.fromBranchId === entry.toBranchId && entry.fromBranchId) {
      issues.push(`${employeeId}: ${label} fromBranchId === toBranchId (${entry.fromBranchId})`)
    }
    if (index > 0 && previousTo && entry.fromBranchId && entry.fromBranchId !== previousTo) {
      issues.push(
        `${employeeId}: ${label} fromBranchId (${entry.fromBranchId}) `
        + `≠ toBranchId entry trước (${previousTo})`,
      )
    }
    if (index > 0 && entry.effectiveDate && history[index - 1].effectiveDate
      && entry.effectiveDate < history[index - 1].effectiveDate) {
      issues.push(`${employeeId}: ${label} effectiveDate không tăng dần`)
    }
    previousTo = entry.toBranchId || previousTo
  }

  const current = getCurrentEmployeeBranch(employee)
  const lastTo = history[history.length - 1]?.toBranchId
  if (lastTo && current && lastTo !== current) {
    issues.push(
      `${employeeId}: branchId hiện tại (${current}) ≠ toBranchId cuối history (${lastTo})`,
    )
  }

  return { ok: issues.length === 0, issues, history }
}

/**
 * So khớp record.branch_id với timeline tại ngày phát sinh.
 * @param {object} record
 * @param {object} employee
 * @param {string} [dateField='date']
 */
export function compareRecordBranchToTimeline(record, employee, dateField = 'date') {
  const recordDate = normalizeDate(record?.[dateField] ?? record?.attendanceDate ?? '')
  const recordBranch = resolveCanonicalBranchId(record?.branchId ?? record?.branch_id ?? '')
  if (!recordDate || !recordBranch) {
    return { ok: true, skipped: true, recordDate, recordBranch, expectedBranch: '' }
  }

  const expectedBranch = getEmployeeBranchAtDate(employee, recordDate)
  if (!expectedBranch) {
    return { ok: true, skipped: true, recordDate, recordBranch, expectedBranch: '' }
  }

  return {
    ok: recordBranch === expectedBranch,
    skipped: false,
    recordDate,
    recordBranch,
    expectedBranch,
  }
}

/**
 * Nhân viên có phát sinh tại chi nhánh trong tập records (theo record.branch_id).
 * @param {string} branchId
 * @param {Array<object>} records
 * @param {string} [employeeIdField='employeeId']
 */
export function collectEmployeeIdsWithRecordBranchActivity(branchId, records, employeeIdField = 'employeeId') {
  const scopeBranch = resolveCanonicalBranchId(branchId)
  if (!scopeBranch) return new Set()

  const ids = new Set()
  for (const record of records ?? []) {
    const recordBranch = resolveCanonicalBranchId(record?.branchId ?? record?.branch_id ?? '')
    if (recordBranch !== scopeBranch) continue
    const employeeId = record?.[employeeIdField] ?? record?.employee_id ?? ''
    if (employeeId) ids.add(employeeId)
    const supportId = record?.supportEmployeeId ?? record?.support_employee_id ?? ''
    if (supportId) ids.add(supportId)
  }
  return ids
}

/**
 * Nhân viên đang thuộc chi nhánh hiện tại (current branch) — roster / login / tạo mới.
 * Không dùng để lọc dữ liệu lịch sử.
 */
export function employeeCurrentlyAtBranch(employee, branchId) {
  if (!branchId) return true
  if (!employee) return false
  return resolveCanonicalBranchId(employee.branchId) === resolveCanonicalBranchId(branchId)
}
