/**
 * SoT phạt lương:
 * - Phạt chấm công → chỉ attendance.penaltyAmount
 * - Phạt tay → payroll_adjustments (source=manual, category ≠ attendance-like)
 * Không dedupe mù emp+date+amount.
 */

export const PAYROLL_ADJUSTMENT_SOURCES = {
  MANUAL: 'manual',
  /** Reserved — không tạo adjustment mirror từ attendance. */
  ATTENDANCE: 'attendance',
}

export const PAYROLL_PENALTY_CATEGORIES = {
  CONDUCT: 'conduct',
  SERVICE: 'service',
  HYGIENE: 'hygiene',
  OPERATION: 'operation',
  OTHER: 'other',
}

export const PAYROLL_PENALTY_CATEGORY_LABELS = {
  [PAYROLL_PENALTY_CATEGORIES.CONDUCT]: 'Thái độ / quy định',
  [PAYROLL_PENALTY_CATEGORIES.SERVICE]: 'Phục vụ / làm khách',
  [PAYROLL_PENALTY_CATEGORIES.HYGIENE]: 'Vệ sinh',
  [PAYROLL_PENALTY_CATEGORIES.OPERATION]: 'Vận hành / tài sản',
  [PAYROLL_PENALTY_CATEGORIES.OTHER]: 'Khác (không thuộc chấm công)',
}

/** Category bị cấm khi nhập manual — thuộc Attendance SoT. */
export const BLOCKED_ATTENDANCE_PENALTY_CATEGORIES = Object.freeze([
  'attendance',
  'leave',
  'off',
  'late',
  'early',
  'unpermitted',
  'permitted_over',
  'cham_cong',
])

const ATTENDANCE_MIRROR_TEXT = /nghỉ\s*không\s*phép|nghi\s*khong\s*phep|nghỉ\s*quá\s*phép|nghi\s*qua\s*phep|quá\s*phép|qua\s*phep|phạt\s*off|phat\s*off|\boff\b.*phép|đi\s*trễ|di\s*tre|về\s*sớm|ve\s*som|full_day_unpermitted|half_.*_unpermitted|late_2h|early_2h|chấm\s*công|cham\s*cong|không\s*phép|khong\s*phep/i

export const ATTENDANCE_PENALTY_READONLY_HINT =
  'Phạt chấm công được hệ thống tự động tính từ dữ liệu Chấm công. Không cần nhập lại tại đây.'

export function normalizePenaltySource(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === PAYROLL_ADJUSTMENT_SOURCES.ATTENDANCE) return PAYROLL_ADJUSTMENT_SOURCES.ATTENDANCE
  return PAYROLL_ADJUSTMENT_SOURCES.MANUAL
}

export function normalizePenaltyCategory(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (Object.values(PAYROLL_PENALTY_CATEGORIES).includes(raw)) return raw
  if (BLOCKED_ATTENDANCE_PENALTY_CATEGORIES.includes(raw)) return raw
  return PAYROLL_PENALTY_CATEGORIES.OTHER
}

export function isBlockedAttendancePenaltyCategory(category) {
  return BLOCKED_ATTENDANCE_PENALTY_CATEGORIES.includes(normalizePenaltyCategory(category))
}

/**
 * Phát hiện lý do/ghi chú đang cố mirror lỗi chấm công.
 * @returns {{ blocked: boolean, message?: string }}
 */
export function assertManualPenaltyNotAttendanceMirror({
  type,
  reason = '',
  note = '',
  category = '',
} = {}) {
  if (type && type !== 'penalty') return { blocked: false }

  if (isBlockedAttendancePenaltyCategory(category)) {
    return {
      blocked: true,
      message:
        'Không được nhập phạt tay thuộc loại chấm công (nghỉ / đi trễ / về sớm). Phạt chấm công chỉ tính từ dữ liệu Chấm công.',
    }
  }

  const text = `${reason || ''} ${note || ''}`.trim()
  if (text && ATTENDANCE_MIRROR_TEXT.test(text)) {
    return {
      blocked: true,
      message:
        'Nội dung giống phạt chấm công (nghỉ không phép / quá phép / đi trễ / về sớm / off). Hãy sửa trạng thái Chấm công — không nhập lại tại đây.',
    }
  }

  return { blocked: false }
}

export function looksLikeAttendanceMirrorPenalty(row = {}) {
  const check = assertManualPenaltyNotAttendanceMirror({
    type: row.type || 'penalty',
    reason: row.reason,
    note: row.note,
    category: row.category,
  })
  return check.blocked
}

/** Void reason chuẩn cho đối soát Aug 2026. */
export const VOID_ATTENDANCE_MIRROR_PENALTY_REASON =
  'Hủy phạt off nhập tay do chấm công là nguồn chính thức tính phạt - đối soát Aug 2026'
