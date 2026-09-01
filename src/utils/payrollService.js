import { getCurrentUser, getCurrentUserEmployeeId, getCurrentUserName, isAdmin, isEmployee } from '../constants/auth'
import { PAYROLL_ADJUSTMENT_TYPES, normalizePayrollAdjustmentAmount } from '../constants/payrollTypes'
import { isPayrollMonthLocked } from './payrollEngine'
import { buildPayrollFieldAuditValues, netSalaryImpactForFieldSet } from './payrollFieldAudit'
import { notifyDataSynced } from './dataSyncEvents'
import { invalidateCloseAfterSourceChange } from './payrollCycleClose/approvedCloseLock'
import {
  createPayrollAdjustmentId,
  createPayrollAuditId,
  createPayrollLockId,
  deletePayrollAdjustment,
  fetchPayrollAdjustments,
  fetchPayrollAuditLogs,
  fetchPayrollLocks,
  insertPayrollAdjustment,
  insertPayrollAuditLog,
  updatePayrollAdjustment,
  upsertPayrollLock,
} from '../repositories/payrollRepository'
import {
  PAYROLL_ADJUSTMENT_SOURCES,
  PAYROLL_PENALTY_CATEGORIES,
  assertManualPenaltyNotAttendanceMirror,
  normalizePenaltyCategory,
  normalizePenaltySource,
} from './payrollPenaltyPolicy'
import { isPayrollBoardLineType } from './payrollBoardLines'

async function afterPayrollAdjustmentSourceChanged(record) {
  if (!record?.employeeId) return
  const date = String(record.date || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await invalidateCloseAfterSourceChange(record.employeeId, date).catch((err) => {
      console.warn('[payroll-adjustment] invalidate close:', err?.message)
    })
  }
  notifyDataSynced(['payroll', 'payroll-adjustments', 'payroll-cycle-closes'])
}

function currentEditor() {
  const user = getCurrentUser()
  return {
    editorId: user?.employeeId ?? user?.username ?? user?.role ?? '',
    editorName: getCurrentUserName(),
  }
}

async function writeAuditLog({ entityType, entityId, action, oldValue, newValue, reason }) {
  const { editorId, editorName } = currentEditor()
  return insertPayrollAuditLog({
    id: createPayrollAuditId(),
    entityType,
    entityId,
    action,
    editorId,
    editorName,
    oldValue: oldValue ?? {},
    newValue: newValue ?? {},
    reason: reason ?? '',
  })
}

/** Re-export helper thuần (dùng chung UI + script). */
export { buildPayrollFieldAuditValues } from './payrollFieldAudit'

export async function loadPayrollAuditLogs(filters = {}) {
  return fetchPayrollAuditLogs(filters)
}

export async function loadPayrollLocks(month = '') {
  return fetchPayrollLocks({ month })
}

export function assertCanManagePayroll(employeeBranchId = '') {
  if (isAdmin()) return true
  if (isEmployee()) {
    throw new Error('Nhân viên không được thêm hoặc sửa khoản lương.')
  }
  const userBranch = getCurrentUser()?.branch ?? ''
  if (employeeBranchId && userBranch && employeeBranchId !== userBranch) {
    throw new Error('Chỉ được thao tác nhân viên thuộc chi nhánh của bạn.')
  }
  return true
}

export function assertCanAdminEditPayroll() {
  if (!isAdmin()) {
    throw new Error('Chỉ Admin được dùng KPI / Sửa bảng lương.')
  }
  return true
}

export async function assertMonthEditable(month, branchId, locks) {
  const rows = locks ?? await fetchPayrollLocks({ month })
  if (isPayrollMonthLocked(month, branchId, rows)) {
    throw new Error('Tháng lương đã chốt. Admin cần mở khóa trước khi sửa.')
  }
}

export async function addPayrollAdjustment(payload, locks = null) {
  assertCanManagePayroll(payload.branchId)
  await assertMonthEditable(payload.month, payload.branchId, locks)

  const reason = payload.reason?.trim?.() ?? payload.reason ?? ''
  const note = payload.note?.trim?.() ?? payload.note ?? ''
  const category = normalizePenaltyCategory(
    payload.category ?? PAYROLL_PENALTY_CATEGORIES.OTHER,
  )
  if (payload.type === PAYROLL_ADJUSTMENT_TYPES.PENALTY) {
    const gate = assertManualPenaltyNotAttendanceMirror({
      type: payload.type,
      reason,
      note,
      category,
    })
    if (gate.blocked) throw new Error(gate.message)
  }

  const { editorId, editorName } = currentEditor()
  const amount = normalizePayrollAdjustmentAmount(payload.type, payload.amount)
  const record = {
    id: createPayrollAdjustmentId(),
    date: payload.date,
    month: payload.month,
    branchId: payload.branchId ?? '',
    employeeId: payload.employeeId,
    employeeName: payload.employeeName ?? '',
    type: payload.type,
    amount,
    reason,
    note,
    expenseId: payload.expenseId ?? '',
    payrollCycle: payload.payrollCycle ?? '',
    source: normalizePenaltySource(payload.source ?? PAYROLL_ADJUSTMENT_SOURCES.MANUAL),
    category: payload.type === PAYROLL_ADJUSTMENT_TYPES.PENALTY
      ? category
      : (payload.category ? normalizePenaltyCategory(payload.category) : PAYROLL_PENALTY_CATEGORIES.OTHER),
    createdBy: editorId,
    createdByName: editorName,
  }

  if (record.source === PAYROLL_ADJUSTMENT_SOURCES.ATTENDANCE) {
    throw new Error(
      'Không tạo payroll_adjustment nguồn attendance. Phạt chấm công chỉ lấy từ attendance.penaltyAmount.',
    )
  }

  const saved = await insertPayrollAdjustment(record)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: saved.id,
    action: 'create',
    oldValue: {},
    newValue: saved,
    reason: payload.reason ?? '',
  })
  await afterPayrollAdjustmentSourceChanged(saved)
  return saved
}

export async function editPayrollAdjustment(record, updates, locks = null) {
  assertCanManagePayroll(record.branchId)
  await assertMonthEditable(record.month, record.branchId, locks)

  const { allowSignedPenalty: _omitSignedFlag, ...safeUpdates } = updates || {}
  const nextType = safeUpdates.type ?? record.type
  const nextReason = safeUpdates.reason !== undefined ? safeUpdates.reason : record.reason
  const nextNote = safeUpdates.note !== undefined ? safeUpdates.note : record.note
  const nextCategory = normalizePenaltyCategory(
    safeUpdates.category ?? record.category ?? PAYROLL_PENALTY_CATEGORIES.OTHER,
  )
  // Cho phép zero/void legacy mirror; chặn khi vẫn còn số tiền > 0 và nội dung attendance-like.
  const nextAmountRaw = safeUpdates.amount !== undefined
    ? normalizePayrollAdjustmentAmount(nextType, safeUpdates.amount)
    : record.amount
  if (
    nextType === PAYROLL_ADJUSTMENT_TYPES.PENALTY
    && Number(nextAmountRaw) !== 0
  ) {
    const gate = assertManualPenaltyNotAttendanceMirror({
      type: nextType,
      reason: nextReason,
      note: nextNote,
      category: nextCategory,
    })
    if (gate.blocked) throw new Error(gate.message)
  }

  const next = {
    ...record,
    ...safeUpdates,
    reason: nextReason,
    note: nextNote,
    category: nextCategory,
    source: normalizePenaltySource(safeUpdates.source ?? record.source ?? PAYROLL_ADJUSTMENT_SOURCES.MANUAL),
    amount: nextAmountRaw,
    updatedAt: new Date().toISOString(),
  }
  delete next.allowSignedPenalty
  delete next.allow_signed_penalty
  if (next.source === PAYROLL_ADJUSTMENT_SOURCES.ATTENDANCE && Number(next.amount) !== 0) {
    throw new Error(
      'Không lưu payroll_adjustment nguồn attendance với số tiền > 0. Dùng attendance.penaltyAmount.',
    )
  }

  const saved = await updatePayrollAdjustment(next)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: saved.id,
    action: 'update',
    oldValue: record,
    newValue: saved,
    reason: safeUpdates.reason ?? record.reason ?? '',
  })
  await afterPayrollAdjustmentSourceChanged(saved)
  if (record.employeeId !== saved.employeeId || record.date !== saved.date || record.month !== saved.month) {
    await afterPayrollAdjustmentSourceChanged(record)
  }
  return saved
}

export async function removePayrollAdjustment(record, reason = '', locks = null) {
  if (!isAdmin()) {
    throw new Error('Chỉ Admin được xóa khoản lương.')
  }
  await assertMonthEditable(record.month, record.branchId, locks)
  await deletePayrollAdjustment(record.id)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: record.id,
    action: 'delete',
    oldValue: record,
    newValue: {},
    reason,
  })
  await afterPayrollAdjustmentSourceChanged(record)
}

function assertBoardLinePayload(payload) {
  if (!isPayrollBoardLineType(payload?.type)) {
    throw new Error('Chỉ được thêm/sửa ứng lương hoặc phạt khác theo từng phát sinh.')
  }
  const amount = Number(payload.amount ?? 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Số tiền phát sinh phải lớn hơn 0.')
  }
  if (!String(payload.date || '').trim()) {
    throw new Error('Ngày phát sinh là bắt buộc.')
  }
  if (!String(payload.reason || '').trim()) {
    throw new Error('Lý do là bắt buộc.')
  }
}

/**
 * Admin — thêm 1 phát sinh ứng lương / phạt khác (cộng dồn, không SET tổng).
 */
export async function addPayrollBoardLine(payload, locks = null) {
  assertCanAdminEditPayroll()
  assertBoardLinePayload(payload)
  return addPayrollAdjustment({
    ...payload,
    amount: normalizePayrollAdjustmentAmount(payload.type, payload.amount),
    source: PAYROLL_ADJUSTMENT_SOURCES.MANUAL,
    category: payload.type === PAYROLL_ADJUSTMENT_TYPES.PENALTY
      ? normalizePenaltyCategory(payload.category ?? PAYROLL_PENALTY_CATEGORIES.OTHER)
      : PAYROLL_PENALTY_CATEGORIES.OTHER,
  }, locks)
}

/**
 * Admin — sửa 1 phát sinh (không ghi đè các dòng khác).
 */
export async function editPayrollBoardLine(record, updates, locks = null) {
  assertCanAdminEditPayroll()
  if (!isPayrollBoardLineType(record?.type)) {
    throw new Error('Chỉ sửa từng phát sinh ứng lương / phạt khác.')
  }
  const nextAmount = updates?.amount !== undefined ? Number(updates.amount) : Number(record.amount ?? 0)
  if (!Number.isFinite(nextAmount) || nextAmount < 0) {
    throw new Error('Số tiền không hợp lệ.')
  }
  if (updates?.amount !== undefined && nextAmount === 0) {
    throw new Error('Để đưa về 0 hãy dùng Hủy khoản — không SET tổng.')
  }
  const { allowSignedPenalty: _omit, ...safeUpdates } = updates || {}
  return editPayrollAdjustment(record, {
    ...safeUpdates,
    amount: updates?.amount !== undefined
      ? normalizePayrollAdjustmentAmount(record.type, updates.amount)
      : record.amount,
  }, locks)
}

/**
 * Admin — void 1 phát sinh (amount = 0). Tổng kỳ giảm đúng số dòng đó.
 */
export async function voidPayrollBoardLine(record, reason = '', locks = null) {
  assertCanAdminEditPayroll()
  if (!isPayrollBoardLineType(record?.type)) {
    throw new Error('Chỉ hủy từng phát sinh ứng lương / phạt khác.')
  }
  const why = String(reason || '').trim()
  if (!why) throw new Error('Lý do hủy khoản là bắt buộc.')
  if (Number(record.amount ?? 0) === 0) return record
  const saved = await editPayrollAdjustment(record, {
    amount: 0,
    note: [record.note, `Đã hủy: ${why}`].filter(Boolean).join(' · '),
  }, locks)
  await writeAuditLog({
    entityType: 'payroll_adjustment',
    entityId: saved.id,
    action: 'void',
    oldValue: record,
    newValue: saved,
    reason: why,
  })
  return saved
}

/**
 * Admin — xóa 1 phát sinh.
 */
export async function deletePayrollBoardLine(record, reason = '', locks = null) {
  assertCanAdminEditPayroll()
  if (!isPayrollBoardLineType(record?.type)) {
    throw new Error('Chỉ xóa từng phát sinh ứng lương / phạt khác.')
  }
  return removePayrollAdjustment(record, reason, locks)
}

/**
 * Admin — lưu SET Thưởng / KPI.
 * Ứng lương và Phạt khác KHÔNG SET tổng — bỏ qua nếu vẫn còn trong payload cũ.
 */
export async function saveAdminPayrollBoardEdits({
  reason,
  note = '',
  totals = {},
  displayedTotals = null,
  attendancePenalty: _attendancePenalty = 0,
  employeeId,
  employeeName,
  branchId,
  month,
  cycle = '',
  fromDate = '',
  toDate = '',
  locks = null,
  existingAdjustments = null,
  previewImpact = null,
}) {
  assertCanAdminEditPayroll()
  if (!String(reason || '').trim()) {
    throw new Error('Lý do chỉnh sửa là bắt buộc.')
  }
  await assertMonthEditable(month, branchId, locks)

  const allRows = existingAdjustments ?? await fetchPayrollAdjustments({ month, employeeId })
  const boardTypes = [
    PAYROLL_ADJUSTMENT_TYPES.BONUS,
    PAYROLL_ADJUSTMENT_TYPES.KPI,
  ]
  const results = []
  const date = toDate || `${month}-15`

  for (const type of [PAYROLL_ADJUSTMENT_TYPES.PENALTY, PAYROLL_ADJUSTMENT_TYPES.ADVANCE]) {
    if (Object.prototype.hasOwnProperty.call(totals, type)) {
      results.push({ action: 'ignored_line_item_type', type })
    }
  }

  for (const type of boardTypes) {
    if (!Object.prototype.hasOwnProperty.call(totals, type)) continue
    const targetDisplayed = normalizePayrollAdjustmentAmount(type, totals[type])
    const periodRows = (allRows ?? []).filter((row) => {
      if (row.employeeId !== employeeId) return false
      if (row.type !== type) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      return true
    })
    const adjSum = periodRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
    const oldDisplayed = displayedTotals && Object.prototype.hasOwnProperty.call(displayedTotals, type)
      ? Number(displayedTotals[type] ?? 0)
      : adjSum

    if (oldDisplayed === targetDisplayed) {
      results.push({ action: 'unchanged', type, oldTotal: oldDisplayed, newTotal: targetDisplayed })
      continue
    }

    const adjTarget = targetDisplayed

    for (const record of periodRows) {
      if (Number(record.amount ?? 0) === 0) continue
      await editPayrollAdjustment(record, {
        amount: 0,
        note: record.note,
        reason,
      }, locks)
    }

    let createdId = null
    if (adjTarget !== 0) {
      const saved = await addPayrollAdjustment({
        type,
        amount: normalizePayrollAdjustmentAmount(type, adjTarget),
        note: note || '',
        reason,
        date,
        month,
        branchId,
        employeeId,
        employeeName,
        payrollCycle: cycle,
        source: PAYROLL_ADJUSTMENT_SOURCES.MANUAL,
        category: PAYROLL_PENALTY_CATEGORIES.OTHER,
      }, locks)
      createdId = saved.id
    }

    const netImpact = netSalaryImpactForFieldSet(type, oldDisplayed, targetDisplayed)

    const field = buildPayrollFieldAuditValues({
      employeeId,
      employeeName,
      branchId,
      month,
      cycle,
      fieldChanged: type,
      oldValue: oldDisplayed,
      newValue: targetDisplayed,
      difference: netImpact,
      extra: {
        note: note || '',
        setOfficialTotal: true,
      },
    })
    await writeAuditLog({
      entityType: 'payroll_field',
      entityId: employeeId,
      action: 'set_field_total',
      ...field,
      reason,
    })
    results.push({
      action: 'set_total',
      type,
      oldTotal: oldDisplayed,
      newTotal: targetDisplayed,
      netImpact,
      laborCostDelta: netImpact,
      profitDelta: -netImpact,
      adjustmentId: createdId,
    })
  }

  const changed = results.filter((row) => row.action === 'set_total')
  if (changed.length) {
    const totalNetImpact = previewImpact?.netDelta
      ?? changed.reduce((sum, row) => sum + Number(row.netImpact || 0), 0)
    const laborCostDelta = previewImpact?.laborCostDelta ?? totalNetImpact
    const profitDelta = previewImpact?.profitDelta ?? -totalNetImpact
    await writeAuditLog({
      entityType: 'payroll_board',
      entityId: employeeId,
      action: 'admin_edit_board',
      oldValue: {
        fields: changed.map((row) => ({ type: row.type, value: row.oldTotal })),
        netSalary: previewImpact?.currentNet,
      },
      newValue: {
        fields: changed.map((row) => ({
          type: row.type,
          value: row.newTotal,
          netImpact: row.netImpact,
          laborCostDelta: row.laborCostDelta,
          profitDelta: row.profitDelta,
        })),
        netSalary: previewImpact?.nextNet,
        netDelta: totalNetImpact,
        laborCostDelta,
        profitDelta,
        difference: totalNetImpact,
      },
      reason,
    })
  }

  return results
}

/**
 * Admin — đặt tổng KPI kỳ về một giá trị (dương / âm / 0).
 * Không xóa lịch sử: nếu cần, thêm dòng KPI bù (delta) để tổng = target.
 */
export async function setAdminKpiAmount(payload, locks = null) {
  assertCanAdminEditPayroll()
  const target = Number(payload.amount)
  if (!Number.isFinite(target)) {
    throw new Error('Số KPI không hợp lệ.')
  }
  if (!String(payload.reason || '').trim()) {
    throw new Error('Lý do là bắt buộc.')
  }
  await assertMonthEditable(payload.month, payload.branchId, locks)

  const fromDate = payload.fromDate || ''
  const toDate = payload.toDate || ''
  const rows = (payload.existingAdjustments ?? await fetchPayrollAdjustments({
    month: payload.month,
    employeeId: payload.employeeId,
  })).filter((row) => {
    if (row.employeeId !== payload.employeeId) return false
    if (row.type !== PAYROLL_ADJUSTMENT_TYPES.KPI) return false
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    return true
  })

  const oldKpi = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const difference = target - oldKpi
  let adjustment = null

  if (difference !== 0) {
    adjustment = await addPayrollAdjustment({
      type: PAYROLL_ADJUSTMENT_TYPES.KPI,
      amount: difference,
      note: payload.note?.trim?.() || (target === 0 ? 'Đưa KPI về 0' : ''),
      reason: payload.reason,
      date: payload.date || toDate || `${payload.month}-15`,
      month: payload.month,
      branchId: payload.branchId,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      payrollCycle: payload.payrollCycle || payload.cycle || '',
    }, locks)
  }

  const field = buildPayrollFieldAuditValues({
    employeeId: payload.employeeId,
    employeeName: payload.employeeName,
    branchId: payload.branchId,
    month: payload.month,
    cycle: payload.payrollCycle || payload.cycle || '',
    fieldChanged: 'kpi',
    oldValue: oldKpi,
    newValue: target,
    difference,
    extra: { adjustmentId: adjustment?.id || null, note: payload.note || '' },
  })
  await writeAuditLog({
    entityType: 'payroll_field',
    entityId: payload.employeeId,
    action: 'set_kpi',
    ...field,
    reason: payload.reason,
  })

  return { oldKpi, newKpi: target, difference, adjustment }
}

/** @deprecated Dùng setAdminKpiAmount — giữ alias để không gãy import cũ. */
export async function addAdminKpiAdjustment(payload, locks = null) {
  return setAdminKpiAmount(payload, locks)
}

export async function lockPayrollMonth({ month, branchId = '', note = '' }) {
  if (!isAdmin()) throw new Error('Chỉ Admin được chốt lương.')
  const { editorId, editorName } = currentEditor()
  const record = {
    id: createPayrollLockId(month, branchId),
    month,
    branchId: branchId ?? '',
    isLocked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: editorId,
    lockedByName: editorName,
    unlockedAt: null,
    unlockedBy: '',
    unlockedByName: '',
    note: note ?? '',
  }
  const saved = await upsertPayrollLock(record)
  await writeAuditLog({
    entityType: 'payroll_lock',
    entityId: saved.id,
    action: 'lock',
    oldValue: { isLocked: false },
    newValue: saved,
    reason: note,
  })
  return saved
}

export async function unlockPayrollMonth({ month, branchId = '', reason = '' }) {
  if (!isAdmin()) throw new Error('Chỉ Admin được mở khóa lương.')
  const { editorId, editorName } = currentEditor()
  const record = {
    id: createPayrollLockId(month, branchId),
    month,
    branchId: branchId ?? '',
    isLocked: false,
    unlockedAt: new Date().toISOString(),
    unlockedBy: editorId,
    unlockedByName: editorName,
    note: reason ?? '',
  }
  const saved = await upsertPayrollLock(record)
  await writeAuditLog({
    entityType: 'payroll_lock',
    entityId: saved.id,
    action: 'unlock',
    oldValue: { isLocked: true },
    newValue: saved,
    reason,
  })
  return saved
}

export async function recordPayrollPayment({ month, branchId, employeeId, employeeName, amount, date, note = '' }, locks = null) {
  return addPayrollAdjustment({
    month,
    branchId,
    employeeId,
    employeeName,
    type: PAYROLL_ADJUSTMENT_TYPES.PAYMENT,
    amount,
    date: date ?? `${month}-28`,
    reason: 'Thanh toán lương',
    note,
  }, locks)
}

export function canViewEmployeePayroll(employeeId, employeeBranchId) {
  if (isAdmin()) return true
  if (isEmployee()) return employeeId === getCurrentUserEmployeeId()
  const userBranch = getCurrentUser()?.branch ?? ''
  return employeeBranchId === userBranch
}

export async function fetchAdjustmentsForMonth(month, branchId = '', employeeId = '') {
  return fetchPayrollAdjustments({ month, branchId, employeeId })
}
