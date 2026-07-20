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

  useEffect(() => {
    if (!open) return
    setForm({
      ...EMPTY,
      branchId: initial?.branchId ?? branches[0]?.id ?? '',
      categoryId: initial?.categoryId ?? '',
      name: initial?.serviceName ?? '',
      description: initial?.description ?? '',
      durationMinutes: initial?.durationMinutes ?? '60',
      price: initial?.price != null ? String(initial.price) : '',
      commissionPercent: initial?.commissionPercent != null ? String(initial.commissionPercent) : '20',
      status: initial?.isActive === false ? ITEM_STATUS.INACTIVE : ITEM_STATUS.ACTIVE,
      durationId: initial?.durationId ?? '',
      serviceId: initial?.serviceId ?? '',
    })
  }, [open, initial, branches])

  if (!open) return null

  const tree = form.branchId ? getCatalogAdminTree(form.branchId) : []
  const categories = tree.map((c) => ({ id: c.id, name: c.name }))

  const price = parsePriceInput(form.price)
  const commission = parseCommissionPercentInput(form.commissionPercent)
  const priceChanged = mode === 'edit' && initial && price !== initial.price
  const percentChanged = mode === 'edit' && initial && commission !== initial.commissionPercent
  const showPreview = mode === 'edit' && (priceChanged || percentChanged)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.branchId || !form.name.trim()) return
    if (!form.categoryId && mode === 'add') return
    if (!Number.isFinite(price)) return
    if (!Number.isFinite(commission)) return

    if (mode === 'add') {
      createServiceWithPricing({
        branchId: form.branchId,
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description,
        durationMinutes: form.durationMinutes,
        price,
        commissionPercent: commission,
        status: form.status,
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
      setBranchDurationPrice(form.branchId, form.durationId, {
        price,
        commissionPercent: commission,
      })
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
  }

  return (
    <div className="svc-mgmt-modal" role="dialog" aria-modal="true">
      <div className="svc-mgmt-modal__backdrop" onClick={onClose} />
      <form className="svc-mgmt-modal__panel" onSubmit={handleSubmit}>
        <header className="svc-mgmt-modal__head">
          <h3>{mode === 'add' ? 'Thêm dịch vụ mới' : 'Sửa dịch vụ'}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng">×</button>
        </header>

        <div className="svc-mgmt-modal__body">
          <label>
            Chi nhánh áp dụng
            <select
              value={form.branchId}
              disabled={mode === 'edit'}
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
              disabled={mode === 'edit'}
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
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            Mô tả ngắn (không bắt buộc)
            <textarea
              rows={2}
              placeholder="Dùng cho website / app sau này"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <label>
            Thời lượng (phút)
            <input
              type="number"
              min="0"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </label>

          <label>
            Giá bán
            <input
              required
              inputMode="numeric"
              value={form.price}
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
                onChange={() => setForm({ ...form, status: ITEM_STATUS.ACTIVE })}
              />
              Đang sử dụng
            </label>
            <label>
              <input
                type="radio"
                checked={form.status === ITEM_STATUS.INACTIVE}
                onChange={() => setForm({ ...form, status: ITEM_STATUS.INACTIVE })}
              />
              Ngừng sử dụng
            </label>
          </fieldset>

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
        </div>

        <footer className="svc-mgmt-modal__foot">
          <button type="button" className="settings__btn" onClick={onClose}>Huỷ</button>
          <button type="submit" className="settings__btn settings__btn--primary">
            {mode === 'add' ? 'Lưu dịch vụ' : 'Cập nhật'}
          </button>
        </footer>
      </form>
    </div>
  )
}
