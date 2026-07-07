import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { objectToSnakeRow, rowsToCamel } from './caseUtils'

const TABLE = 'services'

export async function fetchServices() {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) throw error
  return rowsToCamel(data)
}

export async function upsertServices(services) {
  if (!isSupabaseConfigured || !Array.isArray(services) || services.length === 0) return
  const rows = services.map((service) =>
    objectToSnakeRow({ ...service, updatedAt: new Date().toISOString() }),
  )
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'id' })
  if (error) throw error
}
