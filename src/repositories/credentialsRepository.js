import { fetchSingletonPayload, upsertSingletonPayload } from './singletonRepository'
import { branchManagerDefaultPassword } from '../login/loginRules'
import { verifyPassword } from '../utils/passwordHash'

const TABLE = 'app_credentials'
const TRAM_SPA_BRANCH_ID = 'tram-spa'

export async function fetchCredentials() {
  return fetchSingletonPayload(TABLE)
}

export async function upsertCredentials(credentials) {
  return upsertSingletonPayload(TABLE, credentials)
}

function branchKeysFingerprint(credentials) {
  return Object.keys(credentials?.branches ?? {}).sort().join(',')
}

/**
 * Ghi app_credentials lên Supabase và đọc lại để xác nhận — không tin object trong RAM.
 * @throws {Error} khi ghi thất bại, read-back không khớp, hoặc tram-spa hash sai
 */
export async function persistCredentialsPayload(credentials) {
  await upsertSingletonPayload(TABLE, credentials, { required: true })

  const remote = await fetchSingletonPayload(TABLE)
  if (!remote) {
    throw new Error('Ghi app_credentials thất bại: đọc lại từ Supabase trả về null')
  }

  const localBranches = branchKeysFingerprint(credentials)
  const remoteBranches = branchKeysFingerprint(remote)
  if (!remoteBranches) {
    throw new Error('Ghi app_credentials thất bại: branches rỗng trên Supabase sau khi ghi')
  }
  if (localBranches !== remoteBranches) {
    throw new Error(
      `Ghi app_credentials không khớp branches: vừa ghi [${localBranches}] — Supabase [${remoteBranches}]`,
    )
  }

  const expectedTramHash = credentials.branches?.[TRAM_SPA_BRANCH_ID]
  const remoteTramHash = remote.branches?.[TRAM_SPA_BRANCH_ID]
  if (!remoteTramHash) {
    throw new Error(`Ghi app_credentials thất bại: thiếu hash chi nhánh ${TRAM_SPA_BRANCH_ID} trên Supabase`)
  }
  if (expectedTramHash && remoteTramHash !== expectedTramHash) {
    throw new Error(
      `Ghi app_credentials thất bại: hash ${TRAM_SPA_BRANCH_ID} trên Supabase khác dữ liệu vừa ghi`,
    )
  }

  const tramPlain = branchManagerDefaultPassword(TRAM_SPA_BRANCH_ID)
  const tramPasswordOk = await verifyPassword(tramPlain, remoteTramHash)
  if (!tramPasswordOk) {
    throw new Error(
      `Ghi app_credentials thất bại: verifyPassword("${tramPlain}", storedHash) = false trên Supabase`,
    )
  }

  return remote
}
