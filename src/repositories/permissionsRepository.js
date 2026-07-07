import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'

const TABLE = 'app_permissions'

export async function fetchPermissions() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertPermissions(permissions) {
  return upsertSingletonPayload(TABLE, permissions)
}
