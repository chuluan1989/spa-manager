/**
 * Chuyển đổi camelCase (JS) <-> snake_case (cột Postgres) cho các object
 * phẳng dùng chung giữa localStorage và Supabase. Các trường jsonb lồng
 * nhau bên trong (vd. `priceLists`, `services`, `overrides`) được giữ
 * nguyên dạng JS gốc — Postgres lưu chúng như jsonb, không cần đổi tên
 * field bên trong.
 */
export function camelToSnakeKey(key) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

export function snakeToCamelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())
}

export function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row
  const result = {}
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamelKey(key)] = value
  }
  return result
}

export function objectToSnakeRow(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnakeKey(key)] = value
  }
  return result
}

export function rowsToCamel(rows) {
  return Array.isArray(rows) ? rows.map(rowToCamel) : []
}
