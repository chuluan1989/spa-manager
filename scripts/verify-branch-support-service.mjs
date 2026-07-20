import assert from 'node:assert/strict'

const {
  calculateBranchSupportTotals,
  validateBranchSupportForm,
} = await import('../src/utils/branchSupportInvoice.js')
const { BRANCH_SUPPORT_SERVICE_NAME } = await import('../src/constants/branchSupportService.js')

// Test 1: 200.000 × 20% + Tips 30.000 → HH 40.000, Tips 30.000, Tổng 70.000
{
  const totals = calculateBranchSupportTotals({
    priceInput: '200000',
    commissionRateInput: '20',
    tipsInput: '30000',
  })
  assert.equal(totals.serviceTotal, 200000)
  assert.equal(totals.commission, 40000)
  assert.equal(totals.tips, 30000)
  assert.equal(totals.commission + totals.tips, 70000)
  assert.equal(totals.services[0].name, BRANCH_SUPPORT_SERVICE_NAME)
}

// Test 2: 500.000 × 30%, Tips 0 → HH 150.000
{
  const totals = calculateBranchSupportTotals({
    priceInput: '500000',
    commissionRateInput: '30',
    tipsInput: '0',
  })
  assert.equal(totals.commission, 150000)
  assert.equal(totals.tips, 0)
}

// Test 3: ví dụ tài liệu 300.000 × 25% + Tips 50.000
{
  const totals = calculateBranchSupportTotals({
    priceInput: '300000',
    commissionRateInput: '25',
    tipsInput: '50000',
  })
  assert.equal(totals.commission, 75000)
  assert.equal(totals.tips, 50000)
  assert.equal(totals.commission + totals.tips, 125000)
  assert.equal(totals.services[0].commissionPercent, 25)
}

// Validation: giá / % / tips
{
  const base = {
    branchId: 'tra-vinh',
    employeeId: 'emp-1',
    priceInput: '200000',
    commissionRateInput: '20',
    tipsInput: '0',
  }
  assert.equal(Object.keys(validateBranchSupportForm(base)).length, 0, 'Tips=0 allowed')
  assert.ok(validateBranchSupportForm({ ...base, priceInput: '' }).supportPrice, 'Missing price blocked')
  assert.ok(validateBranchSupportForm({ ...base, priceInput: '0' }).supportPrice, 'Price=0 blocked')
  assert.ok(validateBranchSupportForm({ ...base, commissionRateInput: '' }).supportCommission, 'Missing % blocked')
  assert.ok(validateBranchSupportForm({ ...base, commissionRateInput: '0' }).supportCommission, '%=0 blocked')
  assert.ok(validateBranchSupportForm({ ...base, commissionRateInput: '101' }).supportCommission, '%>100 blocked')
  assert.ok(validateBranchSupportForm({ ...base, tipsInput: '' }).supportTips, 'Missing tips blocked')
}

console.log('PASS — branch support service totals and validation verified')
