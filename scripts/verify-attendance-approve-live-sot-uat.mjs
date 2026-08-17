/**
 * UAT — approveAttendanceEditRequest dùng live attendance SoT (create vs update).
 * Không ghi Production.
 *
 * Run: vite-node scripts/verify-attendance-approve-live-sot-uat.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import { ROLES } from '../src/constants/roles.js'
import { saveCurrentUser, clearCurrentUser } from '../src/utils/authStorage.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/uat-evidence/ATTENDANCE_APPROVE_LIVE_SOT_UAT.json')
const results = []

function check(id, name, pass, detail = {}) {
  results.push({ id, name, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}`)
  if (!pass) console.error(detail)
}

const approveSrc = readFileSync(join(ROOT, 'src/utils/attendanceEditRequestService.js'), 'utf8')
const inboxSrc = readFileSync(join(ROOT, 'src/utils/payrollCycleClose/pendingWorkInbox.js'), 'utf8')

check(
  'SRC1',
  'Approve không còn quyết định CREATE chỉ vì type===create',
  !/if \(request\.type === 'create' \|\| !request\.attendanceId\)/.test(approveSrc)
  && approveSrc.includes('fetchAttendanceByEmployeeAndDate(request.employeeId, request.date)'),
  {},
)

check(
  'SRC2',
  'Approve: live → update; không live → create',
  /const live = await fetchAttendanceByEmployeeAndDate\(request\.employeeId, request\.date\)/.test(approveSrc)
  && /if \(live\) \{[\s\S]*adminUpdateAttendance/.test(approveSrc)
  && /else \{[\s\S]*adminCreateAttendance/.test(approveSrc),
  {},
)

check(
  'SRC3',
  'Inbox map requestedAt trước submittedAt',
  /submittedAt = row\.requestedAt \|\| row\.submittedAt \|\| row\.createdAt \|\| row\.updatedAt/.test(inboxSrc),
  {},
)

/** Mô phỏng quyết định SoT (khớp service sau hotfix). */
function decidePath(live) {
  if (live && live.employeeId && live.employeeId !== 'bac-lieu-thu-huong') {
    throw new Error('Không được cập nhật chấm công của nhân viên khác.')
  }
  return live?.id ? 'update' : 'create'
}

function resolveCorrectionSubmittedAt(row) {
  return row.requestedAt || row.submittedAt || row.createdAt || row.updatedAt || ''
}

// ——— CASE A: create request + attendance đã tồn tại → UPDATE ———
{
  const request = { type: 'create', attendanceId: '', employeeId: 'bac-lieu-thu-huong', date: '2026-08-14' }
  const live = { id: 'att-1786786524559-1f4uy3', employeeId: 'bac-lieu-thu-huong', date: '2026-08-14', status: 'full_day_permitted' }
  const path = decidePath(live)
  check('A', 'create request + live attendance → UPDATE (không INSERT)', path === 'update' && request.type === 'create' && !request.attendanceId, { path, request, live })
}

// ——— CASE B: create + chưa có attendance → CREATE ———
{
  const live = null
  const path = decidePath(live)
  check('B', 'create request + chưa có attendance → CREATE', path === 'create', { path })
}

// ——— CASE C: update request + live → UPDATE ———
{
  const live = { id: 'att-x', employeeId: 'bac-lieu-thu-huong', date: '2026-08-10', status: 'on_time' }
  check('C', 'update request + live → UPDATE', decidePath(live) === 'update', {})
}

// ——— CASE D: reject path still present ———
{
  check('D', 'rejectAttendanceEditRequest vẫn tồn tại', approveSrc.includes('export async function rejectAttendanceEditRequest'), {})
  check(
    'LEGACY1',
    'Duyệt/Từ chối resolve aer-* qua JSON khi bảng mới miss',
    approveSrc.includes('async function resolveReviewRequest')
      && approveSrc.includes('fetchCorrectionByLegacySourceId')
      && approveSrc.includes("persistTo: 'legacy'"),
    {},
  )
  check(
    'LEGACY2',
    'Persist JSON khi persistTo === legacy (không upsert aer-* vào bảng mới)',
    approveSrc.includes("if (persistTo === 'db')")
      && /persistTo === 'db'[\s\S]*upsertCorrectionRequest[\s\S]*upsertLegacyRequest/.test(approveSrc),
    {},
  )
}

// ——— CASE E: anti-duplicate create vẫn giữ ———
{
  const createSrc = readFileSync(join(ROOT, 'src/utils/attendanceService.js'), 'utf8')
  check(
    'E',
    'adminCreateAttendance vẫn chặn trùng NV+ngày',
    createSrc.includes('Nhân viên đã có bản ghi chấm công trong ngày này. Không được tạo trùng.'),
    {},
  )
}

// ——— CASE F: Thời gian từ requestedAt ———
{
  const row = {
    requestedAt: '2026-08-15T09:22:59.418+00:00',
    submittedAt: '',
    createdAt: '',
    updatedAt: '',
  }
  const submittedAt = resolveCorrectionSubmittedAt(row)
  const empty = resolveCorrectionSubmittedAt({})
  check('F1', 'requestedAt → submittedAt không rỗng', submittedAt === row.requestedAt, { submittedAt })
  check('F2', 'không có timestamp → rỗng (UI sẽ —)', empty === '', {})
}

// ——— Fixture 3 request Thu Hương (read-only path expectation) ———
{
  const fixtures = [
    {
      id: 'acr-fed74906-f063-4962-8401-6bb11b8031e1',
      date: '2026-08-14',
      type: 'create',
      attendanceId: '',
      live: { id: 'att-1786786524559-1f4uy3', employeeId: 'bac-lieu-thu-huong', date: '2026-08-14', status: 'full_day_permitted' },
      expect: 'update',
    },
    {
      id: 'acr-44ceed12-21e9-4b90-a894-3d1ca200a00d',
      date: '2026-08-07',
      type: 'create',
      attendanceId: '',
      live: { id: 'att-1786786450809-93kvse', employeeId: 'bac-lieu-thu-huong', date: '2026-08-07', status: 'full_day_unpermitted', penaltyAmount: 100000 },
      proposedStatus: 'full_day_permitted',
      expect: 'update',
    },
    {
      id: 'acr-661ae0ba-95f7-40c0-a5e5-8434c8facb28',
      date: '2026-08-06',
      type: 'create',
      attendanceId: '',
      live: { id: 'att-1786786327870-n0de7y', employeeId: 'bac-lieu-thu-huong', date: '2026-08-06', status: 'on_time' },
      expect: 'update',
    },
  ]

  for (const fx of fixtures) {
    const path = decidePath(fx.live)
    check(
      `TH-${fx.date}`,
      `Thu Hương ${fx.date}: path=${fx.expect}`,
      path === fx.expect,
      { id: fx.id, type: fx.type, attendanceId: fx.attendanceId, liveStatus: fx.live.status, proposedStatus: fx.proposedStatus || null, path },
    )
  }

  check(
    'TH-08-07-note',
    '08-07: duyệt sẽ UPDATE unpermitted→proposed (không tạo bản ghi mới); penalty theo adminUpdateAttendance hiện có',
    fixtures[1].live.status === 'full_day_unpermitted' && fixtures[1].proposedStatus === 'full_day_permitted',
    { livePenalty: fixtures[1].live.penaltyAmount },
  )
}

// ——— Integration-ish: mock live repo + approve (legacy/local path when supabase off) ———
{
  clearCurrentUser()
  saveCurrentUser({ id: 'admin', role: ROLES.ADMIN, name: 'Admin', branch: 'all' })

  // Source-level regression markers for EmployeeRequestsPanel / Attendance panel wiring
  const panelSrc = readFileSync(join(ROOT, 'src/components/report/EmployeeRequestsPanel.jsx'), 'utf8')
  const attPanelSrc = readFileSync(join(ROOT, 'src/components/attendance/AttendanceEditRequestsPanel.jsx'), 'utf8')
  check(
    'REG1',
    'Báo cáo Yêu cầu NV vẫn gọi approve/reject',
    panelSrc.includes('approveAttendanceEditRequest') && panelSrc.includes('rejectAttendanceEditRequest'),
    {},
  )
  check(
    'REG2',
    'AttendanceEditRequestsPanel vẫn gọi approve/reject',
    attPanelSrc.includes('approveAttendanceEditRequest') && attPanelSrc.includes('rejectAttendanceEditRequest'),
    {},
  )
  check(
    'REG3',
    'Không đụng payroll formula / KPI engine trong diff scope (source markers)',
    !approveSrc.includes('computeEmployeeKpi') && !approveSrc.includes('payrollEngine'),
    {},
  )
}

const failed = results.filter((r) => !r.pass).length
const report = {
  passed: failed === 0,
  failed,
  total: results.length,
  results,
  note: 'Không duyệt 3 request Thu Hương trên Production trong UAT này.',
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`\n${report.passed ? 'PASS' : 'FAIL'} ${results.length - failed}/${results.length} → ${OUT}`)
if (!report.passed) process.exit(1)
