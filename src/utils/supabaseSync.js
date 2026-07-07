import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { collectAllData } from './dataBackup'

import { countBranches, fetchBranches, upsertBranches } from '../repositories/branchesRepository'
import {
  countEmployees,
  fetchEmployees,
  upsertEmployees,
} from '../repositories/employeesRepository'
import { fetchInvoices, upsertInvoices } from '../repositories/invoicesRepository'
import { fetchExpenses, upsertExpenses } from '../repositories/expensesRepository'
import { fetchServices, upsertServices } from '../repositories/servicesRepository'
import {
  fetchBranchPricingMap,
  upsertBranchPricingMap,
} from '../repositories/branchPricingRepository'
import { fetchCredentials, upsertCredentials } from '../repositories/credentialsRepository'
import { fetchPermissions, upsertPermissions } from '../repositories/permissionsRepository'
import { fetchSettings, upsertSettings } from '../repositories/settingsRepository'

import { loadBranches, normalizeBranch, saveBranches } from './branchStorage'
import { loadEmployees, normalizeEmployee, saveEmployees } from './employeeStorage'
import { loadInvoices, replaceAllInvoices } from './invoiceStorage'
import { loadExpenses, normalizeExpense, saveExpenses } from './expenseStorage'
import { loadServices, normalizeService, saveServices } from './serviceStorage'
import { loadBranchPricingMap, saveBranchPricingMap } from './branchPricingStorage'
import { loadCredentials, saveCredentials } from './credentialsStorage'
import { loadPermissions, savePermissions } from './permissionsStorage'
import { loadSystemSettings, saveSystemSettings } from './systemSettingsStorage'

const MIGRATION_FLAG_KEY = 'spa-manager-supabase-migrated-v1'
const SYNC_EVENT = 'spa-manager:data-synced'
// Realtime lo phần "gần như tức thời"; interval này chỉ là lưới an toàn dự
// phòng khi kênh Realtime bị rớt (mất mạng, hết phiên...).
const DEFAULT_SYNC_INTERVAL_MS = 30000
// Các bảng bật Realtime — khi có thay đổi (thiết bị khác ghi lên Supabase),
// kéo lại dữ liệu gần như ngay lập tức thay vì chờ tới vòng polling kế tiếp.
const REALTIME_TABLES = ['branches', 'employees', 'services', 'branch_pricing', 'invoices', 'expenses']
const REALTIME_DEBOUNCE_MS = 400

let syncTimerId = null
let syncInFlight = false
let realtimeChannel = null
let realtimeDebounceTimer = null

// -------------------- Event bus (thông báo UI khi có dữ liệu mới) --------------------

function notifyDataSynced(changedEntities) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { changedEntities } }))
}

/** Trả về hàm huỷ đăng ký. Dùng trong useEffect của các trang cần tự làm mới dữ liệu. */
export function subscribeToDataSync(callback) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event) => callback(event.detail)
  window.addEventListener(SYNC_EVENT, handler)
  return () => window.removeEventListener(SYNC_EVENT, handler)
}

// -------------------- Pull: Supabase -> LocalStorage (cache) --------------------

/**
 * Kéo dữ liệu mới nhất từ Supabase về, ghi đè cache LocalStorage của thiết
 * bị hiện tại. Nếu bất kỳ bảng nào lỗi mạng/permission, giữ nguyên cache cũ
 * cho bảng đó (không xoá dữ liệu đang có) và tiếp tục với các bảng khác.
 */
export async function pullAllFromSupabase() {
  if (!isSupabaseConfigured) return { success: false, reason: 'not_configured' }
  if (syncInFlight) return { success: false, reason: 'already_running' }

  syncInFlight = true
  const changed = []
  const errors = []

  const steps = [
    {
      name: 'branches',
      fetch: fetchBranches,
      apply: (data) => saveBranches(data.map(normalizeBranch)),
    },
    {
      name: 'employees',
      fetch: fetchEmployees,
      apply: (data) => saveEmployees(data.map(normalizeEmployee)),
    },
    {
      name: 'services',
      fetch: fetchServices,
      apply: (data) => saveServices(data.map(normalizeService)),
    },
    {
      name: 'branchPricing',
      fetch: fetchBranchPricingMap,
      apply: (data) => saveBranchPricingMap(data),
    },
    {
      name: 'invoices',
      fetch: fetchInvoices,
      apply: (data) => replaceAllInvoices(data),
    },
    {
      name: 'expenses',
      fetch: fetchExpenses,
      apply: (data) => saveExpenses(data.map(normalizeExpense)),
    },
    {
      name: 'credentials',
      fetch: fetchCredentials,
      apply: (data) => saveCredentials(data),
    },
    {
      name: 'permissions',
      fetch: fetchPermissions,
      apply: (data) => savePermissions(data),
    },
    {
      name: 'settings',
      fetch: fetchSettings,
      apply: (data) => saveSystemSettings(data),
    },
  ]

  for (const step of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await step.fetch()
      // `null`: chưa cấu hình (không xảy ra ở đây vì đã kiểm tra ở đầu hàm).
      // Mảng/object rỗng vẫn hợp lệ — nghĩa là Supabase thực sự chưa có dữ
      // liệu, và ta vẫn nên áp dụng (không coi là lỗi rồi bỏ qua).
      if (data !== null && data !== undefined) {
        step.apply(data)
        changed.push(step.name)
      }
    } catch (error) {
      errors.push({ entity: step.name, message: error?.message ?? String(error) })
      console.warn(`[Supabase] Pull "${step.name}" thất bại, giữ nguyên cache cũ:`, error?.message)
    }
  }

  syncInFlight = false

  if (changed.length > 0) {
    notifyDataSynced(changed)
  }

  return { success: errors.length === 0, changed, errors }
}

// -------------------- Push: LocalStorage -> Supabase (migration) --------------------

/**
 * Đẩy toàn bộ dữ liệu hiện có trong LocalStorage của thiết bị này lên
 * Supabase (upsert theo id — an toàn khi chạy lại nhiều lần). Dùng cho lần
 * kết nối Supabase đầu tiên để không mất dữ liệu cũ.
 *
 * Thứ tự đẩy: branches trước (employees/invoices/expenses/branchPricing có
 * khoá ngoại tới branches).
 */
export async function pushLocalToSupabase() {
  if (!isSupabaseConfigured) return { success: false, reason: 'not_configured' }

  const snapshot = collectAllData()
  const errors = []

  const tasks = [
    ['branches', () => upsertBranches(snapshot.branches)],
    ['services', () => upsertServices(snapshot.services)],
    ['branchPricing', () => upsertBranchPricingMap(snapshot.branchPricing)],
    ['employees', () => upsertEmployees(snapshot.employees)],
    ['invoices', () => upsertInvoices(snapshot.invoices)],
    ['expenses', () => upsertExpenses(snapshot.expenses)],
    ['credentials', () => upsertCredentials(snapshot.credentials)],
    ['permissions', () => upsertPermissions(snapshot.permissions)],
    ['settings', () => upsertSettings(snapshot.systemSettings)],
  ]

  for (const [name, task] of tasks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await task()
    } catch (error) {
      errors.push({ entity: name, message: error?.message ?? String(error) })
      console.warn(`[Supabase] Đồng bộ "${name}" lên máy chủ thất bại:`, error?.message)
    }
  }

  return { success: errors.length === 0, errors }
}

/** Đẩy dữ liệu LocalStorage hiện có lên Supabase — gọi thủ công (vd. từ console) khi cần đồng bộ lại toàn bộ. */
export async function forcePushLocalToSupabase() {
  const result = await pushLocalToSupabase()
  if (result.success) {
    markMigrationDone()
  }
  return result
}

// -------------------- Auto-migrate lần đầu kết nối Supabase --------------------

function hasMigratedToSupabase() {
  try {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true'
  } catch {
    return false
  }
}

function markMigrationDone() {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
  } catch {
    // bỏ qua — không có localStorage cũng không sao, chỉ ảnh hưởng lần chạy lại migration
  }
}

async function isRemoteDataEmpty() {
  try {
    const [branchCount, employeeCount] = await Promise.all([countBranches(), countEmployees()])
    return branchCount === 0 && employeeCount === 0
  } catch {
    // Không xác định được — thận trọng, coi như KHÔNG rỗng để tránh ghi đè nhầm.
    return false
  }
}

/**
 * Chạy một lần khi ứng dụng khởi động (nếu Supabase đã cấu hình):
 * - Nếu Supabase đang trống (project mới) và thiết bị này chưa từng
 *   migrate: coi đây là "nguồn dữ liệu gốc", đẩy toàn bộ LocalStorage lên.
 * - Nếu Supabase đã có dữ liệu (do thiết bị khác/lần trước đã seed): KHÔNG
 *   ghi đè, chỉ đánh dấu đã xử lý và để pullAllFromSupabase() kéo dữ liệu
 *   chung về.
 */
export async function autoMigrateIfNeeded() {
  if (!isSupabaseConfigured) return { success: false, reason: 'not_configured' }
  if (hasMigratedToSupabase()) return { success: true, skipped: true }

  const remoteEmpty = await isRemoteDataEmpty()
  if (remoteEmpty) {
    const result = await pushLocalToSupabase()
    if (!result.success) {
      console.warn('[Supabase] Tự động đồng bộ dữ liệu cũ lên Supabase gặp lỗi:', result.errors)
      return result
    }
  }

  markMigrationDone()
  return { success: true, seeded: remoteEmpty }
}

// -------------------- Realtime (postgres_changes) --------------------

function scheduleRealtimePull() {
  if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer)
  realtimeDebounceTimer = setTimeout(() => {
    realtimeDebounceTimer = null
    pullAllFromSupabase()
  }, REALTIME_DEBOUNCE_MS)
}

/**
 * Lắng nghe thay đổi trực tiếp từ Postgres (Supabase Realtime) trên các
 * bảng chính. Khi thiết bị khác thêm/sửa/xoá dữ liệu, kéo lại gần như ngay
 * lập tức thay vì chờ vòng polling kế tiếp. Yêu cầu bảng đã được thêm vào
 * publication `supabase_realtime` (xem migration 0002).
 */
function startRealtimeSubscriptions() {
  if (!isSupabaseConfigured || !supabase || realtimeChannel) return

  let channel = supabase.channel('spa-manager-realtime')
  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      scheduleRealtimePull,
    )
  }

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(
        '[Supabase] Realtime channel gặp sự cố (có thể do chưa bật Realtime cho bảng trong migration 0002) — vẫn dùng polling định kỳ làm dự phòng.',
      )
    }
  })

  realtimeChannel = channel
}

function stopRealtimeSubscriptions() {
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel)
  }
  realtimeChannel = null
  if (realtimeDebounceTimer) {
    clearTimeout(realtimeDebounceTimer)
    realtimeDebounceTimer = null
  }
}

// -------------------- Khởi động lần đầu (chặn màn hình loading) --------------------

/**
 * Gọi 1 lần lúc App khởi động, TRƯỚC khi render trang: migrate dữ liệu cũ
 * lên Supabase nếu cần, rồi kéo dữ liệu mới nhất về — đảm bảo Supabase luôn
 * là nguồn dữ liệu "vừa mở app là thấy" trên mọi thiết bị. Có timeout để
 * mất mạng/Supabase chậm cũng không treo màn hình loading vô hạn — khi đó
 * ứng dụng chạy tạm bằng cache LocalStorage rồi realtime/polling sẽ tự bù.
 */
export async function runInitialSync({ timeoutMs = 8000 } = {}) {
  if (!isSupabaseConfigured) return { success: false, reason: 'not_configured' }

  const work = autoMigrateIfNeeded()
    .catch((error) => console.warn('[Supabase] autoMigrateIfNeeded lỗi:', error?.message))
    .then(() => pullAllFromSupabase())

  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ success: false, reason: 'timeout' }), timeoutMs),
  )

  return Promise.race([work, timeout])
}

// -------------------- Auto-sync theo chu kỳ (Realtime + polling dự phòng) --------------------

/**
 * Khởi động đồng bộ liên tục: Realtime để cập nhật gần như tức thời +
 * polling định kỳ làm lưới an toàn. Không làm gì nếu Supabase chưa cấu
 * hình. Trả về hàm dừng đồng bộ (gọi khi unmount).
 */
export function startAutoSync({ intervalMs = DEFAULT_SYNC_INTERVAL_MS, skipInitialPull = false } = {}) {
  if (!isSupabaseConfigured) return () => {}
  if (syncTimerId || realtimeChannel) return stopAutoSync

  if (!skipInitialPull) {
    autoMigrateIfNeeded()
      .catch((error) => console.warn('[Supabase] autoMigrateIfNeeded lỗi:', error?.message))
      .finally(() => {
        pullAllFromSupabase()
      })
  }

  startRealtimeSubscriptions()

  syncTimerId = setInterval(() => {
    pullAllFromSupabase()
  }, intervalMs)

  return stopAutoSync
}

export function stopAutoSync() {
  if (syncTimerId) {
    clearInterval(syncTimerId)
    syncTimerId = null
  }
  stopRealtimeSubscriptions()
}

// Re-export tiện dùng khi cần đọc nhanh dữ liệu local hiện có (vd. hiển thị
// tiến trình migration trên UI trong tương lai nếu cần).
export function getLocalSnapshotSummary() {
  return {
    branches: loadBranches().length,
    employees: loadEmployees().length,
    invoices: loadInvoices().length,
    expenses: loadExpenses().length,
    services: loadServices().length,
    branchPricing: Object.keys(loadBranchPricingMap()).length,
    hasCredentials: Boolean(loadCredentials()),
    hasPermissions: Boolean(loadPermissions()),
    hasSettings: Boolean(loadSystemSettings()),
  }
}
