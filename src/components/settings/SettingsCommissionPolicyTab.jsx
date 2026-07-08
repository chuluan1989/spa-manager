import { useMemo, useState } from 'react'
import { COMMISSION_POLICY_TYPE } from '../../constants/commissionPolicyTypes'
import { getBranchCommissionPolicySummary } from '../../utils/commissionPolicyEngine'
import {
  listCommissionPolicies,
  loadCommissionPolicyMap,
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

export default function SettingsCommissionPolicyTab({ showToast }) {
  const [policies, setPolicies] = useState(() => listCommissionPolicies())
  const [selectedBranchId, setSelectedBranchId] = useState(() => policies[0]?.branchId ?? '')

  const selected = useMemo(
    () => policies.find((item) => item.branchId === selectedBranchId) ?? policies[0] ?? null,
    [policies, selectedBranchId],
  )

  const refresh = () => {
    const next = listCommissionPolicies()
    setPolicies(next)
    if (!next.some((item) => item.branchId === selectedBranchId)) {
      setSelectedBranchId(next[0]?.branchId ?? '')
    }
  }

  const savePolicy = (patch) => {
    if (!selected) return
    updateBranchCommissionPolicy(selected.branchId, patch)
    refresh()
    showToast('Đã lưu chính sách hoa hồng')
  }

  const handleFlatRateChange = (value) => {
    const flatRate = Number(value)
    if (!Number.isFinite(flatRate) || flatRate < 0 || flatRate > 100) return
    savePolicy({ policyType: COMMISSION_POLICY_TYPE.FLAT, flatRate, defaultRate: flatRate })
  }

  const handleDefaultRateChange = (value) => {
    const defaultRate = Number(value)
    if (!Number.isFinite(defaultRate) || defaultRate < 0 || defaultRate > 100) return
    savePolicy({ policyType: COMMISSION_POLICY_TYPE.TIERED, defaultRate })
  }

  const handlePolicyTypeChange = (policyType) => {
    if (policyType === COMMISSION_POLICY_TYPE.FLAT) {
      savePolicy({
        policyType,
        flatRate: selected?.policy?.flatRate ?? selected?.policy?.defaultRate ?? 20,
        defaultRate: selected?.policy?.flatRate ?? selected?.policy?.defaultRate ?? 20,
      })
      return
    }
    savePolicy({
      policyType,
      groups: selected?.policy?.groups?.length
        ? selected.policy.groups
        : loadCommissionPolicyMap()[selected.branchId]?.groups ?? [],
    })
  }

  const updateGroup = (groupId, patch) => {
    const groups = (selected?.policy?.groups ?? []).map((group) => (
      group.id === groupId ? { ...group, ...patch } : group
    ))
    savePolicy({ groups })
  }

  const addGroup = () => {
    const groups = [
      ...(selected?.policy?.groups ?? []),
      {
        id: `group-${Date.now()}`,
        label: 'Nhóm mới',
        rate: 10,
        serviceIds: [],
        serviceNames: [],
      },
    ]
    savePolicy({ groups })
  }

  const removeGroup = (groupId) => {
    const groups = (selected?.policy?.groups ?? []).filter((group) => group.id !== groupId)
    savePolicy({ groups })
  }

  if (!selected) {
    return <p className="settings__hint">Chưa có chi nhánh để cấu hình.</p>
  }

  const policy = selected.policy

  return (
    <div className="settings__panel">
      <h3 className="settings__section-title">Chính sách hoa hồng</h3>
      <p className="settings__hint">
        Cấu hình tỷ lệ hoa hồng theo chi nhánh. Hóa đơn, bảng lương và báo cáo tự động áp dụng chính sách này.
      </p>

      <div className="settings__commission-layout">
        <aside className="settings__commission-branches">
          {policies.map((item) => (
            <button
              key={item.branchId}
              type="button"
              className={`settings__commission-branch${item.branchId === selected.branchId ? ' settings__commission-branch--active' : ''}`}
              onClick={() => setSelectedBranchId(item.branchId)}
            >
              <strong>{item.branchName}</strong>
              <span>{getBranchCommissionPolicySummary(item.branchId, item.policy)}</span>
            </button>
          ))}
        </aside>

        <section className="settings__commission-editor">
          <h4 className="settings__subheading">{selected.branchName}</h4>

          <label className="settings__field">
            <span>Kiểu chính sách</span>
            <select
              value={policy.policyType}
              onChange={(event) => handlePolicyTypeChange(event.target.value)}
            >
              {POLICY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {policy.policyType === COMMISSION_POLICY_TYPE.FLAT ? (
            <label className="settings__field">
              <span>Hoa hồng tất cả dịch vụ (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={policy.flatRate ?? policy.defaultRate ?? 0}
                onChange={(event) => handleFlatRateChange(event.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="settings__field">
                <span>% mặc định cho dịch vụ còn lại</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={policy.defaultRate ?? 20}
                  onChange={(event) => handleDefaultRateChange(event.target.value)}
                />
              </label>

              <div className="settings__commission-groups">
                <div className="settings__commission-groups-header">
                  <strong>Nhóm dịch vụ</strong>
                  <button type="button" className="settings__btn settings__btn--ghost" onClick={addGroup}>
                    + Thêm nhóm
                  </button>
                </div>

                {(policy.groups ?? []).map((group) => (
                  <div key={group.id} className="settings__commission-group">
                    <div className="settings__commission-group-row">
                      <label className="settings__field">
                        <span>Tên nhóm</span>
                        <input
                          type="text"
                          value={group.label ?? ''}
                          onChange={(event) => updateGroup(group.id, { label: event.target.value })}
                        />
                      </label>
                      <label className="settings__field">
                        <span>% hoa hồng</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={group.rate ?? 0}
                          onChange={(event) => updateGroup(group.id, { rate: Number(event.target.value) })}
                        />
                      </label>
                      <button
                        type="button"
                        className="settings__btn settings__btn--danger"
                        onClick={() => removeGroup(group.id)}
                      >
                        Xóa
                      </button>
                    </div>
                    <label className="settings__field">
                      <span>Mã dịch vụ (phân cách bằng dấu phẩy)</span>
                      <input
                        type="text"
                        value={formatListInput(group.serviceIds)}
                        onChange={(event) => updateGroup(group.id, { serviceIds: parseListInput(event.target.value) })}
                      />
                    </label>
                    <label className="settings__field">
                      <span>Tên dịch vụ (phân cách bằng dấu phẩy)</span>
                      <input
                        type="text"
                        value={formatListInput(group.serviceNames)}
                        onChange={(event) => updateGroup(group.id, { serviceNames: parseListInput(event.target.value) })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="settings__hint">
            Tips luôn hưởng 100% cho nhân viên chính. Nhân viên hỗ trợ nhận 50% hoa hồng dịch vụ, không nhận Tips.
          </p>
        </section>
      </div>
    </div>
  )
}
