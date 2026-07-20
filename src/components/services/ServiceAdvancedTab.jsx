import { useMemo, useRef, useState } from 'react'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { getActiveBranches } from '../../constants/branches'
import {
  copyBranchCatalogConfig,
  loadBranchCatalog,
  loadBranchServicePricesV2,
  saveBranchCatalog,
  saveBranchServicePricesV2,
} from '../../utils/serviceCatalogV2Storage'
import ServiceCatalogTab from './ServiceCatalogTab'

export default function ServiceAdvancedTab({ showToast }) {
  const branches = useMemo(() => getActiveBranches(), [])
  const [branchId, setBranchId] = useState(() => branches[0]?.id ?? '')
  const [copyFrom, setCopyFrom] = useState('')
  const [copyTargets, setCopyTargets] = useState([])
  const importRef = useRef(null)

  const toggleCopyTarget = (id) => {
    setCopyTargets((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ))
  }

  const handleCopy = () => {
    if (!copyFrom || !copyTargets.length) {
      showToast('Chọn chi nhánh nguồn và ít nhất một chi nhánh đích.')
      return
    }
    const count = copyBranchCatalogConfig(copyFrom, copyTargets)
    showToast(`✓ Đã sao chép cấu hình sang ${count} chi nhánh.`)
    setCopyTargets([])
  }

  const handleExport = () => {
    if (!branchId) return
    const payload = {
      version: 1,
      branchId,
      catalog: loadBranchCatalog(branchId),
      prices: loadBranchServicePricesV2()[branchId] ?? {},
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `catalog-${branchId}.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast('✓ Đã xuất cấu hình chi nhánh.')
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !branchId) return

    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!payload?.catalog) {
        showToast('File không hợp lệ — thiếu catalog.')
        return
      }
      saveBranchCatalog(branchId, payload.catalog)
      const allPrices = loadBranchServicePricesV2()
      allPrices[branchId] = payload.prices ?? {}
      saveBranchServicePricesV2(allPrices)
      showToast('✓ Đã import cấu hình vào chi nhánh đang chọn.')
    } catch {
      showToast('Không thể đọc file import.')
    }
  }

  return (
    <div className="svc-mgmt-advanced">
      <section className="settings__card svc-mgmt-advanced__panel">
        <h3 className="settings__card-title">Sao chép cấu hình</h3>
        <p className="settings__hint">Sao chép catalog và bảng giá từ một chi nhánh sang các chi nhánh khác.</p>
        <div className="svc-mgmt-advanced__grid">
          <label>
            <span>Từ chi nhánh</span>
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">— Chọn —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{getPayrollBranchDisplayTitle(b.id, b.name)}</option>
              ))}
            </select>
          </label>
          <div className="svc-mgmt-advanced__targets">
            <span>Sang chi nhánh</span>
            <div className="svc-mgmt-advanced__checks">
              {branches.filter((b) => b.id !== copyFrom).map((b) => (
                <label key={b.id}>
                  <input
                    type="checkbox"
                    checked={copyTargets.includes(b.id)}
                    onChange={() => toggleCopyTarget(b.id)}
                  />
                  {getPayrollBranchDisplayTitle(b.id, b.name)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="settings__btn settings__btn--primary" onClick={handleCopy}>
          Sao chép
        </button>
      </section>

      <section className="settings__card svc-mgmt-advanced__panel">
        <h3 className="settings__card-title">Import / Export</h3>
        <p className="settings__hint">Xuất hoặc nhập JSON catalog + giá theo chi nhánh.</p>
        <label>
          <span>Chi nhánh</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{getPayrollBranchDisplayTitle(b.id, b.name)}</option>
            ))}
          </select>
        </label>
        <div className="svc-mgmt-advanced__io">
          <button type="button" className="settings__btn" onClick={handleExport}>Export JSON</button>
          <button type="button" className="settings__btn" onClick={() => importRef.current?.click()}>
            Import JSON
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
        </div>
      </section>

      <ServiceCatalogTab showToast={showToast} />
    </div>
  )
}
