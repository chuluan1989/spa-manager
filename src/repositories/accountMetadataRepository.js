import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'

const TABLE = 'account_metadata'

export async function fetchAccountMetadata() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertAccountMetadata(payload) {
  return upsertSingletonPayload(TABLE, payload)
}
