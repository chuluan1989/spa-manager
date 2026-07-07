import { useEffect, useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import {
  canDeleteInvoice,
  canEditInvoice,
  canSelectBranch,
  filterByUserBranch,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getCurrentUserName,
  getScopedEmployeeId,
  isEmployee,
} from '../constants/auth'
import { getActiveBranches, getBranchById, isSupportBranchEnabled } from '../constants/branches'
import {
  getActiveEmployeesByBranch,
  getEmployeeById,
  getSupportEligibleEmployees,
  isEmployeeInBranch,
  isSupportEligibleEmployee,
} from '../utils/employeeStorage'
import { getActiveServicesForBranch } from '../utils/serviceStorage'
import InvoiceList from '../components/invoice/InvoiceList'
import InvoiceSummary from '../components/invoice/InvoiceSummary'
import ServiceDetailTable from '../components/invoice/ServiceDetailTable'
import {
  calculateInvoiceTotals,
  formatCurrency,
  getSelectedServiceDetails,
} from '../utils/invoice'
import {
  createInvoiceId,
  deleteInvoice,
  getTodayDate,
  loadInvoices,
  saveInvoice,
  updateInvoice,
} from '../utils/invoiceStorage'
import './Invoice.css'

const INITIAL_FORM = () => ({
  date: getTodayDate(),
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: getScopedEmployeeId(''),
  supportEmployeeId: '',
  customerName: '',
  note: '',
})

export default function Invoice() {
  const lockedBranch = !canSelectBranch()
  const lockedEmployee = isEmployee()
  const activeBranchName = getCurrentUserBranchName()
  const [form, setForm] = useState(INITIAL_FORM())
  const [selectedIds, setSelectedIds] = useState([])
  const [fallbackServices, setFallbackServices] = useState([])
  const [tipsInput, setTipsInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [editingId, setEditingId] = useState(null)
  const [invoices, setInvoices] = useState(() => loadInvoices())
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')

  const syncVersion = useDataSyncVersion()
  useEffect(() => {
    if (syncVersion > 0) setInvoices(loadInvoices())
  }, [syncVersion])

  const visibleInvoices = useMemo(
    () => filterByUserBranch(invoices),
    [invoices],
  )

  const activeServices = useMemo(
    () => getActiveServicesForBranch(form.branchId),
    [form.branchId],
  )

  const currentBranch = useMemo(
    () => getBranchById(form.branchId),
    [form.branchId],
  )

  const currentBranchName = currentBranch?.name ?? ''

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(
        selectedIds,
        tipsInput,
        form.branchId,
        fallbackServices,
        currentBranchName,
      ),
    [
      selectedIds,
      tipsInput,
      form.branchId,
      currentBranchName,
      fallbackServices,
    ],
  )

  const selectedDetails = useMemo(
    () =>
      getSelectedServiceDetails(
        selectedIds,
        form.branchId,
        fallbackServices,
        currentBranchName,
      ),
    [
      selectedIds,
      form.branchId,
      currentBranchName,
      fallbackServices,
    ],
  )

  const branchEmployees = useMemo(
    () => getActiveEmployeesByBranch(form.branchId),
    [form.branchId],
  )

  const showSupportField = !lockedEmployee && isSupportBranchEnabled(form.branchId)

  const supportEmployees = useMemo(
    () => (showSupportField ? getSupportEligibleEmployees(form.employeeId) : []),
    [showSupportField, form.employeeId],
  )

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleBranchChange = (branchId) => {
    setForm((prev) => ({
      ...prev,
      branchId,
      employeeId: lockedEmployee ? prev.employeeId : '',
      supportEmployeeId: '',
    }))
    setSelectedIds([])
    setFallbackServices([])
    setErrors((prev) => ({ ...prev, branchId: undefined, employeeId: undefined, supportEmployeeId: undefined }))
  }

  const handleEmployeeChange = (employeeId) => {
    setForm((prev) => ({
      ...prev,
      employeeId,
      supportEmployeeId: prev.supportEmployeeId === employeeId ? '' : prev.supportEmployeeId,
    }))
    setErrors((prev) => ({ ...prev, employeeId: undefined, supportEmployeeId: undefined }))
  }

  const handleTipsChange = (e) => {
    const value = e.target.value
    if (value === '' || /^\d+$/.test(value)) {
      setTipsInput(value)
    }
  }

  const getServiceCount = (id) => selectedIds.filter((serviceId) => serviceId === id).length

  const addService = (id) => {
    setSelectedIds((prev) => [...prev, id])
    setErrors((prev) => ({ ...prev, services: undefined }))
  }

  const removeOneService = (id) => {
    setSelectedIds((prev) => {
      const index = prev.indexOf(id)
      if (index === -1) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }

  const validate = () => {
    const next = {}
    const branchId = lockedBranch ? getCurrentUserBranch() : form.branchId
    if (!branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!form.employeeId) {
      next.employeeId = 'Vui lòng chọn nhân viên'
    } else if (!isEmployeeInBranch(form.employeeId, branchId)) {
      next.employeeId = 'Nhân viên không thuộc chi nhánh đã chọn'
    }
    if (
      showSupportField
      && form.supportEmployeeId
      && form.supportEmployeeId === form.employeeId
    ) {
      next.supportEmployeeId = 'Nhân viên hỗ trợ phải khác nhân viên chính'
    }
    if (selectedIds.length === 0) next.services = 'Vui lòng chọn ít nhất 1 dịch vụ'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const resetForm = () => {
    setForm({ ...INITIAL_FORM(), date: getTodayDate() })
    setSelectedIds([])
    setFallbackServices([])
    setTipsInput('')
    setPaymentMethod('cash')
    setEditingId(null)
    setErrors({})
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const buildInvoicePayload = (branchId, branch, employee, supportEmployee) => ({
    date: form.date,
    branchId,
    branchName: branch.name,
    employeeId: form.employeeId,
    employeeName: employee.name,
    ...(supportEmployee
      ? {
          supportEmployeeId: supportEmployee.id,
          supportEmployeeName: supportEmployee.name,
        }
      : {
          supportEmployeeId: '',
          supportEmployeeName: '',
        }),
    customerName: form.customerName.trim(),
    serviceIds: selectedIds,
    services: totals.services ?? getSelectedServiceDetails(selectedIds, branchId, fallbackServices, branch.name),
    tips: totals.tips,
    paymentMethod,
    note: form.note.trim(),
    serviceTotal: totals.serviceTotal,
    total: totals.total,
    commission: totals.commission,
  })

  const handleSave = () => {
    if (!validate()) return

    const branchId = lockedBranch ? getCurrentUserBranch() : form.branchId
    const branch = getBranchById(branchId)
    const employee = getEmployeeById(form.employeeId)
    const supportEmployee =
      showSupportField && form.supportEmployeeId
        ? getEmployeeById(form.supportEmployeeId)
        : null

    if (!branch || !employee || !isEmployeeInBranch(form.employeeId, branchId)) {
      setErrors({ employeeId: 'Nhân viên không thuộc chi nhánh đã chọn' })
      return
    }

    if (supportEmployee) {
      if (supportEmployee.id === employee.id) {
        setErrors({ supportEmployeeId: 'Nhân viên hỗ trợ phải khác nhân viên chính' })
        return
      }
      if (!isSupportEligibleEmployee(supportEmployee.id)) {
        setErrors({ supportEmployeeId: 'Nhân viên hỗ trợ không hợp lệ' })
        return
      }
    }

    const payload = buildInvoicePayload(branchId, branch, employee, supportEmployee)

    if (editingId) {
      const result = updateInvoice(editingId, payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật hóa đơn')
        return
      }
      setInvoices(result.invoices)
      resetForm()
      showToast('Cập nhật hóa đơn thành công')
      return
    }

    const invoice = {
      id: createInvoiceId(),
      ...payload,
      createdAt: new Date().toISOString(),
    }

    const result = saveInvoice(invoice)
    if (!result.success) {
      showToast(result.error ?? 'Không thể lưu hóa đơn')
      return
    }
    setInvoices(result.invoices)
    resetForm()
    showToast('Lưu thành công')
  }

  const handleEdit = (invoice) => {
    if (!canEditInvoice(invoice)) {
      showToast('Bạn không có quyền sửa hóa đơn.')
      return
    }

    const services = Array.isArray(invoice.services) ? invoice.services : []
    setEditingId(invoice.id)
    setForm({
      date: invoice.date,
      branchId: invoice.branchId,
      employeeId: lockedEmployee ? getScopedEmployeeId('') : invoice.employeeId,
      supportEmployeeId: invoice.supportEmployeeId ?? '',
      customerName: invoice.customerName ?? '',
      note: invoice.note ?? '',
    })
    setSelectedIds(
      invoice.serviceIds?.length
        ? invoice.serviceIds
        : services.map((service) => service.id),
    )
    setFallbackServices(services)
    setTipsInput(String(invoice.tips ?? 0))
    setPaymentMethod(invoice.paymentMethod ?? 'cash')
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id) => {
    if (!canDeleteInvoice()) {
      showToast('Bạn không có quyền xóa hóa đơn.')
      return
    }
    if (!window.confirm('Bạn có chắc muốn xóa hóa đơn này?')) return

    const result = deleteInvoice(id)
    if (!result.success) {
      showToast(result.error ?? 'Bạn không có quyền xóa hóa đơn.')
      return
    }
    if (editingId === id) resetForm()
    setInvoices(result.invoices)
  }

  return (
    <div className="invoice">
      {toast && <div className="invoice__toast">{toast}</div>}

      <header className="invoice__header">
        <h2 className="invoice__title">Hóa đơn</h2>
        <p className="invoice__subtitle">
          {editingId ? 'Sửa hóa đơn đã lưu' : 'Tạo hóa đơn dịch vụ mới'}
        </p>
      </header>

      <div className="invoice__body">
        <div className="invoice__main">
          <div className="invoice__columns">
            <section className="invoice__card">
              <h3 className="invoice__card-title">Thông tin hóa đơn</h3>
              <div className="invoice__fields">
                {lockedBranch && <BranchBanner branchName={activeBranchName} />}
                <label className="invoice__field">
                  <span>Ngày</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm('date', e.target.value)}
                    className={errors.date ? 'invoice__input--error' : ''}
                  />
                  {errors.date && <span className="invoice__error">{errors.date}</span>}
                </label>
                {canSelectBranch() ? (
                  <label className="invoice__field">
                    <span>Chi nhánh</span>
                    <select
                      value={form.branchId}
                      onChange={(e) => handleBranchChange(e.target.value)}
                      className={errors.branchId ? 'invoice__input--error' : ''}
                      disabled={Boolean(editingId)}
                    >
                      <option value="" disabled>
                        Chọn chi nhánh
                      </option>
                      {getActiveBranches().map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {errors.branchId && (
                      <span className="invoice__error">{errors.branchId}</span>
                    )}
                  </label>
                ) : null}
                <label className="invoice__field">
                  <span>Nhân viên chính</span>
                  {lockedEmployee ? (
                    <input type="text" value={getCurrentUserName()} disabled readOnly />
                  ) : (
                    <>
                      <select
                        value={form.employeeId}
                        onChange={(e) => handleEmployeeChange(e.target.value)}
                        disabled={!form.branchId}
                        className={errors.employeeId ? 'invoice__input--error' : ''}
                      >
                        <option value="" disabled>
                          {form.branchId ? 'Chọn nhân viên' : 'Chọn chi nhánh trước'}
                        </option>
                        {branchEmployees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                      {errors.employeeId && (
                        <span className="invoice__error">{errors.employeeId}</span>
                      )}
                    </>
                  )}
                </label>
                {showSupportField && (
                  <label className="invoice__field">
                    <span>
                      Nhân viên hỗ trợ
                      <em className="invoice__optional"> (không bắt buộc)</em>
                    </span>
                    <select
                      value={form.supportEmployeeId}
                      onChange={(e) => updateForm('supportEmployeeId', e.target.value)}
                      className={errors.supportEmployeeId ? 'invoice__input--error' : ''}
                    >
                      <option value="">Không chọn</option>
                      {supportEmployees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} — {getBranchById(e.branchId)?.name}
                        </option>
                      ))}
                    </select>
                    {errors.supportEmployeeId && (
                      <span className="invoice__error">{errors.supportEmployeeId}</span>
                    )}
                  </label>
                )}
                <label className="invoice__field">
                  <span>
                    Tên khách
                    <em className="invoice__optional"> (không bắt buộc)</em>
                  </span>
                  <input
                    type="text"
                    placeholder="Nhập tên khách hàng"
                    value={form.customerName}
                    onChange={(e) => updateForm('customerName', e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="invoice__card">
              <h3 className="invoice__card-title">Danh sách dịch vụ</h3>
              {errors.services && (
                <p className="invoice__error invoice__error--block">{errors.services}</p>
              )}
              <div className="invoice__services">
                {activeServices.map((service) => {
                  const count = getServiceCount(service.id)
                  return (
                    <div
                      key={service.id}
                      className={`invoice__service${count > 0 ? ' invoice__service--selected' : ''}`}
                    >
                      <div className="invoice__service-qty">
                        <button
                          type="button"
                          className="invoice__service-qty-btn"
                          disabled={count === 0}
                          onClick={() => removeOneService(service.id)}
                          aria-label={`Giảm ${service.name}`}
                        >
                          −
                        </button>
                        <span className="invoice__service-qty-value">{count}</span>
                        <button
                          type="button"
                          className="invoice__service-qty-btn"
                          onClick={() => addService(service.id)}
                          aria-label={`Thêm ${service.name}`}
                        >
                          +
                        </button>
                      </div>
                      <span className="invoice__service-info">
                        <span className="invoice__service-name">{service.name}</span>
                        <span className="invoice__service-price">
                          {formatCurrency(service.price)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>

              <ServiceDetailTable items={selectedDetails} totals={totals} />
            </section>
          </div>

          <section className="invoice__card invoice__footer-fields">
            <div className="invoice__footer-grid">
              <label className="invoice__field">
                <span>Tips</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={tipsInput}
                  onChange={handleTipsChange}
                />
              </label>

              <fieldset className="invoice__payment">
                <legend>Phương thức thanh toán</legend>
                <div className="invoice__payment-options">
                  <label className="invoice__payment-option">
                    <input
                      type="radio"
                      name="payment"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={() => setPaymentMethod('cash')}
                    />
                    <span>Tiền mặt</span>
                  </label>
                  <label className="invoice__payment-option">
                    <input
                      type="radio"
                      name="payment"
                      value="transfer"
                      checked={paymentMethod === 'transfer'}
                      onChange={() => setPaymentMethod('transfer')}
                    />
                    <span>Chuyển khoản</span>
                  </label>
                </div>
              </fieldset>

              <label className="invoice__field invoice__field--full">
                <span>Ghi chú</span>
                <textarea
                  rows={3}
                  placeholder="Ghi chú thêm..."
                  value={form.note}
                  onChange={(e) => updateForm('note', e.target.value)}
                />
              </label>
            </div>
          </section>

          <div className="invoice__actions">
            <button type="button" className="invoice__save-btn" onClick={handleSave}>
              {editingId ? 'Cập nhật hóa đơn' : 'Lưu hóa đơn'}
            </button>
            {editingId && (
              <button type="button" className="invoice__quick-btn" onClick={resetForm}>
                Hủy sửa
              </button>
            )}
          </div>
        </div>

        <InvoiceSummary {...totals} />
      </div>

      <InvoiceList
        invoices={visibleInvoices}
        onDelete={handleDelete}
        onEdit={handleEdit}
        allowDelete={canDeleteInvoice()}
        canEdit={(inv) => canEditInvoice(inv)}
      />
    </div>
  )
}
