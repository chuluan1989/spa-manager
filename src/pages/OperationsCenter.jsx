import { useState } from 'react'
import OpsCenterLayout from '../components/opsCenter/OpsCenterLayout'
import '../components/opsCenter/OpsCenter.css'
import { useOpsCenterData } from '../hooks/useOpsCenterData'
import { canAccessOpsCenter } from '../utils/opsCenter/opsCenterAccess'

export default function OperationsCenter({ onNavigate }) {
  const [periodMode, setPeriodMode] = useState('month')
  const data = useOpsCenterData(periodMode)

  if (!canAccessOpsCenter()) {
    return (
      <div className="ops-center erp-page">
        <h1>Điều hành</h1>
        <p className="ops-center__state">
          Bạn không có quyền xem Operations Center, hoặc tính năng đang tắt (opsCenterEnabled).
        </p>
      </div>
    )
  }

  return (
    <OpsCenterLayout
      periodMode={periodMode}
      onChangePeriod={setPeriodMode}
      financeSummary={data.financeSummary}
      filters={data.filters}
      financeLoading={data.financeLoading}
      financeRefreshing={data.financeRefreshing}
      financeError={data.financeError}
      todayHealth={data.todayHealth}
      alerts={data.alerts}
      opsLoading={data.opsLoading}
      opsRefreshing={data.opsRefreshing}
      opsError={data.opsError}
      lastUpdatedAt={data.lastUpdatedAt}
      refreshing={data.refreshing}
      onRefresh={data.reload}
      onNavigate={onNavigate}
    />
  )
}
