import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'

const TABLE = 'app_credentials'

export async function fetchCredentials() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertCredentials(credentials) {
  return upsertSingletonPayload(TABLE, credentials)
}
