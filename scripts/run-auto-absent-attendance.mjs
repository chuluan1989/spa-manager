/**
 * Nightly / manual: tự ghi nhận nghỉ không phép khi không chấm công.
 *
 * Cron & Admin dùng chung createAutoAbsentRecordsForDate / runAutoAbsentNightlyJob.
 *
 * Chạy thủ công (local):
 *   AUTO_ABSENT_REQUIRE_SERVICE_ROLE=1 \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx vite-node scripts/run-auto-absent-attendance.mjs --dry-run
 *
 *   npx vite-node scripts/run-auto-absent-attendance.mjs --date=2026-07-16
 *
 * Env bắt buộc khi CI / cron:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Không dùng VITE_ / ANON key cho cron ghi dữ liệu.
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { ATTENDANCE_STATUS } from '../src/constants/attendanceTypes.js'
import {
  getPreviousIctDate,
  resolveAutoAbsentSettings,
} from '../src/utils/autoAbsentAttendance.js'
import { resolveAutoAbsentCredentials } from '../src/utils/autoAbsentCredentials.js'
import { runAutoAbsentNightlyJob } from '../src/utils/autoAbsentAttendanceService.js'
import { getMonthPrefixFromDate } from '../src/utils/attendancePenalties.js'

const args = process.argv.slice(2)
const dateArg = args.find((item) => item.startsWith('--date='))?.slice('--date='.length) || ''
const dryRun = args.includes('--dry-run')
const requireServiceRole = process.env.AUTO_ABSENT_REQUIRE_SERVICE_ROLE === '1'
  || process.env.CI === 'true'
  || process.env.GITHUB_ACTIONS === 'true'

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function resolveCredentials() {
  const result = resolveAutoAbsentCredentials(process.env, { dryRun, requireServiceRole })
  if (!result.ok) throw new Error(result.error)
  return result
}

function createServiceAdapters(sb) {
  return {
    async fetchByEmployeeAndDate(employeeId, date) {
      const { data, error } = await sb
        .from('attendance')
        .select('id,employee_id,attendance_date,status,created_by,reason')
        .eq('employee_id', employeeId)
        .eq('attendance_date', date)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        id: data.id,
        employeeId: data.employee_id,
        date: data.attendance_date,
        status: data.status,
        createdBy: data.created_by,
        reason: data.reason,
      }
    },
    async fetchMonthRecords(employeeId, monthPrefix) {
      const { data, error } = await sb
        .from('attendance')
        .select('status,attendance_date')
        .eq('employee_id', employeeId)
        .gte('attendance_date', `${monthPrefix}-01`)
        .lte('attendance_date', `${monthPrefix}-31`)
      if (error) throw error
      return (data ?? []).map((row) => ({
        status: row.status,
        date: row.attendance_date,
      }))
    },
    async insertRecord(record) {
      const row = {
        id: record.id,
        employee_id: record.employeeId,
        branch_id: record.branchId || null,
        attendance_date: record.date,
        status: record.status || ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
        reason: record.reason || '',
        penalty_amount: Number(record.penaltyAmount ?? 0),
        created_at: record.submittedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: record.createdBy || 'system',
      }
      const { error } = await sb.from('attendance').insert(row)
      if (error) throw error
      return record
    },
    async insertLogs(logs) {
      if (!Array.isArray(logs) || logs.length === 0) return
      const rows = logs.map((log) => ({
        id: log.id,
        attendance_id: log.attendanceId,
        editor_id: log.editorId || 'system',
        editor_name: log.editorName || 'Hệ thống',
        field_name: log.fieldName || 'create',
        old_value: log.oldValue ?? '',
        new_value: log.newValue ?? '',
        note: log.note ?? '',
      }))
      const { error } = await sb.from('attendance_edit_logs').insert(rows)
      if (error) {
        console.warn('[auto-absent] Không ghi được edit log (attendance vẫn đã tạo):', error.message)
      }
    },
    createId: () => createId('att'),
    createLogId: () => createId('attlog'),
    afterSuccess: () => {},
  }
}

async function loadEmployeesAndBranches(sb) {
  const { data: branches, error: branchErr } = await sb.from('branches').select('id,status')
  if (branchErr) throw branchErr
  const activeBranchIds = (branches ?? [])
    .filter((row) => !row.status || String(row.status).toLowerCase() === 'active')
    .map((row) => row.id)

  const { data: employees, error: empErr } = await sb
    .from('employees')
    .select('id,branch_id,name,status,start_date,days_off')
  if (empErr) throw empErr

  const mapped = (employees ?? []).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    status: row.status,
    startDate: row.start_date ?? '',
    endDate: row.days_off ?? '',
  }))

  return { employees: mapped, activeBranchIds }
}

async function main() {
  let credentials
  try {
    credentials = resolveCredentials()
  } catch (error) {
    console.error(`FAIL: ${error.message}`)
    process.exit(1)
  }

  // Không bao giờ in key.
  console.log(`\nAuto-absent attendance`)
  console.log(`  credentials: ${credentials.source}`)
  console.log(`  dryRun: ${dryRun}`)
  console.log(`  requireServiceRole: ${requireServiceRole}`)

  const sb = createClient(credentials.url, credentials.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: settingsRow, error: settingsErr } = await sb
    .from('app_settings')
    .select('payload')
    .eq('id', 'singleton')
    .maybeSingle()
  if (settingsErr) {
    console.error(`FAIL: Không đọc được app_settings — ${settingsErr.message}`)
    process.exit(1)
  }

  const settings = resolveAutoAbsentSettings(settingsRow?.payload ?? {})
  const targetDate = dateArg || getPreviousIctDate()
  console.log(`  targetDate (ICT yesterday/default): ${targetDate}`)
  console.log(`  enabled=${settings.autoAbsentEnabled} applyFrom=${settings.autoAbsentApplyFrom}`)

  let employees
  let activeBranchIds
  try {
    ;({ employees, activeBranchIds } = await loadEmployeesAndBranches(sb))
  } catch (error) {
    console.error(`FAIL: Không tải employees/branches — ${error.message}`)
    process.exit(1)
  }

  const result = await runAutoAbsentNightlyJob({
    settings,
    employees,
    activeBranchIds,
    dryRun,
    targetDate,
    adapters: createServiceAdapters(sb),
  })

  const summary = {
    targetDate: result.targetDate,
    dryRun,
    gateReason: result.gateReason || '',
    created: result.created,
    skipped: result.skipped,
    errors: result.errors,
    details: result.details,
    monthHint: getMonthPrefixFromDate(result.targetDate),
  }
  writeFileSync('tmp-auto-absent-result.json', JSON.stringify(summary, null, 2))

  if (result.gateReason) {
    console.log(`Skip (no create): ${result.gateReason}`)
  }
  console.log(`Done: created=${result.created} skipped=${result.skipped} errors=${result.errors}${dryRun ? ' (dry-run)' : ''}`)
  console.log('Chi tiết: tmp-auto-absent-result.json\n')

  // Lỗi từng NV đã được ghi trong details; chỉ fail process nếu credentials/DB lỗi tổng.
  // errors > 0 vẫn exit 0 nếu có ít nhất một phần chạy (tiếp tục batch) — trừ khi toàn bộ lỗi lookup.
  if (!result.gateReason && result.errors > 0 && result.created === 0 && result.skipped === result.errors) {
    console.error('FAIL: Tất cả nhân viên đều lỗi khi xử lý.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error?.message ?? error}`)
  process.exit(1)
})
