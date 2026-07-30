/**
 * Employee Lifecycle V1 — regression gate (Preview / UAT)
 * Run: npm run verify:employee-lifecycle-v1
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import {
  getRecordFetchBranchFilter,
  getRecordFetchFilters,
  filterByUserScope,
  RECORD_FETCH_USE_CASES,
  resolveRecordFetchStrategy,
  buildRepositoryFilters,
} from '../src/constants/auth.js'
import {
  buildBranchRosterEmployeeIds,
  filterEmployeesForBranchRoster,
} from '../src/contracts/recordFetchRoster.js'
import {
  computeEmployeeDefaultPassword,
  verifyLogin,
  verifyLoginWithUsername,
} from '../src/constants/loginCredentials.js'
import {
  ensureCredentialsHashed,
  syncEmployeeCredentialsFromEmployees,
  syncMissingBranchCredentials,
  loadCredentials,
  repairEmployeeCredentials,
} from '../src/utils/credentialsStorage.js'
import { ROLES } from '../src/constants/roles.js'
import { employeeCurrentlyAtBranch } from '../src/utils/employeeBranchTimeline.js'
import { filterSalaryInvoices } from '../src/utils/salaryReport.js'
import { getPasswordBranchName } from '../src/utils/branchStorage.js'
import {
  saveEmployees,
  normalizeEmployee,
  EMPLOYEE_STATUS,
} from '../src/utils/employeeStorage.js'

let pass = 0
let fail = 0

function log(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function setSession(user) {
  if (user.role === ROLES.EMPLOYEE) {
    localStorage.setItem('spa-manager-employees', JSON.stringify([{
      id: user.employeeId,
      branchId: user.branch,
      name: user.employeeName || 'Test',
      status: 'active',
    }]))
  }
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

function clearSession() {
  sessionStorage.removeItem('spa-manager-current-user')
  localStorage.removeItem('spa-manager-employees')
}

function runSubScript(scriptPath) {
  const result = spawnSync('npx', ['vite-node', scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0
}

console.log('\n=== Employee Lifecycle V1 — Regression ===\n')

// --- I. Record Fetch Contract V2 ---
console.log('--- Record Fetch Contract V2 ---\n')

setSession({ role: ROLES.EMPLOYEE, branch: 'bac-lieu', employeeId: 'tram-spa-cherry', employeeName: 'Cherry' })
const empHistory = getRecordFetchFilters(RECORD_FETCH_USE_CASES.VIEW_SINGLE_EMPLOYEE_HISTORY, {
  selectedBranchId: 'bac-lieu',
})
log('Employee history — no branch filter', empHistory.filters.branchId === '' && empHistory.filters.employeeId === 'tram-spa-cherry')
log('Employee history strategy', empHistory.strategy === 'BY_EMPLOYEE_ID')

clearSession()
setSession({ role: ROLES.BRANCH_MANAGER, branch: 'tram-spa' })
log('Manager branch filter', getRecordFetchBranchFilter('') === 'tram-spa')
const mgrScope = resolveRecordFetchStrategy({
  useCase: RECORD_FETCH_USE_CASES.VIEW_BRANCH_HISTORY,
  session: { role: ROLES.BRANCH_MANAGER, branch: 'tram-spa' },
})
log('Manager strategy BY_RECORD_BRANCH', mgrScope.strategy === 'BY_RECORD_BRANCH')

clearSession()
setSession({ role: ROLES.ADMIN, branch: 'all' })
const adminEmp = getRecordFetchFilters(RECORD_FETCH_USE_CASES.VIEW_SINGLE_EMPLOYEE_HISTORY, {
  selectedEmployeeId: 'tram-spa-cherry',
})
log('Admin employee drill-down — employee_id only', adminEmp.filters.branchId === '' && adminEmp.filters.employeeId === 'tram-spa-cherry')
clearSession()

// --- II. Cherry transfer visibility (unit) ---
console.log('\n--- Transfer visibility (Cherry / Trúc Ly) ---\n')

const cherryInvoices = [
  { id: '1', date: '2026-06-10', branchId: 'tram-spa', employeeId: 'tram-spa-cherry', total: 100 },
  { id: '2', date: '2026-07-12', branchId: 'bac-lieu', employeeId: 'tram-spa-cherry', total: 200 },
]

setSession({ role: ROLES.EMPLOYEE, branch: 'bac-lieu', employeeId: 'tram-spa-cherry', employeeName: 'Cherry' })
const cherrySelf = filterSalaryInvoices(cherryInvoices, {
  fromDate: '2026-06-01',
  toDate: '2026-07-31',
  branchId: '',
  employeeId: 'tram-spa-cherry',
})
log('Cherry employee sees full history', cherrySelf.length === 2)

clearSession()
setSession({ role: ROLES.BRANCH_MANAGER, branch: 'tram-spa' })
const tramManager = filterByUserScope(cherryInvoices)
log('QL Trạm Spa sees tram-spa records', tramManager.length === 1 && tramManager[0].branchId === 'tram-spa')

clearSession()
setSession({ role: ROLES.BRANCH_MANAGER, branch: 'bac-lieu' })
const bacManager = filterByUserScope(cherryInvoices)
log('QL Bạc Liêu sees bac-lieu records only', bacManager.length === 1 && bacManager[0].branchId === 'bac-lieu')

clearSession()
setSession({ role: ROLES.ADMIN, branch: 'all' })
log('Admin sees all records', filterByUserScope(cherryInvoices).length === 2)
clearSession()

// --- III. Branch roster contract ---
console.log('\n--- Branch roster ---\n')

const employees = [
  { id: 'tram-spa-cherry', branchId: 'bac-lieu', status: 'active', branchHistory: [] },
  { id: 'tram-spa-thanh', branchId: 'tram-spa', status: 'active', branchHistory: [] },
]
const roster = filterEmployeesForBranchRoster({
  employees,
  branchId: 'tram-spa',
  activityRecords: cherryInvoices,
})
log('Roster includes transferred Cherry (record activity)', roster.some((e) => e.id === 'tram-spa-cherry'))
log('Roster includes current Thanh', roster.some((e) => e.id === 'tram-spa-thanh'))
log('Cherry not currently at tram-spa', !employeeCurrentlyAtBranch(employees[0], 'tram-spa'))
log('Cherry in roster ids via activity', buildBranchRosterEmployeeIds({
  branchId: 'tram-spa',
  employees,
  activityRecords: cherryInvoices,
}).has('tram-spa-cherry'))

// --- IV. Login regression ---
console.log('\n--- Login ---\n')

await ensureCredentialsHashed()
saveEmployees([
  normalizeEmployee({ id: 'tram-spa-thanh', name: 'Thanh', branchId: 'tram-spa', status: EMPLOYEE_STATUS.ACTIVE, position: 'KTV' }),
])
await repairEmployeeCredentials()
await syncMissingBranchCredentials()
await syncEmployeeCredentialsFromEmployees()

const adminLogin = await verifyLogin({ role: ROLES.ADMIN, password: 'admin123' })
log('Admin login', adminLogin.ok)

const mgrLogin = await verifyLoginWithUsername({
  role: ROLES.BRANCH_MANAGER,
  username: 'tramspa',
  password: 'tramspa123',
})
log('Branch Manager login (tramspa)', mgrLogin.ok)

const empLogin = await verifyLoginWithUsername({
  role: ROLES.EMPLOYEE,
  username: 'thanh',
  password: 'thanhtramspa',
})
log('Employee login (thanh)', empLogin.ok)
log('Employee mustChangePassword on first login', empLogin.ok && empLogin.user?.mustChangePassword === true)

// --- V. Credential lifecycle (create path) ---
console.log('\n--- Credential provisioning ---\n')

const creds = loadCredentials()
log('Thanh credential exists', Boolean(creds.employees?.['tram-spa-thanh']?.password))
const defaultPwd = computeEmployeeDefaultPassword('Thanh', getPasswordBranchName('tram-spa'))
log('Default password formula', defaultPwd === 'thanhtramspa')

// --- VI. Sub-verifiers ---
console.log('\n--- Sub-verifiers ---\n')

for (const [label, script] of [
  ['employee-branch-timeline', 'scripts/verify-employee-branch-timeline.mjs'],
  ['employee-historical-fetch', 'scripts/verify-employee-historical-fetch.mjs'],
  ['phase3-design-freeze', 'scripts/verify-phase3-design-freeze.mjs'],
  ['phase4-design-freeze', 'scripts/verify-phase4-design-freeze.mjs'],
]) {
  const ok = runSubScript(script)
  log(`verify:${label}`, ok)
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exitCode = 1
else console.log('PASS — Employee Lifecycle V1 ready for Preview UAT\n')
