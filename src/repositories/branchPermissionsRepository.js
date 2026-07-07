import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'

const TABLE = 'branch_role_permissions'

export async function fetchBranchPermissions() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertBranchPermissions(payload) {
  return upsertSingletonPayload(TABLE, payload)
}
