import { useMemo, useRef, useState } from 'react'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { getActiveBranches } from '../../constants/branches'
import {
  COPY_PRICE_MODES,
  copyBranchCatalogConfig,
  loadBranchCatalog,
  loadBranchServicePricesV2,
  previewCopyBranchPricing,
  saveBranchCatalog,
  saveBranchServicePricesV2,
} from '../../utils/serviceCatalogV2Storage'
import {
  getServicePricingEditBlockReason,
  isServicePricingEditable,
} from '../../utils/servicePricingGuard'
import ServiceCatalogTab from './ServiceCatalogTab'

const MODE_OPTIONS = [
  { value: COPY_PRICE_MODES.ADD_MISSING, label: 'Chỉ thêm dịch vụ thiếu' },
  { value: COPY_PRICE_MODES.OVERWRITE_PRICE, label: 'Ghi đè giá' },
  { value: COPY_PRICE_MODES.OVERWRITE_PERCENT, label: 'Ghi đè %' },
  { value: COPY_PRICE_MODES.OVERWRITE_BOTH, label: 'Ghi đè cả hai' },
]

export default function ServiceAdvancedTab({ showToast }) {
  const branches = useMemo(() => getActiveBranches(), [])
  const [branchId, setBranchId] = useState(() => branches[0]?.id ?? '')
  const [copyFrom, setCopyFrom] = useState('')
  const [copyTargets, setCopyTargets] = useState([])
  const [copyMode, setCopyMode] = useState(COPY_PRICE_MODES.ADD_MISSING)
  const [copyReason, setCopyReason] = useState('')
  const [preview, setPreview] = useState(null)
  const [copying, setCopying] = useState(false)
  const importRef = useRef(null)
  const blockReason = getServicePricingEditBlockReason()

  const toggleCopyTarget = (id) => {
    setCopyTargets((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ))
    setPreview(null)
  }

  const handlePreview = () => {
    if (!copyFrom || !copyTargets.length) {
      showToast('Chọn chi nhánh nguồn và ít nhất một chi nhánh đích.')
      return
    }
    const byTarget = copyTargets.map((toBranchId) => ({
      toBranchId,
      toName: getPayrollBranchDisplayTitle(
        toBranchId,
        branches.find((b) => b.id === toBranchId)?.name || toBranchId,
      ),
      ...previewCopyBranchPricing(copyFrom, toBranchId),
    }))
    setPreview(byTarget)
  }

  const handleConfirmCopy = async () => {
    if (!preview?.length) {
      showToast('Xem preview trước khi sao chép.')
      return
    }
    if (!isServicePricingEditable()) {
      showToast(blockReason || 'Không thể chỉnh bảng giá khi đang offline.')
      return
    }
    const reason = copyReason.trim()
    if (!reason) {
      showToast('Vui lòng nhập lý do sao chép.')
      return
    }

    setCopying(true)
    try {
      const result = await copyBranchCatalogConfig(copyFrom, copyTargets, {
        mode: copyMode,
        reason,
      })
      showToast(`✓ Đã sao chép sang ${result.targetCount} chi nhánh (${result.applied} dòng giá).`)
      setCopyTargets([])
      setPreview(null)
      setCopyReason('')
    } catch (error) {
      showToast(error?.message || 'Không thể sao chép bảng giá.')
    } finally {
      setCopying(false)
    }
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

    if (!isServicePricingEditable()) {
      showToast(blockReason || 'Không thể chỉnh bảng giá khi đang offline.')
      return
    }

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
      // Import JSON vẫn ghi local + remote sync hiện có; không bypass offline guard ở UI.
      saveBranchServicePricesV2(allPrices)
      showToast('✓ Đã import cấu hình vào chi nhánh đang chọn.')
    } catch {
      showToast('Không thể đọc file import.')
    }
  }

  return (
    <div className="svc-mgmt-advanced">
      {blockReason ? (
        <p className="svc-mgmt__empty svc-mgmt__error" role="status">{blockReason}</p>
      ) : null}

      <section className="settings__card svc-mgmt-advanced__panel">
        <h3 className="settings__card-title">Sao chép cấu hình</h3>
        <p className="settings__hint">
          Xem preview trước, chọn chế độ ghi đè, rồi xác nhận. Không sao chép ghi đè ngay.
        </p>
        <div className="svc-mgmt-advanced__grid">
          <label>
            <span>Từ chi nhánh</span>
            <select
              value={copyFrom}
              onChange={(e) => {
                setCopyFrom(e.target.value)
                setPreview(null)
              }}
            >
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
          <label>
            <span>Chế độ</span>
            <select value={copyMode} onChange={(e) => setCopyMode(e.target.value)}>
              {MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Lý do (bắt buộc khi xác nhận)</span>
            <input
              value={copyReason}
              onChange={(e) => setCopyReason(e.target.value)}
              placeholder="Ví dụ: Đồng bộ bảng giá khai trương…"
              disabled={Boolean(blockReason)}
            />
          </label>
        </div>
        <div className="svc-mgmt-advanced__io" style={{ marginTop: 12 }}>
          <button type="button" className="settings__btn" onClick={handlePreview}>
            Xem preview
          </button>
          <button
            type="button"
            className="settings__btn settings__btn--primary"
            onClick={handleConfirmCopy}
            disabled={copying || Boolean(blockReason) || !preview?.length}
          >
            {copying ? 'Đang sao chép…' : 'Xác nhận sao chép'}
          </button>
        </div>

        {preview?.length ? (
          <div className="svc-mgmt-modal__preview" style={{ marginTop: 16 }}>
            {preview.map((item) => (
              <div key={item.toBranchId} style={{ marginBottom: 12 }}>
                <strong>→ {item.toName}</strong>
                <p>Dịch vụ mới: {item.added.length}</p>
                <p>Giá thay đổi: {item.priceChanged.length}</p>
                <p>% thay đổi: {item.percentChanged.length}</p>
                <p>Dịch vụ bị ghi đè (theo chế độ): {item.overwritten.length}</p>
                {item.added.slice(0, 5).map((row) => (
                  <p key={`a-${row.durationId}`}>+ {row.name}: {row.price.toLocaleString('vi-VN')} · {row.commissionPercent}%</p>
                ))}
                {item.overwritten.slice(0, 5).map((row) => (
                  <p key={`o-${row.durationId}`}>
                    ~ {row.name}
                    {row.priceChanged ? ` · giá ${row.oldPrice.toLocaleString('vi-VN')}→${row.newPrice.toLocaleString('vi-VN')}` : ''}
                    {row.percentChanged ? ` · % ${row.oldPercent}→${row.newPercent}` : ''}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : null}
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
          <button
            type="button"
            className="settings__btn"
            onClick={() => importRef.current?.click()}
            disabled={Boolean(blockReason)}
          >
            Import JSON
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
        </div>
      </section>

      <ServiceCatalogTab showToast={showToast} />
    </div>
  )
}
