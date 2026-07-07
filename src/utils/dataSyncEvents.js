export const SYNC_EVENT = 'spa-manager:data-synced'

export function notifyDataSynced(changedEntities) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { changedEntities } }))
}
