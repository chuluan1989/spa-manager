export const CUSTOMER_SEGMENTS = {
  NEW: 'new',
  LOYAL: 'loyal',
  VIP: 'vip',
  AT_RISK: 'at_risk',
  DORMANT: 'dormant',
}

export const CUSTOMER_SEGMENT_LABELS = {
  [CUSTOMER_SEGMENTS.NEW]: 'Khách mới',
  [CUSTOMER_SEGMENTS.LOYAL]: 'Khách trung thành',
  [CUSTOMER_SEGMENTS.VIP]: 'Khách VIP',
  [CUSTOMER_SEGMENTS.AT_RISK]: 'Có nguy cơ rời bỏ',
  [CUSTOMER_SEGMENTS.DORMANT]: 'Lâu chưa quay lại',
}

export const CUSTOMER_SEGMENT_BADGES = {
  [CUSTOMER_SEGMENTS.NEW]: '🟢',
  [CUSTOMER_SEGMENTS.LOYAL]: '🔵',
  [CUSTOMER_SEGMENTS.VIP]: '🟡',
  [CUSTOMER_SEGMENTS.AT_RISK]: '🟠',
  [CUSTOMER_SEGMENTS.DORMANT]: '🔴',
}

export const REMARKETING_LISTS = {
  NEW: 'new',
  LOYAL: 'loyal',
  VIP: 'vip',
  INACTIVE_30: 'inactive30',
  INACTIVE_60: 'inactive60',
  INACTIVE_90: 'inactive90',
  BIRTHDAY: 'birthday',
  AT_RISK: 'at_risk',
  DORMANT: 'dormant',
  CARE_TODAY: 'care_today',
}

export const REMARKETING_LIST_LABELS = {
  [REMARKETING_LISTS.NEW]: 'Khách mới',
  [REMARKETING_LISTS.LOYAL]: 'Khách trung thành',
  [REMARKETING_LISTS.VIP]: 'Khách VIP',
  [REMARKETING_LISTS.INACTIVE_30]: '30 ngày chưa quay lại',
  [REMARKETING_LISTS.INACTIVE_60]: '60 ngày chưa quay lại',
  [REMARKETING_LISTS.INACTIVE_90]: '90 ngày chưa quay lại',
  [REMARKETING_LISTS.BIRTHDAY]: 'Sinh nhật tháng này',
  [REMARKETING_LISTS.AT_RISK]: 'Có nguy cơ rời bỏ',
  [REMARKETING_LISTS.DORMANT]: 'Lâu chưa quay lại',
  [REMARKETING_LISTS.CARE_TODAY]: 'Cần chăm sóc hôm nay',
}
