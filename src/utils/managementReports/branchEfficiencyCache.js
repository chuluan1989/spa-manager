/**
 * Cache báo cáo theo filter — tránh tính lại khi quay lại cùng kỳ.
 */
export function createBranchEfficiencyReportCache(maxEntries = 24) {
  const map = new Map()

  function makeKey({ fromDate = '', toDate = '', payloadId = '' } = {}) {
    return `${fromDate}|${toDate}|${payloadId}`
  }

  return {
    makeKey,
    get(key) {
      if (!map.has(key)) return null
      const value = map.get(key)
      // LRU: re-insert
      map.delete(key)
      map.set(key, value)
      return value
    },
    set(key, value) {
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value
        map.delete(oldest)
      }
      return value
    },
    has(key) {
      return map.has(key)
    },
    clear() {
      map.clear()
    },
    get size() {
      return map.size
    },
  }
}
