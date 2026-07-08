import { useMemo, useState } from 'react'
import { COMMISSION_POLICY_TYPE } from '../../constants/commissionPolicyTypes'
import { getBranchCommissionPolicySummary } from '../../utils/commissionPolicyEngine'
import {
  listCommissionPolicies,
  updateBranchCommissionPolicy,
} from '../../utils/commissionPolicyStorage'

const POLICY_TYPE_OPTIONS = [
  { value: COMMISSION_POLICY_TYPE.FLAT, label: 'Đồng nhất (%)' },
  { value: COMMISSION_POLICY_TYPE.TIERED, label: 'Theo nhóm dịch vụ' },
]

function parseListInput(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatListInput(items = []) {
  return items.join(', ')
}

export default function BranchCommissionTab({ branchId, showToast }) {
  const [revision, setRevision] = useState(0)

  const policy = useMemo(() => {
    void revision
    return listCommissionPolicies().find((item) => item.branchId === branchId) ?? null
  }, [branchId, revision])

  const summary = useMemo(
    () => (policy ? getBranchCommissionPolicySummary(policy) : null),
    [policy],
  )

  const refresh = () => setRevision((v) => v + 1)

  const savePolicy = (patch) => {
    updateBranchCommissionPolicy(branchId, patch)
    refresh()
    showToast?.('Đã lưu chính sách hoa hồng')
  }

  if (!policy) {
    return <p className="admin-branches__hint">Chưa có chính sách hoa hồng cho chi nhánh này.</p>
  }

  return (
    <div className="admin-branches__commission">
      <p className="admin-branches__hint">{summary?.headline ?? ''}</p>
      <div className="admin-branches__form-grid">
        <label className="admin-branches__field">
          <span>Loại chính sách</span>
          <select
            value={policy.policyType}
            onChange={(e) => savePolicy({ policyType: e.target.value })}
          >
            {POLICY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        {policy.policyType === COMMISSION_POLICY_TYPE.FLAT && (
          <label className="admin-branches__field">
            <span>Tỷ lệ (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              value={policy.flatRate ?? policy.defaultRate ?? 20}
              onChange={(e) => savePolicy({ flatRate: Number(e.target.value) })}
            />
          </label>
        )}
      </div>
      {policy.policyType === COMMISSION_POLICY_TYPE.TIERED && (
        <div className="admin-branches__commission-groups">
          {(policy.groups ?? []).map((group, index) => (
            <div key={group.id ?? index} className="admin-branches__commission-group">
              <strong>{group.label ?? `Nhóm ${index + 1}`}</strong>
              <span>{group.rate ?? 0}%</span>
              <span>{formatListInput(group.serviceKeys ?? group.services ?? [])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
