/**
 * Resolve credentials for auto-absent cron / CLI.
 * Service role bắt buộc khi requireServiceRole=true (CI / GitHub Actions).
 * Không bao giờ log giá trị key.
 */
export function resolveAutoAbsentCredentials(env = {}, { dryRun = false, requireServiceRole = false } = {}) {
  const url = String(env.SUPABASE_URL || '').trim()
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (requireServiceRole) {
    if (!url) {
      return { ok: false, error: 'Thiếu secret SUPABASE_URL — job không thể chạy.' }
    }
    if (!serviceKey) {
      return { ok: false, error: 'Thiếu secret SUPABASE_SERVICE_ROLE_KEY — job không thể chạy.' }
    }
    return { ok: true, url, key: serviceKey, source: 'service_role' }
  }

  if (url && serviceKey) {
    return { ok: true, url, key: serviceKey, source: 'service_role' }
  }

  if (dryRun && url && anonKey) {
    return { ok: true, url, key: anonKey, source: 'anon_dry_run_only' }
  }

  return {
    ok: false,
    error:
      'Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY để chạy job ghi dữ liệu. '
      + 'Với --dry-run local có thể dùng ANON tạm thời.',
  }
}
