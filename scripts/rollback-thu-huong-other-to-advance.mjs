/**
 * Rollback riêng Thu Hương Aug K1 — khôi phục ĐC 500k, đưa Ứng về 0.
 * Chỉ chạy khi anh yêu cầu rollback. Không chạy tự động.
 *
 *   CONFIRM_ROLLBACK=1 npx vite-node --env-file=.env.development.local \\
 *     scripts/rollback-thu-huong-other-to-advance.mjs
 */
function createStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
globalThis.localStorage = createStorage()
globalThis.sessionStorage = createStorage()

if (process.env.CONFIRM_ROLLBACK !== '1') {
  console.error('Từ chối: set CONFIRM_ROLLBACK=1 để chạy rollback Thu Hương.')
  process.exit(1)
}

sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
  role: 'admin',
  branch: 'all',
  username: 'admin',
}))

const EMPLOYEE_ID = 'bac-lieu-thu-huong'
const DC_ID = 'payadj-1785867587565-martmn'
const ADVANCE_ID = 'payadj-1785945863671-q278fs'
const REASON = 'Rollback: hoàn tác chuyển ĐC → Ứng lương Thu Hương Aug K1'

const { PAYROLL_ADJUSTMENT_TYPES } = await import('../src/constants/payrollTypes.js')
const { fetchPayrollAdjustments } = await import('../src/repositories/payrollRepository.js')
const {
  editPayrollAdjustment,
  saveAdminPayrollBoardEdits,
} = await import('../src/utils/payrollService.js')
const { insertPayrollAuditLog, createPayrollAuditId } = await import('../src/repositories/payrollRepository.js')
const { getPayPeriodRange, PAY_CYCLES } = await import('../src/utils/salaryReport.js')

const { fromDate, toDate } = getPayPeriodRange('2026-08', PAY_CYCLES.PERIOD_1)
const all = await fetchPayrollAdjustments({ month: '2026-08' }) ?? []
const dc = all.find((r) => r.id === DC_ID)
const adv = all.find((r) => r.id === ADVANCE_ID)

if (!dc) throw new Error(`Không thấy bản ghi ĐC ${DC_ID}`)
if (Number(dc.amount ?? 0) !== 0) {
  console.warn('ĐC không ở 0 — vẫn tiếp tục restore về 500000')
}

await editPayrollAdjustment(dc, {
  amount: 500000,
  note: dc.note,
  reason: REASON,
})

// Zero advance via SET (không xóa dòng — set tổng 0)
await saveAdminPayrollBoardEdits({
  reason: REASON,
  note: 'Rollback Ứng về 0',
  totals: { [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: 0 },
  displayedTotals: { [PAYROLL_ADJUSTMENT_TYPES.ADVANCE]: Number(adv?.amount ?? 500000) },
  employeeId: EMPLOYEE_ID,
  employeeName: 'Thu Hương',
  branchId: 'bac-lieu',
  month: '2026-08',
  cycle: 'period1',
  fromDate,
  toDate,
  existingAdjustments: await fetchPayrollAdjustments({ month: '2026-08' }),
})

await insertPayrollAuditLog({
  id: createPayrollAuditId(),
  entityType: 'payroll_board',
  entityId: EMPLOYEE_ID,
  action: 'rollback_other_to_advance',
  editorId: 'admin',
  editorName: 'Admin',
  oldValue: { otherAdjustment: 0, advance: 500000 },
  newValue: { otherAdjustment: 500000, advance: 0 },
  reason: REASON,
})

console.log(JSON.stringify({
  status: 'ROLLED_BACK',
  employeeId: EMPLOYEE_ID,
  restoredAdjustmentId: DC_ID,
  advanceSetToZero: true,
  previousAdvanceId: ADVANCE_ID,
}, null, 2))
