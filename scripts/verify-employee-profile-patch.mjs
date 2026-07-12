/**
 * Unit + Production tests for employee profile partial update / conflict / ACL.
 * Chạy: npx vite-node scripts/verify-employee-profile-patch.mjs
 *
 * Yêu cầu: đã chạy supabase/RUN_EMPLOYEE_PROFILE_AUDIT_LOGS.sql trên Production.
 */
import { createClient } from '@supabase/supabase-js'
import {
  ADMIN_ONLY_EMPLOYEE_FIELDS,
  EMPLOYEE_SELF_SERVICE_FIELDS,
  pickChangedEmployeeFields,
} from '../src/utils/employeeStorage.js'
import {
  PROFILE_CONFLICT_MESSAGE,
  buildEmployeePatchRow,
} from '../src/repositories/employeesRepository.js'

const BASE = process.env.PRODUCTION_URL ?? 'https://www.khoespa.net.vn'
let passed = 0
let failed = 0

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\nUnit: dirty fields + ACL + patch row')
{
  const baseline = { phone: '0901', currentAddress: 'A', commissionRate: '20', salaryRate: '50' }
  const form = { phone: '0902', currentAddress: 'A', commissionRate: '99', salaryRate: '1' }
  const dirty = pickChangedEmployeeFields(form, baseline, EMPLOYEE_SELF_SERVICE_FIELDS)
  ok('Chỉ phone dirty (không gửi commission)', dirty.phone === '0902' && dirty.commissionRate === undefined)
  const stripped = { ...dirty, commissionRate: '0', endDate: 'x' }
  for (const key of ADMIN_ONLY_EMPLOYEE_FIELDS) delete stripped[key]
  ok('Strip field Admin', stripped.commissionRate === undefined && stripped.endDate === undefined)
  const row = buildEmployeePatchRow({ phone: '0902', endDate: '2026-12-01', commissionRate: '15' })
  ok('Map endDate → days_off', row.days_off === '2026-12-01' && row.commission_rate === '15')
  ok('Conflict message đúng', PROFILE_CONFLICT_MESSAGE.includes('thiết bị khác'))
}

console.log(`\nProduction patch tests — ${BASE}`)
const html = await fetch(BASE).then((r) => r.text())
const jsMatch = html.match(/\/assets\/index-[^"]+\.js/)
ok('Có bundle Production', Boolean(jsMatch), jsMatch?.[0])
const js = await fetch(`${BASE}${jsMatch[0]}`).then((r) => r.text())
const url = js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0]
const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0]
  ?? js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
ok('Có Supabase credentials trong bundle', Boolean(url && key))
ok('Bundle có partial update / conflict', js.includes('thiết bị khác') || js.includes('PROFILE_CONFLICT'))

const sb = createClient(url, key)
const { data: emp } = await sb
  .from('employees')
  .select('id,phone,current_address,commission_rate,salary_rate,days_off,updated_at,name')
  .eq('id', 'bac-lieu-my-nhien')
  .maybeSingle()

ok('Có employee mẫu', Boolean(emp?.id))

if (emp?.id) {
  const before = { ...emp }
  const t1 = new Date().toISOString()

  // Test A: Machine A updates phone with expected updated_at
  const { data: aRows, error: aErr } = await sb
    .from('employees')
    .update({ phone: '0364617906', updated_at: t1 })
    .eq('id', emp.id)
    .eq('updated_at', before.updated_at)
    .select('id,phone,updated_at,commission_rate,salary_rate,days_off,current_address')
  ok('Test A — Máy A lưu phone OK', !aErr && aRows?.length === 1, aErr?.message)
  const afterA = aRows?.[0]

  // Stale Machine B tries to update address with OLD updated_at
  const { data: bRows, error: bErr } = await sb
    .from('employees')
    .update({ current_address: '__STALE_SHOULD_FAIL__', updated_at: new Date().toISOString() })
    .eq('id', emp.id)
    .eq('updated_at', before.updated_at)
    .select('id')
  ok('Test A — Máy B stale bị chặn (0 row)', !bErr && (!bRows || bRows.length === 0), bErr?.message)

  const { data: mid } = await sb
    .from('employees')
    .select('phone,current_address,commission_rate,salary_rate,days_off,updated_at')
    .eq('id', emp.id)
    .single()
  ok('Test A — phone A giữ, address không bị stale', mid.phone === '0364617906' && mid.current_address !== '__STALE_SHOULD_FAIL__')

  // Test B/C: employee-like patch only phone — ERP unchanged
  const erpBefore = {
    commission_rate: mid.commission_rate ?? '',
    salary_rate: mid.salary_rate ?? '',
    days_off: mid.days_off ?? '',
  }
  const t2 = new Date().toISOString()
  const { data: cRows, error: cErr } = await sb
    .from('employees')
    .update({ current_address: before.current_address ?? '', updated_at: t2 })
    .eq('id', emp.id)
    .eq('updated_at', mid.updated_at)
    .select('commission_rate,salary_rate,days_off,updated_at')
  ok('Test B/C — patch address không đụng ERP', !cErr && cRows?.length === 1
    && String(cRows[0].commission_rate ?? '') === String(erpBefore.commission_rate)
    && String(cRows[0].salary_rate ?? '') === String(erpBefore.salary_rate)
    && String(cRows[0].days_off ?? '') === String(erpBefore.days_off), cErr?.message)

  // Restore phone/address/updated path
  await sb.from('employees').update({
    phone: before.phone ?? '',
    current_address: before.current_address ?? '',
    updated_at: new Date().toISOString(),
  }).eq('id', emp.id)

  // Test E: audit table exists
  const { error: auditErr } = await sb.from('employee_profile_audit_logs').select('id').limit(1)
  ok('Test E — bảng employee_profile_audit_logs tồn tại', !auditErr, auditErr?.message)

  if (!auditErr) {
    const auditId = `epa-test-${Date.now()}`
    const { error: insErr } = await sb.from('employee_profile_audit_logs').insert({
      id: auditId,
      employee_id: emp.id,
      changed_by: 'verify-script',
      changed_by_role: 'employee',
      changed_fields: ['phone'],
      old_values: { phone: 'x' },
      new_values: { phone: 'y' },
      changed_at: new Date().toISOString(),
      source_device: 'verify-employee-profile-patch',
    })
    ok('Test E — ghi audit log OK', !insErr, insErr?.message)
    await sb.from('employee_profile_audit_logs').delete().eq('id', auditId)
  }
}

console.log(`\nKết quả: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
