/**
 * Nightly / manual: tự ghi nhận nghỉ không phép khi không chấm công.
 *
 * Chạy:
 *   npx vite-node scripts/run-auto-absent-attendance.mjs
 *   npx vite-node scripts/run-auto-absent-attendance.mjs --date=2026-07-16
 *   npx vite-node scripts/run-auto-absent-attendance.mjs --dry-run
 *
 * Env (ưu tiên):
 *   SUPABASE_URL / SUPABASE_ANON_KEY
 *   hoặc VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   hoặc PRODUCTION_URL để lấy credentials từ bundle Production
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const {
  canAutoAbsentOnDate,
  getPreviousIctDate,
  resolveAutoAbsentSettings,
  shouldAutoAbsentForEmployee,
  AUTO_ABSENT_CREATED_BY,
  AUTO_ABSENT_REASON,
} = await import('../src/utils/autoAbsentAttendance.js')
const { ATTENDANCE_STATUS } = await import('../src/constants/attendanceTypes.js')
const { calculatePenaltyForNewRecord, getMonthPrefixFromDate } = await import('../src/utils/attendancePenalties.js')

const args = new Set(process.argv.slice(2))
const dateArg = process.argv.find((item) => item.startsWith('--date='))?.slice('--date='.length)
const dryRun = args.has('--dry-run')
const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'

async function resolveCredentials() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (url && key) return { url, key, source: 'env' }

  const html = await fetch(PRODUCTION_URL).then((r) => r.text())
  const jsPath = html.match(/\/assets\/index-[^"]+\.js/)?.[0]
  if (!jsPath) throw new Error('Không tìm thấy bundle Production')
  const js = await fetch(`${PRODUCTION_URL}${jsPath}`).then((r) => r.text())
  const prodUrl = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
  const prodKey = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
    ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if (!prodUrl || !prodKey) throw new Error('Không lấy được Supabase credentials từ Production')
  return { url: prodUrl, key: prodKey, source: 'production-bundle' }
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function main() {
  const { url, key, source } = await resolveCredentials()
  const sb = createClient(url, key)
  console.log(`\nAuto-absent attendance — credentials: ${source}`)

  const { data: settingsRow, error: settingsErr } = await sb
    .from('app_settings')
    .select('payload')
    .eq('id', 'singleton')
    .maybeSingle()
  if (settingsErr) throw settingsErr
  const settings = resolveAutoAbsentSettings(settingsRow?.payload ?? {})

  const targetDate = dateArg || getPreviousIctDate()
  console.log(`Target date (ICT): ${targetDate}`)
  console.log(`Enabled=${settings.autoAbsentEnabled} applyFrom=${settings.autoAbsentApplyFrom} workDays=${settings.autoAbsentWorkDays.join(',')}`)

  const gate = canAutoAbsentOnDate(targetDate, settings)
  if (!gate.ok) {
    console.log(`Skip: ${gate.reason}`)
    writeFileSync('tmp-auto-absent-result.json', JSON.stringify({ targetDate, gate: gate.reason, created: 0 }, null, 2))
    return
  }

  const { data: branches, error: branchErr } = await sb.from('branches').select('id,status')
  if (branchErr) throw branchErr
  const activeBranchIds = new Set(
    (branches ?? [])
      .filter((row) => !row.status || row.status === 'active')
      .map((row) => row.id),
  )

  const { data: employees, error: empErr } = await sb
    .from('employees')
    .select('id,branch_id,name,status,start_date,days_off')
  if (empErr) throw empErr

  const activeEmployees = (employees ?? [])
    .map((row) => ({
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      status: row.status,
      startDate: row.start_date ?? '',
      endDate: row.days_off ?? '',
    }))
    .filter((employee) => String(employee.status || '').toLowerCase() === 'active')

  const { data: existingRows, error: attErr } = await sb
    .from('attendance')
    .select('id,employee_id,attendance_date,status,created_by')
    .eq('attendance_date', targetDate)
  if (attErr) throw attErr
  const existingByEmployee = new Map((existingRows ?? []).map((row) => [row.employee_id, row]))

  let created = 0
  let skipped = 0
  const details = []

  for (const employee of activeEmployees) {
    if (employee.branchId && !activeBranchIds.has(employee.branchId)) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: 'inactive_branch' })
      continue
    }
    const existing = existingByEmployee.get(employee.id)
    const eligible = shouldAutoAbsentForEmployee(employee, targetDate, settings, existing || null)
    if (!eligible.ok) {
      skipped += 1
      details.push({ employeeId: employee.id, reason: eligible.reason })
      continue
    }

    const monthPrefix = getMonthPrefixFromDate(targetDate)
    const { data: monthRows } = await sb
      .from('attendance')
      .select('status,attendance_date')
      .eq('employee_id', employee.id)
      .gte('attendance_date', `${monthPrefix}-01`)
      .lte('attendance_date', `${monthPrefix}-31`)
    const monthRecords = (monthRows ?? []).map((row) => ({
      status: row.status,
      date: row.attendance_date,
    }))
    const penaltyAmount = settings.autoAbsentPenaltyAmount > 0
      ? settings.autoAbsentPenaltyAmount
      : calculatePenaltyForNewRecord(ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED, monthRecords, targetDate)

    const id = createId('att')
    const row = {
      id,
      employee_id: employee.id,
      branch_id: employee.branchId || null,
      attendance_date: targetDate,
      status: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
      reason: AUTO_ABSENT_REASON,
      penalty_amount: penaltyAmount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: AUTO_ABSENT_CREATED_BY,
    }

    if (dryRun) {
      created += 1
      details.push({ employeeId: employee.id, reason: 'dry_run_would_create', penaltyAmount })
      continue
    }

    const { error: insertErr } = await sb.from('attendance').insert(row)
    if (insertErr) {
      if (/duplicate|unique/i.test(insertErr.message)) {
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'already_has_record' })
      } else {
        skipped += 1
        details.push({ employeeId: employee.id, reason: 'insert_error', error: insertErr.message })
      }
      continue
    }

    await sb.from('attendance_edit_logs').insert({
      id: createId('attlog'),
      attendance_id: id,
      editor_id: 'system',
      editor_name: 'Hệ thống',
      field_name: 'create',
      old_value: '',
      new_value: ATTENDANCE_STATUS.FULL_DAY_UNPERMITTED,
      note: AUTO_ABSENT_REASON,
    })

    created += 1
    details.push({ employeeId: employee.id, reason: 'created', attendanceId: id, penaltyAmount })
  }

  const summary = { targetDate, dryRun, created, skipped, details }
  writeFileSync('tmp-auto-absent-result.json', JSON.stringify(summary, null, 2))
  console.log(`Done: created=${created} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}`)
  console.log('Chi tiết: tmp-auto-absent-result.json\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
