import {
  KPI_NEAR_TARGET_GAP_PP,
  KPI_PENALTY_KEYS,
  OCT2026_KPI_EFFECTIVE_FROM,
} from '../constants/kpiPolicy'
import { CLOSE_CYCLE_STATUS } from './payrollCycleClose/closeCycleStatus'

export const KPI_PENALTY_REVIEW_ACTOR_ID = 'admin'

export const KPI_REVIEW_STATUS_LABELS = {
  none: 'Chưa xét',
  kept: 'Giữ phạt gốc',
  reduced: 'Đã giảm',
  waived: 'Đã miễn',
}

function isoDate(value) {
  return String(value || '').slice(0, 10)
}

export function matchKpiPenaltyReview(reviews, {
  employeeId = '',
  periodFrom = '',
  periodTo = '',
  kpiCategory = '',
} = {}) {
  const matches = (reviews || []).filter((row) => (
    String(row?.employeeId || row?.employee_id || '') === String(employeeId || '')
    && isoDate(row?.periodFrom || row?.period_from) === isoDate(periodFrom)
    && isoDate(row?.periodTo || row?.period_to) === isoDate(periodTo)
    && String(row?.kpiCategory || row?.kpi_category || '') === String(kpiCategory || '')
  ))
  if (!matches.length) return null
  matches.sort((a, b) => String(b.updatedAt || b.updated_at || b.createdAt || b.created_at || '')
    .localeCompare(String(a.updatedAt || a.updated_at || a.createdAt || a.created_at || '')))
  return matches[0]
}

/** Không có quyết định, hoặc quyết định không hợp lệ → giữ số thiếu gốc. */
export function resolveChargeableMissing(originalMissing, review) {
  const original = Math.max(0, Math.trunc(Number(originalMissing) || 0))
  if (!review) return original
  const approved = Number(review.approvedMissing ?? review.approved_missing)
  if (!Number.isInteger(approved)) return original
  if (approved < 0 || approved > original) return original
  return approved
}

export function validateKpiPenaltyReviewDecision({
  employeeId = '',
  periodFrom = '',
  periodTo = '',
  kpiCategory = '',
  originalMissing,
  approvedMissing,
  gapPercentagePoints,
  reason = '',
  adminPassword = '',
  closeStatus = '',
} = {}) {
  const errors = []
  if (!String(adminPassword || '').trim()) {
    errors.push('Cần mật khẩu Admin để duyệt miễn/giảm phạt KPI.')
  }
  const from = isoDate(periodFrom)
  const to = isoDate(periodTo)
  if (!from || !to || from < OCT2026_KPI_EFFECTIVE_FROM || to < OCT2026_KPI_EFFECTIVE_FROM) {
    errors.push('Không miễn/giảm phạt KPI cho kỳ trước 01/10/2026.')
  }
  if (!KPI_PENALTY_KEYS.includes(kpiCategory)) {
    errors.push('Nhóm KPI không hợp lệ.')
  }
  const gap = Number(gapPercentagePoints)
  if (!Number.isFinite(gap) || !(gap > 0 && gap < KPI_NEAR_TARGET_GAP_PP)) {
    errors.push('Chỉ nhóm KPI thiếu dưới 5 điểm phần trăm mới được xét miễn/giảm.')
  }
  const original = Number(originalMissing)
  const approved = Number(approvedMissing)
  if (!Number.isInteger(original) || original <= 0) {
    errors.push('Số thiếu gốc phải là số nguyên dương.')
  }
  if (!Number.isInteger(approved) || approved < 0 || (Number.isInteger(original) && approved > original)) {
    errors.push('Số thiếu được duyệt phải là số nguyên từ 0 đến số thiếu gốc.')
  }
  if (!String(reason || '').trim()) {
    errors.push('Cần ghi lý do miễn/giảm.')
  }
  if (!employeeId) errors.push('Thiếu nhân viên.')
  if (closeStatus === CLOSE_CYCLE_STATUS.APPROVED) {
    errors.push('Kỳ lương đã duyệt — không đổi miễn/giảm phạt KPI.')
  }
  return { ok: errors.length === 0, errors }
}

export function reviewStatusFromQuantities(originalMissing, approvedMissing) {
  const original = Math.trunc(Number(originalMissing) || 0)
  const approved = Math.trunc(Number(approvedMissing) || 0)
  if (original <= 0 || approved === original) return 'kept'
  if (approved === 0) return 'waived'
  return 'reduced'
}
