/** CRM & Customer Growth V1 — rule-based constants (no AI). */

export const GROWTH_THRESHOLDS = {
  dormantDays: 90,
  atRiskMinDays: 45,
  atRiskMaxDays: 89,
  newMaxVisits: 1,
  newMaxIdleDays: 45,
  loyalMinVisits: 3,
  loyalMaxIdleDays: 60,
  vipMinVisitsPerMonth: 2,
}

export const CARE_TODAY_REASONS = {
  DORMANT: 'dormant',
  AT_RISK: 'at_risk',
  BIRTHDAY: 'birthday',
  FOLLOW_UP: 'follow_up',
  INVITE_BACK: 'invite_back',
}

export const CARE_TODAY_LABELS = {
  [CARE_TODAY_REASONS.DORMANT]: 'Lâu chưa quay lại',
  [CARE_TODAY_REASONS.AT_RISK]: 'Có nguy cơ rời bỏ',
  [CARE_TODAY_REASONS.BIRTHDAY]: 'Sinh nhật',
  [CARE_TODAY_REASONS.FOLLOW_UP]: 'Đến hạn follow-up',
  [CARE_TODAY_REASONS.INVITE_BACK]: 'Cần mời quay lại',
}
