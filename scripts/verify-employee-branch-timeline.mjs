/**
 * Unit verify — employeeBranchTimeline (Design Freeze Phase 1)
 * Run: npm run verify:employee-branch-timeline
 */
import assert from 'node:assert/strict'
import {
  getEmployeeBranchAtDate,
  getEmployeeBranchSegments,
  getCurrentEmployeeBranch,
  getSortedBranchHistory,
  validateBranchHistory,
  compareRecordBranchToTimeline,
  collectEmployeeIdsWithRecordBranchActivity,
  employeeCurrentlyAtBranch,
} from '../src/utils/employeeBranchTimeline.js'

function employee(overrides = {}) {
  return {
    id: 'test-emp',
    branchId: 'tram-spa',
    branchHistory: [],
    ...overrides,
  }
}

// 1. Không có history → current branch
{
  const emp = employee({ branchId: 'bac-lieu' })
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-01'), 'bac-lieu')
  assert.equal(getCurrentEmployeeBranch(emp), 'bac-lieu')
}

// 2. Một lần chuyển — Cherry pattern
{
  const emp = employee({
    branchId: 'bac-lieu',
    branchHistory: [{
      fromBranchId: 'tram-spa',
      toBranchId: 'bac-lieu',
      effectiveDate: '2026-07-30',
    }],
  })
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-01'), 'tram-spa')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-30'), 'bac-lieu')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-08-01'), 'bac-lieu')
}

// 3. Ba lần chuyển
{
  const emp = employee({
    branchId: 'vinh-long',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-01-01' },
      { fromBranchId: 'bac-lieu', toBranchId: 'soc-trang', effectiveDate: '2026-06-01' },
      { fromBranchId: 'soc-trang', toBranchId: 'vinh-long', effectiveDate: '2026-09-01' },
    ],
  })
  assert.equal(getEmployeeBranchAtDate(emp, '2025-12-31'), 'tram-spa')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-03-15'), 'bac-lieu')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-15'), 'soc-trang')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-10-01'), 'vinh-long')
}

// 4. Quay lại chi nhánh cũ — Trạm → Bạc Liêu → Sóc Trăng → Trạm
{
  const emp = employee({
    branchId: 'tram-spa',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-01-01' },
      { fromBranchId: 'bac-lieu', toBranchId: 'soc-trang', effectiveDate: '2026-06-01' },
      { fromBranchId: 'soc-trang', toBranchId: 'tram-spa', effectiveDate: '2026-09-01' },
    ],
  })
  assert.equal(getEmployeeBranchAtDate(emp, '2025-12-01'), 'tram-spa')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-03-01'), 'bac-lieu')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-01'), 'soc-trang')
  assert.equal(getEmployeeBranchAtDate(emp, '2026-10-01'), 'tram-spa')
}

// 5. Segments
{
  const emp = employee({
    branchId: 'soc-trang',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-01-01' },
      { fromBranchId: 'bac-lieu', toBranchId: 'soc-trang', effectiveDate: '2026-06-01' },
    ],
  })
  const segments = getEmployeeBranchSegments(emp)
  assert.equal(segments.length, 3)
  assert.equal(segments[0].branchId, 'tram-spa')
  assert.equal(segments[1].branchId, 'bac-lieu')
  assert.equal(segments[1].fromDate, '2026-01-01')
  assert.equal(segments[2].branchId, 'soc-trang')
  assert.equal(segments[2].fromDate, '2026-06-01')
}

// 6. validateBranchHistory — OK
{
  const emp = employee({
    branchId: 'bac-lieu',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-07-30' },
    ],
  })
  const result = validateBranchHistory(emp)
  assert.equal(result.ok, true)
  assert.equal(result.issues.length, 0)
}

// 7. validateBranchHistory — broken chain
{
  const emp = employee({
    branchId: 'soc-trang',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-01-01' },
      { fromBranchId: 'tram-spa', toBranchId: 'soc-trang', effectiveDate: '2026-06-01' },
    ],
  })
  const result = validateBranchHistory(emp)
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.includes('fromBranchId')))
}

// 8. compareRecordBranchToTimeline
{
  const emp = employee({
    branchId: 'bac-lieu',
    branchHistory: [
      { fromBranchId: 'tram-spa', toBranchId: 'bac-lieu', effectiveDate: '2026-07-30' },
    ],
  })
  const match = compareRecordBranchToTimeline(
    { branchId: 'tram-spa', date: '2026-07-15' },
    emp,
  )
  assert.equal(match.ok, true)

  const mismatch = compareRecordBranchToTimeline(
    { branchId: 'bac-lieu', date: '2026-07-15' },
    emp,
  )
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.expectedBranch, 'tram-spa')
}

// 9. collectEmployeeIdsWithRecordBranchActivity
{
  const ids = collectEmployeeIdsWithRecordBranchActivity('tram-spa', [
    { branchId: 'tram-spa', employeeId: 'a' },
    { branchId: 'bac-lieu', employeeId: 'b' },
    { branchId: 'tram-spa', employeeId: 'c' },
  ])
  assert.deepEqual([...ids].sort(), ['a', 'c'])
}

// 10. employeeCurrentlyAtBranch vs timeline
{
  const emp = employee({ branchId: 'bac-lieu' })
  assert.equal(employeeCurrentlyAtBranch(emp, 'bac-lieu'), true)
  assert.equal(employeeCurrentlyAtBranch(emp, 'tram-spa'), false)
}

// 11. Legacy transferDate alias
{
  const emp = employee({
    branchId: 'soc-trang',
    branchHistory: [{
      fromBranchId: 'tram-spa',
      toBranchId: 'soc-trang',
      transferDate: '2026-07-30',
    }],
  })
  assert.equal(getEmployeeBranchAtDate(emp, '2026-07-01'), 'tram-spa')
  assert.equal(getSortedBranchHistory(emp).length, 1)
}

console.log('PASS — verify:employee-branch-timeline')
console.log('  ✓ single + multi transfer timeline')
console.log('  ✓ round-trip to original branch')
console.log('  ✓ segments + validate + record compare')
console.log('  ✓ record branch activity + current branch roster')
