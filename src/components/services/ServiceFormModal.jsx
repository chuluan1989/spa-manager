import { useEffect, useState } from 'react'
import { getPayrollBranchDisplayTitle } from '../../constants/branchPayrollDisplay'
import { getActiveBranches } from '../../constants/branches'
import {
  createServiceWithPricing,
  getCatalogAdminTree,
  ITEM_STATUS,
  updateDuration,
  updateService,
  setBranchDurationPrice,
} from '../../utils/serviceCatalogV2Storage'
import {
  parseCommissionPercentInput,
  parsePriceInput,
} from '../../utils/serviceManagementHelpers'
import {
  getServicePricingEditBlockReason,
  isServicePricingEditable,
} from '../../utils/servicePricingGuard'

const COMMISSION_CHIPS = [10, 20, 25, 30, 35, 40]

const EMPTY = {
  branchId: '',
  categoryId: '',
  name: '',
  description: '',
  durationMinutes: '60',
  price: '',
  commissionPercent: '20',
  status: ITEM_STATUS.ACTIVE,
  reason: '',
}

export default function ServiceFormModal({
  open,
  mode = 'add',
  initial,
  onClose,
  onSaved,
}) {
  const branches = getActiveBranches()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [onlineEditable, setOnlineEditable] = useState(() => isServicePricingEditable())

  useEffect(() => {
    if (!open) return
    const activeBranches = getActiveBranches()
    setForm({
      ...EMPTY,
      branchId: initial?.branchId ?? activeBranches[0]?.id ?? '',
      categoryId: initial?.categoryId ?? '',
      name: initial?.serviceName ?? '',
      description: initial?.description ?? '',
      durationMinutes: initial?.durationMinutes ?? '60',
      price: initial?.price != null ? String(initial.price) : '',
      commissionPercent: initial?.commissionPercent != null ? String(initial.commissionPercent) : '20',
      status: initial?.isActive === false ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE,
      durationId: initial?.durationId ?? '',
      serviceId: initial?.serviceId ?? '',
      reason: '',
    })
    setError('')
    setSaving(false)
    setOnlineEditable(isServicePricingEditable())
  }, [open, initial])

  useEffect(() => {
    const syncOnline = () => setOnlineEditable(isServicePricingEditable())
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
    return () => {
      window.removeEventListener('online', syncOnline)
      window.removeEventListener('offline', syncOnline)
    }
  }, [])

  if (!open) return null

  const tree = form.branchId ? getCatalogAdminTree(form.branchId) : []
  const categories = tree.map((c) => ({ id: c.id, name: c.name }))

  const price = parsePriceInput(form.price)
  const commission = parseCommissionPercentInput(form.commissionPercent)
  const priceChanged = mode === 'edit' && initial && price !== initial.price
  const percentChanged = mode === 'edit' && initial && commission !== initial.commissionPercent
  const showPreview = mode === 'edit' && (priceChanged || percentChanged)
  const pricingChanged = mode === 'add' || priceChanged || percentChanged
  const blockReason = getServicePricingEditBlockReason()
  const reasonOk = String(form.reason ?? '').trim().length > 0

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.branchId || !form.name.trim()) return
    if (!form.categoryId && mode === 'add') return
    if (!Number.isFinite(price)) return
    if (!Number.isFinite(commission)) return

    if (pricingChanged) {
      if (!onlineEditable) {
        setError(blockReason || 'Không thể chỉnh bảng giá khi đang offline.')
        return
      }
      if (!reasonOk) {
        setError('Vui lòng nhập lý do thay đổi giá/% hoa hồng.')
        return
      }
    }

    setSaving(true)
    setError('')
    try {
      if (mode === 'add') {
        await createServiceWithPricing({
          branchId: form.branchId,
          categoryId: form.categoryId,
          name: form.name.trim(),
          description: form.description,
          durationMinutes: form.durationMinutes,
          price,
          commissionPercent: commission,
          status: form.status,
          reason: form.reason.trim(),
        })
      } else {
        updateService(form.branchId, form.serviceId, {
          name: form.name.trim(),
          description: form.description.trim(),
          status: form.status,
        })
        updateDuration(form.branchId, form.durationId, {
          durationMinutes: form.durationMinutes,
          status: form.status,
        })
        if (pricingChanged) {
          await setBranchDurationPrice(form.branchId, form.durationId, {
            price,
            commissionPercent: commission,
          }, { reason: form.reason.trim() })
        }
      }

      onSaved?.({
        mode,
        message: commission !== initial?.commissionPercent && price !== initial?.price
          ? 'percent_and_price'
          : commission !== initial?.commissionPercent
            ? 'percent'
            : 'price',
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Không thể lưu dịch vụ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="svc-mgmt-modal" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={() => !saving && onClose()} />
      <form className="svc-mgmt-modal__panel" onSubmit={handleSubmit}>
        <header className="svc-mgmt-modal__head">
          <h3>{mode === 'add' ? 'Thêm dịch vụ mới' : 'Sửa dịch vụ'}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" disabled={saving}>×</button>
        </header>

        <div className="svc-mgmt-modal__body">
          {blockReason ? (
            <p className="svc-mgmt__empty svc-mgmt__error" role="status">{blockReason}</p>
          ) : null}

          <label>
            Chi nhánh áp dụng
            <select
              value={form.branchId}
              disabled={mode === 'edit' || saving}
              onChange={(e) => setForm({ ...form, branchId: e.target.value, categoryId: '' })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{getPayrollBranchDisplayTitle(b.id, b.name)}</option>
              ))}
            </select>
          </label>

          <label>
            Nhóm dịch vụ
            <select
              value={form.categoryId}
              disabled={mode === 'edit' || saving}
              required
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">— Chọn nhóm —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label>
            Tên dịch vụ
            <input
              required
              value={form.name}
              disabled={saving}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            Mô tả ngắn (không bắt buộc)
            <textarea
              rows={2}
              placeholder="Dùng cho website / app sau này"
              value={form.description}
              disabled={saving}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label>
            Thời lượng (phút)
            <input
              type="number"
              min="0"
              value={form.durationMinutes}
              disabled={saving}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </label>

          <label>
            Giá bán
            <input
              required
              inputMode="numeric"
              value={form.price}
              disabled={saving || !onlineEditable}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>

          <label>
            % Hoa hồng nhân viên
            <div className="svc-mgmt-modal__percent-row">
              <input
                required
                inputMode="decimal"
                value={form.commissionPercent}
                disabled={saving || !onlineEditable}
                onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
              />
              <span>%</span>
            </div>
            <div className="svc-mgmt-modal__chips">
              {COMMISSION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="svc-mgmt-modal__chip"
                  disabled={saving || !onlineEditable}
                  onClick={() => setForm({ ...form, commissionPercent: String(chip) })}
                >
                  {chip}
                </button>
              ))}
            </div>
          </label>

          <fieldset className="svc-mgmt-modal__status">
            <legend>Trạng thái</legend>
            <label>
              <input
                type="radio"
                checked={form.status === ITEM_STATUS.ACTIVE}
                disabled={saving}
                onChange={() => setForm({ ...form, status: ITEM_STATUS.ACTIVE })}
              />
              Đang sử dụng
            </label>
            <label>
              <input
                type="radio"
                checked={form.status === ITEM_STATUS.INACTIVE}
                disabled={saving}
                onChange={() => setForm({ ...form, status: ITEM_STATUS.INACTIVE })}
              />
              Ngừng sử dụng
            </label>
          </fieldset>

          {pricingChanged && (
            <label>
              Lý do thay đổi giá/% (bắt buộc)
              <textarea
                required
                rows={3}
                value={form.reason}
                disabled={saving || !onlineEditable}
                placeholder="Ví dụ: Điều chỉnh giá theo mùa…"
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </label>
          )}

          {showPreview && (
            <div className="svc-mgmt-modal__preview">
              <p>✔ Hóa đơn cũ giữ nguyên.</p>
              <p>✔ Hóa đơn mới áp dụng giá/% mới.</p>
              <p>✔ Snapshot lịch sử không thay đổi.</p>
              {priceChanged && (
                <p>Giá: {initial.price?.toLocaleString('vi-VN')} → {price.toLocaleString('vi-VN')}</p>
              )}
              {percentChanged && (
                <p>% HH: {initial.commissionPercent}% → {commission}%</p>
              )}
            </div>
          )}

          {error ? <p className="invoice__error">{error}</p> : null}
        </div>

        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onClose} disabled={saving}>Huỷ</button>
          <button
            type="submit"
            className="settings__btn settings__btn--primary"
            disabled={saving || (pricingChanged && (!onlineEditable || !reasonOk))}
          >
            {saving ? 'Đang lưu…' : (mode === 'add' ? 'Lưu dịch vụ' : 'Cập nhật')}
          </button>
        </footer>
      </form>
    </div>
  )
}
