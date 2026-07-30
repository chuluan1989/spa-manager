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

/** Ngày liền trước (YYYY-MM-DD), dùng làm Đến ngày inclusive khi đóng giai đoạn. */
export function dayBefore(dateValue) {
  const date = normalizeDate(dateValue)
  if (!date) return ''
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  parsed.setDate(parsed.getDate() - 1)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
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
 * Các giai đoạn làm việc theo chi nhánh (phục vụ UI lịch sử công tác).
 * toDate là inclusive (ngày cuối tại CN); null = hiện tại.
 * @param {object|null|undefined} employee
 * @returns {Array<{ branchId: string, fromDate: string|null, toDate: string|null }>}
 */
export function getEmployeeBranchSegments(employee) {
  const history = getSortedBranchHistory(employee)
  const startDate = normalizeDate(employee?.startDate || employee?.start_date || '')
  if (history.length === 0) {
    const branchId = getCurrentEmployeeBranch(employee)
    return branchId ? [{ branchId, fromDate: startDate || null, toDate: null }] : []
  }

  const segments = []
  let activeBranch = history[0].fromBranchId || getCurrentEmployeeBranch(employee)
  let segmentFrom = startDate || null

  for (const entry of history) {
    if (!entry.effectiveDate || !entry.toBranchId) continue
    segments.push({
      branchId: activeBranch,
      fromDate: segmentFrom,
      toDate: dayBefore(entry.effectiveDate) || null,
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
 * Bảng lịch sử công tác (mới nhất trước) — không dạng event A→B.
 * @param {object|null|undefined} employee
 * @param {{ getBranchName?: (id: string) => string }} [options]
 */
export function buildWorkAssignmentHistoryRows(employee, options = {}) {
  const resolveName = typeof options.getBranchName === 'function'
    ? options.getBranchName
    : (id) => id || '—'
  const history = getSortedBranchHistory(employee)
  const historyByStart = new Map(
    history
      .filter((entry) => entry.effectiveDate && entry.toBranchId)
      .map((entry) => [entry.effectiveDate, entry]),
  )

  return getEmployeeBranchSegments(employee)
    .map((segment) => {
      const openedBy = segment.fromDate ? historyByStart.get(segment.fromDate) : null
      const isCurrent = !segment.toDate
      return {
        fromDate: segment.fromDate,
        toDate: segment.toDate,
        branchId: segment.branchId,
        branchName: resolveName(segment.branchId),
        roleTitle: openedBy?.roleTitle || openedBy?.position || employee?.position || '',
        reason: openedBy?.reason || '',
        note: openedBy?.note || '',
        createdBy: openedBy?.createdBy || openedBy?.approver || '',
        createdAt: openedBy?.createdAt || openedBy?.changedAt || '',
        status: isCurrent ? 'current' : 'ended',
        statusLabel: isCurrent ? 'Hiện tại' : 'Đã kết thúc',
      }
    })
    .reverse()
}

/**
 * Validate đề xuất chuyển công tác (không ghi DB).
 * @param {object|null|undefined} employee
 * @param {string} newBranchId
 * @param {string} effectiveDate
 */
export function validateProposedTransfer(employee, newBranchId, effectiveDate) {
  const issues = []
  const warnings = []
  const toBranch = resolveCanonicalBranchId(newBranchId)
  const current = getCurrentEmployeeBranch(employee)
  const date = normalizeDate(effectiveDate)

  if (!employee?.id) issues.push('Không tìm thấy nhân viên.')
  if (!toBranch) issues.push('Vui lòng chọn chi nhánh mới.')
  if (!date) issues.push('Vui lòng chọn ngày hiệu lực.')
  if (toBranch && current && toBranch === current) {
    issues.push('Chi nhánh mới không được trùng chi nhánh hiện tại.')
  }

  const history = getSortedBranchHistory(employee)
  const last = history[history.length - 1]
  if (last?.effectiveDate && date && date <= last.effectiveDate) {
    issues.push(
      `Ngày hiệu lực phải sau lần chuyển gần nhất (${last.effectiveDate}) — không chồng lấn lịch sử công tác.`,
    )
  }

  const openSegments = getEmployeeBranchSegments(employee).filter((segment) => !segment.toDate)
  if (openSegments.length > 1) {
    issues.push('Lịch sử công tác hiện có hơn một giai đoạn đang mở — cần sửa dữ liệu trước khi chuyển.')
  }

  if (date && date < todayIsoDate()) {
    warnings.push(
      'Ngày hiệu lực nằm trong quá khứ. Hệ thống sẽ không tự sửa hóa đơn/chấm công/lương đã phát sinh.',
    )
  }

  return { ok: issues.length === 0, issues, warnings }
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
