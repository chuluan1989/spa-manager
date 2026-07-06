const SALT = 'spa-manager-v1'

export function isPasswordHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export async function hashPassword(password) {
  const text = SALT + String(password ?? '')
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(text)
    const buffer = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i)
    hash &= hash
  }
  return Math.abs(hash).toString(16).padStart(16, '0').repeat(4).slice(0, 64)
}

export async function verifyPassword(password, stored) {
  if (!stored) return false
  if (isPasswordHash(stored)) {
    const inputHash = await hashPassword(password)
    return inputHash === stored
  }
  return String(password) === String(stored)
}
