export const ATTENDANCE_STATUS = {
  ON_TIME: 'on_time',
  LATE_2H_PERMITTED: 'late_2h_permitted',
  LATE_2H_UNPERMITTED: 'late_2h_unpermitted',
  EARLY_2H_PERMITTED: 'early_2h_permitted',
  EARLY_2H_UNPERMITTED: 'early_2h_unpermitted',
  HALF_MORNING_PERMITTED: 'half_morning_permitted',
  HALF_MORNING_UNPERMITTED: 'half_morning_unpermitted',
  HALF_EVENING_PERMITTED: 'half_evening_permitted',
  HALF_EVENING_UNPERMITTED: 'half_evening_unpermitted',
  FULL_DAY_PERMITTED: 'full_day_permitted',
  FULL_DAY_UNPERMITTED: 'full_day_unpermitted',
  FULL_DAY_WEEKEND: 'full_day_weekend',
  HALF_MORNING_WEEKEND: 'half_morning_weekend',
  HALF_EVENING_WEEKEND: 'half_evening_weekend',
}

/** Cấu hình trừ tiền: none | fixed | monthly_free */
export const ATTENDANCE_STATUS_OPTIONS = [
  { id: ATTENDANCE_STATUS.ON_TIME, label: 'Đi làm đúng giờ', statGroup: 'on_time', penaltyType: 'none' },
  { id: ATTENDANCE_STATUS.LATE_2H_PERMITTED, label: 'Đi trễ 2 tiếng (Có phép)', statGroup: 'late_permitted', penaltyType: 'none' },
  { id: ATTENDANCE_STATUS.LATE_2H_UNPERMITTED, label: 'Đi trễ 2 tiếng (Không phép)', statGroup: 'late', penaltyType: 'fixed', penaltyAmount: 20000 },
  { id: ATTENDANCE_STATUS.EARLY_2H_PERMITTED, label: 'Về sớm 2 tiếng (Có phép)', statGroup: 'early_permitted', penaltyType: 'none' },
  { id: ATTENDANCE_STATUS.EARLY_2H_UNPERMITTED, label: 'Về sớm 2 tiếng (Không phép)', statGroup: 'early', penaltyType: 'fixed', penaltyAmount: 20000 },
  { id: ATTENDANCE_STATUS.HALF_MORNING_PERMITTED, label: 'Nghỉ 1/2 buổi sáng (Có phép)', statGroup: 'half_off_permitted', penaltyType: 'monthly_free', freePerMonth: 3, penaltyAmount: 50000 },
  { id: ATTENDANCE_STATUS.HALF_MORNING_UNPERMITTED, label: 'Nghỉ 1/2 buổi sáng (Không phép)', statGroup: 'half_off_unpermitted', penaltyType: 'fixed', penaltyAmount: 50000 },
  { id: ATTENDANCE_STATUS.HALF_EVENING_PERMITTED, label: 'Nghỉ 1/2 buổi tối (Có phép)', statGroup: 'half_off_permitted', penaltyType: 'monthly_free', freePerMonth: 3, penaltyAmount: 50000 },
  { id: ATTENDANCE_STATUS.HALF_EVENING_UNPERMITTED, label: 'Nghỉ 1/2 buổi tối (Không phép)', statGroup: 'half_off_unpermitted', penaltyType: 'fixed', penaltyAmount: 50000 },
  { id: ATTENDANCE_STATUS.FULL_DAY_PERMITTED, label: 'Nghỉ nguyên ngày (Có phép)', statGroup: 'full_off_permitted', penaltyType: 'monthly_free', freePerMonth: 3, penaltyAmount: 100000 },
  { id: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED, label: 'Nghỉ nguyên ngày (Không phép)', statGroup: 'full_off_unpermitted', penaltyType: 'fixed', penaltyAmount: 100000 },
  { id: ATTENDANCE_STATUS.FULL_DAY_WEEKEND, label: 'Nghỉ nguyên ngày (Thứ 7 - Chủ nhật - Lễ)', statGroup: 'weekend', penaltyType: 'fixed', penaltyAmount: 200000 },
  { id: ATTENDANCE_STATUS.HALF_MORNING_WEEKEND, label: 'Nghỉ 1/2 buổi sáng (Thứ 7 - Chủ nhật - Lễ)', statGroup: 'weekend', penaltyType: 'fixed', penaltyAmount: 100000 },
  { id: ATTENDANCE_STATUS.HALF_EVENING_WEEKEND, label: 'Nghỉ 1/2 buổi tối (Thứ 7 - Chủ nhật - Lễ)', statGroup: 'weekend', penaltyType: 'fixed', penaltyAmount: 100000 },
]

export function getAttendanceStatusLabel(statusId) {
  return ATTENDANCE_STATUS_OPTIONS.find((item) => item.id === statusId)?.label ?? statusId ?? '—'
}

export function getAttendanceStatusConfig(statusId) {
  return ATTENDANCE_STATUS_OPTIONS.find((item) => item.id === statusId) ?? null
}
