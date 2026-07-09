import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { fetchInvoicesFiltered } from '../../repositories/invoicesRepository'
import { recordBelongsToBranch } from '../../utils/branchEmployeeMatch'

/** Hóa đơn theo branch_id — mới nhất trước (Supabase order created_at DESC). */
export function useBranchInvoices(branchId, { fromDate = '', toDate = '' } = {}) {
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
        if (!branchId) {
          setInvoices([])
          return
        }
        if (!isSupabaseConfigured) {
          throw new Error('Supabase chưa cấu hình. Không thể tải hóa đơn.')
        }

        const rows = await fetchInvoicesFiltered({ branchId, fromDate, toDate })
        if (cancelled) return

        setInvoices(
          (rows ?? []).filter((invoice) => recordBelongsToBranch(invoice, branchId)),
        )
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Không thể tải hóa đơn chi nhánh.')
          setInvoices([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [branchId, fromDate, toDate, refreshKey])

  return { invoices, loading, error, reload }
}
