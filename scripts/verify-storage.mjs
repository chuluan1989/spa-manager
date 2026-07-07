/**
 * Kiểm tra bucket spa-images và quyền upload qua anon key.
 * Chạy: node --env-file=.env.local scripts/verify-storage.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    const env = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return env
  } catch {
    return process.env
  }
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

const testPath = `test/health-check/${Date.now()}.png`

console.log('Checking bucket spa-images...')

const { error: listError } = await supabase.storage.from('spa-images').list('test', { limit: 1 })
if (listError) {
  console.error('FAIL list:', listError.message)
  console.error('\n→ Chạy migration 0011_storage_buckets.sql trong Supabase Dashboard → SQL Editor')
  process.exit(1)
}

const { error: uploadError } = await supabase.storage.from('spa-images').upload(testPath, png, {
  contentType: 'image/png',
  upsert: true,
})

if (uploadError) {
  console.error('FAIL upload:', uploadError.message)
  console.error('\n→ Kiểm tra policy anon insert/update trong migration 0011')
  process.exit(1)
}

const { data } = supabase.storage.from('spa-images').getPublicUrl(testPath)
console.log('OK upload + public URL')
console.log('Sample URL:', data.publicUrl)

await supabase.storage.from('spa-images').remove([testPath])
console.log('Cleanup done.')
