import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(url, key)

const BRANCH = 'tram-spa'

const { data: employees, error: empErr } = await sb
  .from('employees')
  .select('id,name,branch_id,status,phone,updated_at')
  .eq('branch_id', BRANCH)
  .order('name')

if (empErr) {
  console.error('employees error:', empErr.message)
  process.exit(1)
}

const { data: credsRow } = await sb.from('app_credentials').select('payload').eq('id', 'default').maybeSingle()
const credEmployees = credsRow?.payload?.employees ?? {}

console.log('\n=== Trạm Spa employees ===\n')
for (const emp of employees ?? []) {
  const hasCred = Boolean(credEmployees[emp.id])
  const credName = credEmployees[emp.id]?.name ?? ''
  console.log(JSON.stringify({
    id: emp.id,
    name: emp.name,
    status: emp.status,
    phone: emp.phone,
    hasCredential: hasCred,
    credentialName: credName,
  }))
}

const suspicious = (employees ?? []).filter((e) =>
  /thanh\s*tram/i.test(e.name ?? '') || e.name === 'Thanhtram',
)

console.log('\n=== Suspicious Thanhtram records ===\n')
for (const emp of suspicious) {
  const [{ count: invPrimary }, { count: invSupport }, { count: att }, { count: adj }] = await Promise.all([
    sb.from('invoices').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
    sb.from('invoices').select('id', { count: 'exact', head: true }).eq('support_employee_id', emp.id),
    sb.from('attendance').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
    sb.from('payroll_adjustments').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
  ])
  console.log(JSON.stringify({
    id: emp.id,
    name: emp.name,
    status: emp.status,
    hasCredential: Boolean(credEmployees[emp.id]),
    invoicesPrimary: invPrimary ?? 0,
    invoicesSupport: invSupport ?? 0,
    attendance: att ?? 0,
    payrollAdjustments: adj ?? 0,
  }))
}

const thanhCanonical = (employees ?? []).find((e) => e.id === 'tram-spa-thanh' || e.name === 'Thanh')
if (thanhCanonical) {
  const [{ count: invPrimary }, { count: invSupport }] = await Promise.all([
    sb.from('invoices').select('id', { count: 'exact', head: true }).eq('employee_id', thanhCanonical.id),
    sb.from('invoices').select('id', { count: 'exact', head: true }).eq('support_employee_id', thanhCanonical.id),
  ])
  console.log('\n=== Canonical Thanh (keep) ===\n')
  console.log(JSON.stringify({
    id: thanhCanonical.id,
    name: thanhCanonical.name,
    status: thanhCanonical.status,
    hasCredential: Boolean(credEmployees[thanhCanonical.id]),
    invoicesPrimary: invPrimary ?? 0,
    invoicesSupport: invSupport ?? 0,
  }))
}

const deletable = suspicious.filter((emp) =>
  !credEmployees[emp.id]
  && emp.status === 'active',
)

if (process.env.CLEAN_INVALID_THANHTRAM === '1' && deletable.length > 0) {
  console.log('\n=== Deleting invalid Thanhtram records ===\n')
  for (const emp of deletable) {
    const [{ count: invPrimary }, { count: invSupport }, { count: att }, { count: adj }] = await Promise.all([
      sb.from('invoices').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
      sb.from('invoices').select('id', { count: 'exact', head: true }).eq('support_employee_id', emp.id),
      sb.from('attendance').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
      sb.from('payroll_adjustments').select('id', { count: 'exact', head: true }).eq('employee_id', emp.id),
    ])
    const total = (invPrimary ?? 0) + (invSupport ?? 0) + (att ?? 0) + (adj ?? 0)
    if (total > 0) {
      console.log('SKIP', emp.id, 'has activity', total)
      continue
    }
    const { error } = await sb.from('employees').delete().eq('id', emp.id)
    console.log(error ? `FAIL ${emp.id}: ${error.message}` : `DELETED ${emp.id} (${emp.name})`)
  }
}
