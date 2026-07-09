import assert from 'node:assert/strict'
import {
  buildRemoteInvoiceIndex,
  collectAllLocalInvoices,
  findUnsyncedLocalInvoices,
  isInvoiceAlreadyOnRemote,
  scopeInvoicesForUser,
} from '../src/utils/invoiceLegacyMigrate.js'
import { ROLES } from '../src/constants/roles.js'

function createStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

globalThis.localStorage = createStorage()

localStorage.setItem('spa-manager-invoices', JSON.stringify([{
  id: 'inv-local-1',
  date: '2026-07-05',
  branchId: 'vinh-long',
  employeeId: 'vinh-long-linh',
  total: 350000,
  createdAt: '2026-07-05T10:00:00.000Z',
  serviceIds: ['body-60'],
  services: [{ id: 'body-60', name: 'Body', price: 300000 }],
  tips: 50000,
  serviceTotal: 300000,
}]))

localStorage.setItem('old-spa-tours', JSON.stringify([{
  id: 'inv-local-2',
  date: '2026-07-06',
  branch_id: 'vinh-long',
  employee_id: 'other-emp',
  total: 200000,
  created_at: '2026-07-06T08:00:00.000Z',
}]))

const all = collectAllLocalInvoices()
assert.equal(all.length, 2)

const employee = { role: ROLES.EMPLOYEE, employeeId: 'vinh-long-linh', branch: 'vinh-long' }
const scoped = scopeInvoicesForUser(all, employee)
assert.equal(scoped.length, 1)

const remoteIndex = buildRemoteInvoiceIndex([{
  id: 'x',
  date: '2026-07-05',
  employeeId: 'vinh-long-linh',
  total: 350000,
  createdAt: '2026-07-05T10:00:00.000Z',
}])
assert.equal(isInvoiceAlreadyOnRemote(scoped[0], remoteIndex), true)
assert.equal(findUnsyncedLocalInvoices(scoped, buildRemoteInvoiceIndex([])).length, 1)

console.log('invoice migrate tests OK')
