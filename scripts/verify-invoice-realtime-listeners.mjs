/**
 * Verify invoice Realtime multiplex + React StrictMode double-mount safety.
 * Run: npm run verify:invoice-realtime
 */
import assert from 'node:assert/strict'

let liveChannels = 0
const mockSupabase = {
  channel() {
    liveChannels += 1
    return { on() { return this }, subscribe() { return this } }
  },
  removeChannel() {
    liveChannels -= 1
  },
}

const {
  subscribeInvoicesChanges,
  getInvoicesRealtimeListenerCount,
  resetInvoicesRealtimeSubscriptionsForTests,
  setInvoicesRealtimeSupabaseForTests,
} = await import('../src/repositories/invoicesRepository.js')

setInvoicesRealtimeSupabaseForTests(mockSupabase)

function assertCount(expected, label) {
  assert.equal(getInvoicesRealtimeListenerCount(), expected, `${label}: listeners=${getInvoicesRealtimeListenerCount()}`)
}

resetInvoicesRealtimeSubscriptionsForTests()
setInvoicesRealtimeSupabaseForTests(mockSupabase)
assertCount(0, 'after reset')

function mountDashboardInvoiceListeners() {
  return [
    subscribeInvoicesChanges(() => {}),
    subscribeInvoicesChanges(() => {}),
    subscribeInvoicesChanges(() => {}),
  ]
}

function unmountAll(unsubs) {
  for (const unsub of unsubs) unsub()
}

const dash1 = mountDashboardInvoiceListeners()
assertCount(3, 'dashboard mount')
assert.equal(liveChannels, 1, 'one shared channel')

unmountAll(dash1)
assertCount(0, 'dashboard unmount')
assert.equal(liveChannels, 0, 'channel removed')

// React StrictMode dev: mount → unmount → mount lại (3 hook Dashboard)
const strictPass1 = mountDashboardInvoiceListeners()
assertCount(3, 'strict pass1 setup')
unmountAll(strictPass1)
assertCount(0, 'strict pass1 cleanup')
assert.equal(liveChannels, 0, 'strict pass1 channel gone')

const strictPass2 = mountDashboardInvoiceListeners()
assertCount(3, 'strict pass2 setup')
assert.equal(liveChannels, 1, 'strict pass2 channel recreated')
unmountAll(strictPass2)
assertCount(0, 'strict pass2 cleanup')

const fn = () => {}
const unsubA = subscribeInvoicesChanges(fn)
const unsubB = subscribeInvoicesChanges(fn)
assertCount(1, 'duplicate ref deduped in Set')
unsubA()
assertCount(0, 'single unsub clears deduped listener')
unsubB()
assertCount(0, 'second unsub idempotent')

const fn2 = () => {}
const unsubOnce = subscribeInvoicesChanges(fn2)
unsubOnce()
unsubOnce()
assertCount(0, 'double unsub idempotent')

resetInvoicesRealtimeSubscriptionsForTests()
assertCount(0, 'reset no leak')
assert.equal(liveChannels, 0, 'reset channel count')

console.log('PASS invoice realtime listeners (StrictMode-safe, no leak)')
