/**
 * Phase 2 verify — employee historical fetch scope (Design Freeze)
 * Run: npm run verify:employee-historical-fetch
 */
import assert from 'node:assert/strict'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { getRecordFetchBranchFilter, filterByUserScope } from '../src/constants/auth.js'
import { filterSalaryInvoices } from '../src/utils/salaryReport.js'

function setEmployeeSession(branchId, employeeId) {
  localStorage.setItem('spa-manager-employees', JSON.stringify([{
    id: employeeId,
    branchId,
    name: 'Cherry',
    status: 'active',
  }]))
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify({
    role: 'employee',
    branch: branchId,
    employeeId,
    employeeName: 'Cherry',
  }))
}

function clearSession() {
  sessionStorage.removeItem('spa-manager-current-user')
  localStorage.removeItem('spa-manager-employees')
}

const invoices = [
  { id: '1', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'tram-spa-cherry', total: 100 },
  { id: '2', date: '2026-07-12', branchId: 'bac-lieu', employeeId: 'tram-spa-cherry', total: 200 },
  { id: '3', date: '2026-07-10', branchId: 'tram-spa', employeeId: 'other', total: 50 },
]

// Employee fetch scope — no branch filter
setEmployeeSession('bac-lieu', 'tram-spa-cherry')
assert.equal(getRecordFetchBranchFilter('bac-lieu'), '')

const scoped = filterByUserScope(invoices)
assert.equal(scoped.length, 2)
assert.ok(scoped.every((inv) => inv.employeeId === 'tram-spa-cherry'))

const filtered = filterSalaryInvoices(invoices, {
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  branchId: '',
  employeeId: 'tram-spa-cherry',
})
assert.equal(filtered.length, 2)
assert.ok(filtered.some((inv) => inv.branchId === 'tram-spa'))
assert.ok(filtered.some((inv) => inv.branchId === 'bac-lieu'))

// With wrong branch filter (old bug) — would drop tram-spa
const wrong = filterSalaryInvoices(invoices, {
  fromDate: '2026-07-01',
  toDate: '2026-07-31',
  branchId: 'bac-lieu',
  employeeId: 'tram-spa-cherry',
})
assert.equal(wrong.length, 1)

clearSession()

console.log('PASS — verify:employee-historical-fetch')
console.log('  ✓ employee scope by employee_id only')
console.log('  ✓ multi record-branch history visible')
