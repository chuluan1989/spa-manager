import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchInvoices, subscribeInvoicesChanges } from '../repositories/invoicesRepository'
import { replaceAllInvoices } from '../utils/invoiceStorage'
import { subscribeToDataSync } from '../utils/supabaseSync'

/**
 * Danh sách hóa đơn từ Supabase — nguồn duy nhất cho UI (Admin/Nhân viên).
 * localStorage chỉ là cache phụ sau khi ghi thành công.
 */
export function useInvoicesData() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
        }
        const rows = await fetchInvoices()
        if (!cancelled) {
          const list = Array.isArray(rows) ? rows : []
          setInvoices(list)
          replaceAllInvoices(list)
          setError('')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải hóa đơn từ Supabase.')
          setInvoices([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  useEffect(() => {
    const onLiveChange = () => reload()
    const unsubInvoices = subscribeInvoicesChanges(onLiveChange)
    const unsubSync = subscribeToDataSync((detail) => {
      const changed = detail?.changedEntities ?? []
      if (changed.includes('invoices')) reload()
    })
    return () => {
      unsubInvoices()
      unsubSync()
    }
  }, [reload])

  return { invoices, loading, error, reload }
}
