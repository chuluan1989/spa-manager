import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'

const TABLE = 'app_settings'

export async function fetchSettings() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertSettings(settings) {
  return upsertSingletonPayload(TABLE, settings)
}
