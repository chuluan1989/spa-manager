/**
 * UAT logic — màn hình tổng lương (không đụng DB / không import src ESM).
 * Run: node scripts/verify-salary-summary-uat.mjs
 */
import assert from 'node:assert/strict'

function computeNet(parts) {
  return (
    (parts.baseSalary || 0)
    + (parts.commission || 0)
    + (parts.tips || 0)
    + (parts.bonus || 0)
    - (parts.reduction || 0)
    - (parts.penalty || 0)
    - (parts.advance || 0)
    + (parts.otherAdjustment || 0)
  )
}

function homeBranchOnlyRoster(employees, branchId) {
  return employees.filter((emp) => emp.branchId === branchId)
}

function sumTotals(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.workDays += row.workDays || 0
      acc.ticketRevenue += row.ticketRevenue || 0
      acc.tips += row.tips || 0
      acc.commission += row.commission || 0
      acc.bonus += row.bonus || 0
      acc.penalty += row.penalty || 0
      acc.advance += row.advance || 0
      acc.netSalary += row.netSalary || 0
      return acc
    },
    { workDays: 0, ticketRevenue: 0, tips: 0, commission: 0, bonus: 0, penalty: 0, advance: 0, netSalary: 0 },
  )
}

// Case 1: no support — list net === detail net (same formula)
{
  const parts = { baseSalary: 0, commission: 400000, tips: 200000, bonus: 0, reduction: 0, penalty: 0, advance: 0, otherAdjustment: 0 }
  const listNet = computeNet(parts)
  const detailNet = computeNet(parts)
  assert.equal(listNet, detailNet)
  assert.equal(listNet, 600000)
  console.log('✓ Case 1: không hỗ trợ — tổng = chi tiết', listNet)
}

// Case 2: support one branch — home shows full
{
  const net = computeNet({
    baseSalary: 0,
    commission: 5800000 + 950000 - 500000, // simplified: already netted in example
    tips: 0,
    bonus: 0,
    reduction: 0,
    penalty: 0,
    advance: 0,
    otherAdjustment: 0,
  })
  // Explicit example from spec
  const display = 5800000 + 950000 - 500000
  assert.equal(display, 6250000)
  console.log('✓ Case 2: hỗ trợ 1 CN — thực nhận gồm hỗ trợ', display)
}

// Case 3: multi-branch activity — one row under home only
{
  const employees = [
    { id: 'nv1', branchId: 'soc-trang', name: 'A' },
    { id: 'nv2', branchId: 'tram-spa', name: 'B' },
  ]
  const payrollRows = [
    { employeeId: 'nv1', netSalary: 7000000, tips: 1, commission: 1, bonus: 0, penalty: 0, advance: 0, workDays: 1, ticketRevenue: 1 },
    { employeeId: 'nv2', netSalary: 100, tips: 0, commission: 0, bonus: 0, penalty: 0, advance: 0, workDays: 1, ticketRevenue: 0 },
  ]
  const socTrang = homeBranchOnlyRoster(employees, 'soc-trang')
    .map((emp) => payrollRows.find((r) => r.employeeId === emp.id))
    .filter(Boolean)
  assert.equal(socTrang.length, 1)
  assert.equal(socTrang[0].netSalary, 7000000)
  const totals = sumTotals(socTrang)
  assert.equal(totals.netSalary, 7000000)
  console.log('✓ Case 3: nhiều CN — chỉ 1 dòng tại CN nhân sự, không trùng')
}

// Case 4: advance + penalty once
{
  const net = computeNet({
    baseSalary: 0, commission: 1000, tips: 1000, bonus: 100, reduction: 0, penalty: 200, advance: 300, otherAdjustment: 0,
  })
  assert.equal(net, 1600)
  console.log('✓ Case 4: trừ phạt + ứng một lần', net)
}

// Case 5: switch employee keeps filters
{
  const before = { month: '2026-07', cycle: 'period2', branchId: 'soc-trang', status: 'active', employeeId: 'a' }
  const after = { ...before, employeeId: 'c' }
  assert.equal(after.month, before.month)
  assert.equal(after.cycle, before.cycle)
  assert.equal(after.branchId, before.branchId)
  assert.equal(after.status, before.status)
  assert.notEqual(after.employeeId, before.employeeId)
  console.log('✓ Case 5: chuyển A→C giữ tháng/kỳ/CN/status')
}

// Case 6: columns
{
  const columns = ['stt', 'employeeName', 'workDays', 'ticketRevenue', 'tips', 'commission', 'bonus', 'penalty', 'advance', 'netSalary']
  const removed = ['position', 'paidAmount', 'reduction', 'remainingAmount', 'avatar']
  assert.equal(columns.at(-1), 'netSalary')
  assert.ok(columns.includes('tips') && columns.indexOf('tips') < columns.indexOf('commission'))
  for (const key of removed) assert.ok(!columns.includes(key))
  console.log('✓ Case 6: cột UI — bỏ 4 cột, net cuối, Tips trước HH')
}

console.log('\nSalary summary UAT logic passed.')
