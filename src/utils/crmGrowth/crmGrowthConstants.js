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

export const HEALTH_WEIGHTS = {
  frequency: 0.30,
  recency: 0.25,
  ltv: 0.20,
  visits: 0.15,
  requested: 0.10,
}

export const HEALTH_GRADES = {
  VIP: { min: 95, max: 100, id: 'vip', label: 'VIP' },
  EXCELLENT: { min: 80, max: 94, id: 'excellent', label: 'Rất tốt' },
  NORMAL: { min: 60, max: 79, id: 'normal', label: 'Bình thường' },
  AT_RISK: { min: 40, max: 59, id: 'at_risk', label: 'Có nguy cơ' },
  CRITICAL: { min: 0, max: 39, id: 'critical', label: 'Nguy cơ mất' },
}

export const RETENTION_BUCKETS = {
  DAYS_45: 'retention_45',
  DAYS_60: 'retention_60',
  DAYS_90: 'retention_90',
}

export const RETENTION_BUCKET_LABELS = {
  [RETENTION_BUCKETS.DAYS_45]: '45 ngày chưa quay lại',
  [RETENTION_BUCKETS.DAYS_60]: '60 ngày chưa quay lại',
  [RETENTION_BUCKETS.DAYS_90]: '90 ngày chưa quay lại',
}

export const TIMELINE_EVENT_TYPES = {
  FIRST_VISIT: 'first_visit',
  INVOICE: 'invoice',
  CARE_NOTE: 'care_note',
  FOLLOW_UP: 'follow_up',
}

export const TIMELINE_EVENT_LABELS = {
  [TIMELINE_EVENT_TYPES.FIRST_VISIT]: 'Lần đầu đến',
  [TIMELINE_EVENT_TYPES.INVOICE]: 'Hóa đơn',
  [TIMELINE_EVENT_TYPES.CARE_NOTE]: 'Ghi chú chăm sóc',
  [TIMELINE_EVENT_TYPES.FOLLOW_UP]: 'Ngày liên hệ lại',
}

export const NEW_VIP_MAX_FIRST_VISIT_DAYS = 30
