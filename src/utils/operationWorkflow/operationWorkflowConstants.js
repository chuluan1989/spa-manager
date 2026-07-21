/** Operation Workflow V1 — constants & default catalogs (no DB). */

export const OW_STORAGE_KEYS = {
  dailyTasks: 'spa-manager-ow-daily-tasks',
  dailyTargets: 'spa-manager-ow-daily-targets',
  managerNotes: 'spa-manager-ow-manager-notes',
  auditLog: 'spa-manager-ow-audit-log',
  performanceSnapshots: 'spa-manager-ow-performance-history',
}

export const DEFAULT_DAILY_TASKS = [
  { id: 'hygiene', label: 'Kiểm tra vệ sinh' },
  { id: 'towels', label: 'Kiểm tra khăn' },
  { id: 'oils', label: 'Kiểm tra tinh dầu' },
  { id: 'revenue', label: 'Kiểm tra doanh thu' },
  { id: 'tiktok', label: 'Đăng TikTok' },
  { id: 'photo', label: 'Chụp hình khách' },
  { id: 'eod', label: 'Báo cáo cuối ngày' },
]

export const TARGET_METRICS = [
  { key: 'revenue', label: 'Doanh thu' },
  { key: 'customers', label: 'Khách' },
  { key: 'requested', label: 'Khách yêu cầu' },
  { key: 'tips', label: 'Tips' },
]

export const NOTE_PRESETS = [
  'Hôm nay upsell chưa tốt.',
  'Khách phản hồi tích cực.',
  'Cần hỗ trợ.',
  'Làm việc chuyên cần.',
  'Cần cải thiện thái độ phục vụ.',
]

export const AUDIT_ACTIONS = {
  TASK_COMPLETE: 'task_complete',
  TASK_UNDO: 'task_undo',
  TARGET_SET: 'target_set',
  TARGET_CLEAR: 'target_clear',
  NOTE_ADD: 'note_add',
  NOTE_DELETE: 'note_delete',
}

export const PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

export const PRIORITY_LABEL = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
}

export const PRIORITY_ICON = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
}

/** Progress tone thresholds for daily targets. */
export function resolveProgressTone(percent) {
  const p = Number(percent)
  if (!Number.isFinite(p)) return 'neutral'
  if (p >= 100) return 'green'
  if (p >= 70) return 'yellow'
  return 'red'
}
