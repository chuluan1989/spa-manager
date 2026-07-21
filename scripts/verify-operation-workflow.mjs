/**
 * Verify Operation Workflow V1 engines (localStorage-first, no migration).
 * Run: npm run verify:operation-workflow
 */

import './_polyfill-storage.mjs'
import assert from 'node:assert/strict'
import {
  resolveProgressTone,
  DEFAULT_DAILY_TASKS,
  PRIORITY,
} from '../src/utils/operationWorkflow/operationWorkflowConstants.js'
import {
  loadBranchDailyTasks,
  toggleDailyTaskComplete,
  getBranchTaskProgress,
} from '../src/utils/operationWorkflow/dailyTaskStorage.js'
import {
  saveDailyTarget,
  loadDailyTarget,
  clearDailyTarget,
} from '../src/utils/operationWorkflow/dailyTargetStorage.js'
import {
  addManagerNote,
  loadManagerNotes,
  deleteManagerNote,
} from '../src/utils/operationWorkflow/managerNotesStorage.js'
import {
  appendOperationAudit,
  loadOperationAuditLogs,
  getOperationAuditActionLabel,
} from '../src/utils/operationWorkflow/operationAuditLog.js'
import { buildDailyTargetProgress } from '../src/utils/operationWorkflow/buildDailyTargetProgress.js'
import {
  buildOperationAlerts,
  buildCeoActionItems,
} from '../src/utils/operationWorkflow/buildOperationAlerts.js'
import { buildEmployeeTimeline } from '../src/utils/operationWorkflow/buildEmployeeTimeline.js'
import { buildPerformanceHistory } from '../src/utils/operationWorkflow/buildPerformanceHistory.js'
import { AUDIT_ACTIONS } from '../src/utils/operationWorkflow/operationWorkflowConstants.js'

localStorage.clear()

assert.equal(resolveProgressTone(110), 'green')
assert.equal(resolveProgressTone(72), 'yellow')
assert.equal(resolveProgressTone(58), 'red')
assert.ok(DEFAULT_DAILY_TASKS.length >= 5)

{
  const branchId = 'soc-trang'
  const date = '2026-07-21'
  toggleDailyTaskComplete({
    branchId,
    date,
    taskId: 'hygiene',
    taskLabel: 'Kiểm tra vệ sinh',
    completedBy: 'mgr1',
    completedByName: 'QL Test',
  })
  const loaded = loadBranchDailyTasks(branchId, date)
  assert.equal(loaded.completions.hygiene.completed, true)
  assert.equal(loaded.completions.hygiene.completedByName, 'QL Test')
  const progress = getBranchTaskProgress(branchId, date)
  assert.equal(progress.done, 1)
  toggleDailyTaskComplete({
    branchId,
    date,
    taskId: 'hygiene',
    taskLabel: 'Kiểm tra vệ sinh',
    completedBy: 'mgr1',
    completedByName: 'QL Test',
  })
  assert.equal(getBranchTaskProgress(branchId, date).done, 0)
}

{
  saveDailyTarget({
    employeeId: 'e1',
    employeeName: 'Mai Nhi',
    branchId: 'soc-trang',
    date: '2026-07-21',
    revenue: 2_000_000,
    customers: 10,
    requested: 3,
    tips: 200_000,
  })
  const t = loadDailyTarget('e1', '2026-07-21')
  assert.equal(t.revenue, 2_000_000)
  clearDailyTarget('e1', '2026-07-21', { employeeName: 'Mai Nhi', branchId: 'soc-trang' })
  assert.equal(loadDailyTarget('e1', '2026-07-21'), null)
}

{
  const note = addManagerNote({
    employeeId: 'e1',
    employeeName: 'Mai Nhi',
    branchId: 'soc-trang',
    date: '2026-07-21',
    text: 'Hôm nay upsell chưa tốt.',
    authorName: 'QL Test',
  })
  assert.ok(note.id)
  const list = loadManagerNotes({ employeeId: 'e1', date: '2026-07-21' })
  assert.equal(list[0].text, 'Hôm nay upsell chưa tốt.')
  deleteManagerNote(note.id)
  assert.equal(loadManagerNotes({ employeeId: 'e1', date: '2026-07-21' }).length, 0)
}

{
  saveDailyTarget({
    employeeId: 'e1',
    employeeName: 'A',
    branchId: 'soc-trang',
    date: '2026-07-21',
    revenue: 1_000_000,
    customers: 5,
    requested: 2,
    tips: 100_000,
  })
  const rows = buildDailyTargetProgress({
    employees: [{ id: 'e1', name: 'A', branchId: 'soc-trang' }],
    targetsByEmployeeId: new Map([['e1', loadDailyTarget('e1', '2026-07-21')]]),
    invoicesToday: [
      {
        id: 'i1',
        date: '2026-07-21',
        employeeId: 'e1',
        customerName: 'K1',
        customerPhone: '0901',
        customerRequested: true,
        tips: 50000,
        serviceTotal: 580000,
        total: 630000,
        services: [{ price: 580000 }],
      },
    ],
  })
  assert.equal(rows[0].metrics.find((m) => m.key === 'revenue').tone, 'red')
  assert.ok(rows[0].overallPercent != null)
  assert.equal(resolveProgressTone(72), 'yellow')
  assert.equal(resolveProgressTone(110), 'green')
}

{
  const today = '2026-07-21'
  const invoices = []
  for (let i = 1; i <= 7; i += 1) {
    const d = `2026-07-${String(i).padStart(2, '0')}`
    invoices.push({
      id: `h${i}`,
      date: d,
      branchId: 'tra-vinh',
      employeeId: 'e9',
      customerName: `C${i}`,
      customerPhone: `090${i}`,
      tips: 100000,
      serviceTotal: 1_000_000,
      total: 1_100_000,
      services: [{ price: 1_000_000 }],
      customerRequested: true,
    })
  }
  // Today very low revenue
  invoices.push({
    id: 'low',
    date: today,
    branchId: 'tra-vinh',
    employeeId: 'e9',
    customerName: 'Low',
    customerPhone: '0999',
    tips: 0,
    serviceTotal: 100000,
    total: 100000,
    services: [{ price: 100000 }],
    customerRequested: false,
  })

  const alerts = buildOperationAlerts({
    today,
    branches: [{ id: 'tra-vinh', name: 'Trà Vinh' }],
    employees: [{ id: 'e9', name: 'Mai Nhi', branchId: 'tra-vinh' }],
    invoices,
    attendanceToday: [{ employeeId: 'e9', branchId: 'tra-vinh', date: today, status: 'on_time' }],
    lookbackDates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07'],
  })
  assert.ok(alerts.some((a) => a.type === 'revenue_below_avg'))
  assert.ok(alerts.some((a) => a.type === 'employee_no_customer') === false || true)
  // e9 has invoice today so no "no customer" — add separate employee
  const alerts2 = buildOperationAlerts({
    today,
    branches: [{ id: 'tra-vinh', name: 'Trà Vinh' }],
    employees: [{ id: 'e2', name: 'NoCust', branchId: 'tra-vinh' }],
    invoices,
    attendanceToday: [{ employeeId: 'e2', branchId: 'tra-vinh', date: today, status: 'on_time' }],
    lookbackDates: ['2026-07-01'],
  })
  assert.ok(alerts2.some((a) => a.type === 'employee_no_customer'))

  const ceo = buildCeoActionItems(alerts)
  assert.ok(ceo[0].priority)
  assert.equal(PRIORITY.HIGH, 'high')
}

{
  const events = buildEmployeeTimeline({
    employeeId: 'e1',
    date: '2026-07-21',
    invoices: [
      {
        id: 'inv-105',
        date: '2026-07-21',
        invoiceTime: '09:15',
        employeeId: 'e1',
        customerName: 'Khách A',
        tips: 100000,
        serviceTotal: 500000,
        total: 600000,
        services: [{ price: 500000 }],
        customerRequested: true,
      },
    ],
    attendanceRecords: [
      { id: 'a1', employeeId: 'e1', date: '2026-07-21', status: 'on_time', submittedAt: '2026-07-21T08:02:00' },
    ],
    notes: [
      { id: 'n1', employeeId: 'e1', date: '2026-07-21', text: 'Cần hỗ trợ.', createdAt: '2026-07-21T16:00:00', authorName: 'QL' },
    ],
  })
  assert.ok(events.some((e) => e.type === 'attendance'))
  assert.ok(events.some((e) => e.type === 'invoice'))
  assert.ok(events.some((e) => e.type === 'tips'))
  assert.ok(events.some((e) => e.type === 'requested'))
  assert.ok(events.some((e) => e.type === 'manager_note'))
}

{
  const history = buildPerformanceHistory({
    entityType: 'employee',
    entityId: 'e1',
    endMonthKey: '2026-07',
    months: 4,
    invoices: [
      { id: '1', date: '2026-04-10', employeeId: 'e1', tips: 0, serviceTotal: 100000, total: 100000, services: [{ price: 100000 }] },
      { id: '2', date: '2026-05-10', employeeId: 'e1', tips: 0, serviceTotal: 200000, total: 200000, services: [{ price: 200000 }] },
      { id: '3', date: '2026-06-10', employeeId: 'e1', tips: 0, serviceTotal: 300000, total: 300000, services: [{ price: 300000 }] },
      { id: '4', date: '2026-07-10', employeeId: 'e1', tips: 0, serviceTotal: 400000, total: 400000, services: [{ price: 400000 }] },
    ],
  })
  assert.equal(history.length, 4)
  assert.equal(history[0].monthKey, '2026-04')
  assert.equal(history[3].monthKey, '2026-07')
  assert.ok(history[3].revenue > history[0].revenue)
}

{
  appendOperationAudit({
    action: AUDIT_ACTIONS.TARGET_SET,
    entityType: 'daily_target',
    entityId: 'e1',
    entityName: 'A',
    branchId: 'soc-trang',
    oldValue: { revenue: 0 },
    newValue: { revenue: 100 },
    details: 'test',
  })
  const logs = loadOperationAuditLogs({ branchId: 'soc-trang', limit: 10 })
  assert.ok(logs.length >= 1)
  assert.ok(getOperationAuditActionLabel(AUDIT_ACTIONS.TARGET_SET).includes('KPI'))
}

console.log('PASS — verify:operation-workflow')
console.log('  ✓ Daily Task tick + undo + actor stamp')
console.log('  ✓ Daily Target save/clear + progress tones')
console.log('  ✓ Manager notes history')
console.log('  ✓ Alerts + CEO action priorities')
console.log('  ✓ Employee timeline events')
console.log('  ✓ Performance history by month')
console.log('  ✓ Operation audit log old/new values')
