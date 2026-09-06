import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import {
  fetchInvoicesFiltered,
  hasInvoiceFetchScope,
  INVOICE_SCOPE_REQUIRED_MESSAGE,
  subscribeInvoicesChanges,
} from '../repositories/invoicesRepository'
import { replaceAllInvoices } from '../utils/invoiceStorage'
import { subscribeToDataSync } from '../utils/supabaseSync'
import { changedEntitiesInclude, createDebouncedLiveReload } from '../utils/liveDataReload'

/**
 * Danh sách hóa đơn từ Supabase — nguồn duy nhất cho UI (Admin/Nhân viên).
 * localStorage chỉ là cache phụ sau khi ghi thành công.
 * Bắt buộc có scope ngày/chi nhánh/nhân viên — không tải toàn bộ lịch sử.
 */
export function useInvoicesData(scope = {}) {
  const fromDate = scope.fromDate || ''
  const toDate = scope.toDate || ''
  const branchId = scope.branchId || ''
  const employeeId = scope.employeeId || ''
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
        const fetchScope = { fromDate, toDate, branchId, employeeId }
        if (!hasInvoiceFetchScope(fetchScope)) {
          throw new Error(INVOICE_SCOPE_REQUIRED_MESSAGE)
        }
        const rows = await fetchInvoicesFiltered(fetchScope)
        if (!cancelled) {
          const list = Array.isArray(rows) ? rows : []
          setInvoices(list)
          setError('')
          try {
            replaceAllInvoices(list)
          } catch (cacheError) {
            console.warn(
              '[Invoice] Cache localStorage thất bại — UI vẫn dùng Supabase.',
              cacheError?.message,
            )
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải hóa đơn từ Supabase.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey, fromDate, toDate, branchId, employeeId])

  useEffect(() => {
    const debounced = createDebouncedLiveReload(reload)
    const unsubInvoices = subscribeInvoicesChanges(() => debounced())
    const unsubSync = subscribeToDataSync((detail) => {
      if (changedEntitiesInclude(detail, ['invoices'])) debounced()
    })
    return () => {
      debounced.cancel()
      unsubInvoices()
      unsubSync()
    }
  }, [reload])

  return { invoices, loading, error, reload }
}
