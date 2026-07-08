import { useEffect, useMemo, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import {
  canDeleteInvoice,
  canEditInvoice,
  canSelectBranch,
  filterByUserScope,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getCurrentUserName,
  getScopedEmployeeId,
  isEmployee,
} from '../constants/auth'
import { getActiveBranches, getBranchById } from '../constants/branches'
import {
  getActiveEmployeesByBranch,
  getEmployeeById,
  isEmployeeInBranch,
} from '../utils/employeeStorage'
import { getActiveServicesForBranch } from '../utils/serviceStorage'
import InvoiceDetailModal from '../components/invoice/InvoiceDetailModal'
import InvoiceFilters from '../components/invoice/InvoiceFilters'
import InvoiceList from '../components/invoice/InvoiceList'
import InvoiceSummary from '../components/invoice/InvoiceSummary'
import ServiceDetailTable from '../components/invoice/ServiceDetailTable'
import {
  calculateInvoiceTotals,
  formatCurrency,
  getInvoiceServiceDetails,
  getSelectedServiceDetails,
} from '../utils/invoice'
import {
  filterInvoices,
  hasActiveInvoiceFilters,
  sortInvoicesDesc,
} from '../utils/invoiceFilters'
import {
  createInvoiceId,
  deleteInvoice,
  getTodayDate,
  getInvoiceById,
  loadInvoices,
  saveInvoice,
  updateInvoice,
} from '../utils/invoiceStorage'
import {
  INVOICE_CUSTOMER_REQUIRED_MESSAGE,
  isValidCustomerPhone,
  normalizeCustomerPhone,
  sanitizeCustomerPhoneInput,
} from '../utils/validators'
import { consumeInvoiceEditPrefill } from '../utils/navigationPrefill'
import './Invoice.css'

const INITIAL_FILTERS = () => ({
  fromDate: '',
  toDate: '',
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: '',
  serviceId: '',
  paymentMethod: '',
  search: '',
  discountFilter: '',
})

const INITIAL_FORM = () => ({
  date: getTodayDate(),
  invoiceTime: getCurrentTime(),
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: getScopedEmployeeId(''),
  customerName: '',
  customerPhone: '',
  customerRequested: false,
  note: '',
})

function getCurrentTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function readInvoiceTimeForForm(invoice) {
  if (invoice?.invoiceTime) return invoice.invoiceTime
  if (!invoice?.createdAt) return getCurrentTime()
  const parsed = new Date(invoice.createdAt)
  if (Number.isNaN(parsed.getTime())) return getCurrentTime()
  return getCurrentTime(parsed)
}

export default function Invoice() {
  const lockedBranch = !canSelectBranch()
  const lockedEmployee = isEmployee()
  const activeBranchName = getCurrentUserBranchName()
  const [form, setForm] = useState(INITIAL_FORM())
  const [selectedIds, setSelectedIds] = useState([])
  const [fallbackServices, setFallbackServices] = useState([])
  const [tipsInput, setTipsInput] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [editingId, setEditingId] = useState(null)
  const [invoices, setInvoices] = useState(() => loadInvoices())
  const [listFilters, setListFilters] = useState(INITIAL_FILTERS)
  const [listPage, setListPage] = useState(1)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')
  const [activeTab, setActiveTab] = useState(() => (isEmployee() ? 'create' : 'list'))

  const syncVersion = useDataSyncVersion()
  useEffect(() => {
    if (syncVersion > 0) setInvoices(loadInvoices())
  }, [syncVersion])

  const visibleInvoices = useMemo(
    () => filterByUserScope(invoices),
    [invoices],
  )

  const effectiveListFilters = useMemo(
    () => ({
      ...listFilters,
      branchId: lockedBranch ? getCurrentUserBranch() : listFilters.branchId,
    }),
    [listFilters, lockedBranch],
  )

  const filteredInvoices = useMemo(
    () => sortInvoicesDesc(filterInvoices(visibleInvoices, effectiveListFilters)),
    [visibleInvoices, effectiveListFilters],
  )

  const listEmptyMessage = hasActiveInvoiceFilters(effectiveListFilters)
    ? 'Không có hóa đơn phù hợp với bộ lọc.'
    : 'Chưa có hóa đơn nào.'

  const filterServiceOptions = useMemo(() => {
    if (effectiveListFilters.branchId) {
      return getActiveServicesForBranch(effectiveListFilters.branchId)
    }

    const serviceMap = new Map()
    for (const invoice of visibleInvoices) {
      for (const service of getInvoiceServiceDetails(invoice)) {
        serviceMap.set(service.id, { id: service.id, name: service.name })
      }
    }
    return [...serviceMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [effectiveListFilters.branchId, visibleInvoices])

  useEffect(() => {
    setListPage(1)
  }, [effectiveListFilters])

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
        discountInput,
      ),
    [
      selectedIds,
      tipsInput,
      discountInput,
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

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleBranchChange = (branchId) => {
    setForm((prev) => ({
      ...prev,
      branchId,
      employeeId: lockedEmployee ? prev.employeeId : '',
    }))
    setSelectedIds([])
    setFallbackServices([])
    setErrors((prev) => ({ ...prev, branchId: undefined, employeeId: undefined }))
  }

  const handleEmployeeChange = (employeeId) => {
    setForm((prev) => ({ ...prev, employeeId }))
    setErrors((prev) => ({ ...prev, employeeId: undefined }))
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
    const customerName = form.customerName.trim()
    const customerPhone = form.customerPhone.trim()

    if (!customerName || !customerPhone) {
      next.customerRequired = INVOICE_CUSTOMER_REQUIRED_MESSAGE
    } else if (!isValidCustomerPhone(customerPhone)) {
      next.customerPhone = 'SĐT khách hàng phải có ít nhất 9 số'
    }

    if (!branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!form.employeeId) {
      next.employeeId = 'Vui lòng chọn nhân viên'
    } else if (!isEmployeeInBranch(form.employeeId, branchId)) {
      next.employeeId = 'Nhân viên không thuộc chi nhánh đã chọn'
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
    setDiscountInput('')
    setPaymentMethod('cash')
    setEditingId(null)
    setErrors({})
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const buildInvoicePayload = (branchId, branch, employee, existingInvoice = null) => ({
    date: form.date,
    invoiceTime: form.invoiceTime,
    branchId,
    branchName: branch.name,
    employeeId: form.employeeId,
    employeeName: employee.name,
    supportEmployeeId: existingInvoice?.supportEmployeeId ?? '',
    supportEmployeeName: existingInvoice?.supportEmployeeName ?? '',
    customerName: form.customerName.trim(),
    customerPhone: normalizeCustomerPhone(form.customerPhone),
    customerRequested: Boolean(form.customerRequested),
    serviceIds: selectedIds,
    services: totals.services ?? getSelectedServiceDetails(selectedIds, branchId, fallbackServices, branch.name),
    tips: totals.tips,
    paymentMethod,
    note: form.note.trim(),
    originalServiceTotal: totals.originalServiceTotal,
    discountInput: totals.discountInput,
    discountType: totals.discountType,
    discountValue: totals.discountValue,
    discountAmount: totals.discountAmount,
    serviceTotal: totals.serviceTotal,
    total: totals.total,
    commission: totals.commission,
  })

  const handleSave = () => {
    if (!validate()) return

    const branchId = lockedBranch ? getCurrentUserBranch() : form.branchId
    const branch = getBranchById(branchId)
    const employee = getEmployeeById(form.employeeId)
    const existingInvoice = editingId ? getInvoiceById(editingId) : null

    if (!branch || !employee || !isEmployeeInBranch(form.employeeId, branchId)) {
      setErrors({ employeeId: 'Nhân viên không thuộc chi nhánh đã chọn' })
      return
    }

    const payload = buildInvoicePayload(branchId, branch, employee, existingInvoice)

    if (editingId) {
      const result = updateInvoice(editingId, payload)
      if (!result.success) {
        showToast(result.error ?? 'Không thể cập nhật hóa đơn')
        return
      }
      setInvoices(result.invoices)
      resetForm()
      setActiveTab('list')
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
    setActiveTab('list')
    showToast('Lưu thành công')
  }

  const handleEdit = (invoice) => {
    if (!canEditInvoice(invoice)) {
      showToast('Bạn không có quyền sửa hóa đơn.')
      return
    }

    setDetailInvoice(null)
    const services = Array.isArray(invoice.services) ? invoice.services : []
    setEditingId(invoice.id)
    setForm({
      date: invoice.date,
      invoiceTime: readInvoiceTimeForForm(invoice),
      branchId: invoice.branchId,
      employeeId: lockedEmployee ? getScopedEmployeeId('') : invoice.employeeId,
      customerName: invoice.customerName ?? '',
      customerPhone: invoice.customerPhone ?? '',
      customerRequested: Boolean(invoice.customerRequested),
      note: invoice.note ?? '',
    })
    setSelectedIds(
      invoice.serviceIds?.length
        ? invoice.serviceIds
        : services.map((service) => service.id),
    )
    setFallbackServices(services)
    setTipsInput(String(invoice.tips ?? 0))
    setDiscountInput(invoice.discountInput ?? '')
    setPaymentMethod(invoice.paymentMethod ?? 'cash')
    setErrors({})
    setActiveTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const editId = consumeInvoiceEditPrefill()
    if (!editId) return
    const invoice = getInvoiceById(editId)
    if (invoice) {
      handleEdit(invoice)
    }
  // Chạy một lần khi mở trang từ báo cáo nhân viên
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = (id) => {
    if (!canDeleteInvoice()) {
      showToast('Bạn không có quyền xóa hóa đơn.')
      return
    }
    if (!window.confirm('Bạn chắc chắn muốn xóa hóa đơn này? Thao tác này không thể hoàn tác.')) return

    const result = deleteInvoice(id)
    if (!result.success) {
      showToast(result.error ?? 'Bạn không có quyền xóa hóa đơn.')
      return
    }
    if (editingId === id) resetForm()
    setInvoices(result.invoices)
  }

  const handleViewInvoice = (invoice) => {
    setDetailInvoice(invoice)
  }

  const resetListFilters = () => {
    setListFilters((prev) => ({
      ...INITIAL_FILTERS(),
      branchId: prev.branchId,
    }))
    setListPage(1)
  }

  return (
    <div className="invoice">
      {toast && <div className="invoice__toast">{toast}</div>}

      <header className="invoice__header">
        <h2 className="invoice__title">Hóa đơn</h2>
        <p className="invoice__subtitle">
          Quản lý hóa đơn dịch vụ — lọc, xem chi tiết và tạo mới
        </p>
      </header>

      <div className="app-tabs invoice__tabs">
        <button
          type="button"
          className={`app-tabs__btn ${activeTab === 'list' ? 'app-tabs__btn--active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          Danh sách hóa đơn
        </button>
        <button
          type="button"
          className={`app-tabs__btn ${activeTab === 'create' ? 'app-tabs__btn--active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          {editingId ? 'Sửa hóa đơn' : 'Tạo hóa đơn'}
        </button>
      </div>

      {activeTab === 'list' && (
        <>
          <InvoiceFilters
            filters={effectiveListFilters}
            onChange={setListFilters}
            onReset={resetListFilters}
            lockedBranch={lockedBranch}
            branchName={activeBranchName}
            resultCount={filteredInvoices.length}
            serviceOptions={filterServiceOptions}
          />
          <InvoiceList
            invoices={filteredInvoices}
            page={listPage}
            onPageChange={setListPage}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onView={handleViewInvoice}
            allowDelete={canDeleteInvoice()}
            canEdit={(inv) => canEditInvoice(inv)}
            emptyMessage={listEmptyMessage}
          />
        </>
      )}

      {activeTab === 'create' && (
        <>
      <div className="invoice__body">
        <div className="invoice__main">
          <section className="invoice__card invoice__form-section">
            <h3 className="invoice__section-title">A. Thông tin khách hàng</h3>
            {errors.customerRequired && (
              <p className="invoice__error invoice__error--block">{errors.customerRequired}</p>
            )}
            <div className="invoice__fields invoice__fields--grid">
              <label className="invoice__field">
                <span>Tên khách hàng</span>
                <input
                  type="text"
                  placeholder="Nhập tên khách hàng"
                  value={form.customerName}
                  onChange={(e) => updateForm('customerName', e.target.value)}
                  className={errors.customerRequired ? 'invoice__input--error' : ''}
                />
              </label>
              <label className="invoice__field">
                <span>SĐT khách hàng</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="VD: 0774.099.777"
                  value={form.customerPhone}
                  onChange={(e) => updateForm('customerPhone', sanitizeCustomerPhoneInput(e.target.value))}
                  className={errors.customerRequired || errors.customerPhone ? 'invoice__input--error' : ''}
                />
                {errors.customerPhone && <span className="invoice__error">{errors.customerPhone}</span>}
              </label>
              <label className="invoice__field invoice__field--checkbox invoice__field--full">
                <input
                  type="checkbox"
                  checked={form.customerRequested}
                  onChange={(e) => updateForm('customerRequested', e.target.checked)}
                />
                <span>Khách yêu cầu</span>
              </label>
            </div>
          </section>

          <section className="invoice__card invoice__form-section">
            <h3 className="invoice__section-title">B. Thông tin dịch vụ</h3>
            <div className="invoice__fields invoice__fields--grid">
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
              <label className="invoice__field">
                <span>Giờ</span>
                <input
                  type="time"
                  value={form.invoiceTime}
                  onChange={(e) => updateForm('invoiceTime', e.target.value)}
                />
              </label>
              {canSelectBranch() ? (
                <label className="invoice__field">
                  <span>Chi nhánh</span>
                  <select
                    value={form.branchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className={errors.branchId ? 'invoice__input--error' : ''}
                  >
                    <option value="" disabled>Chọn chi nhánh</option>
                    {getActiveBranches().map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {errors.branchId && <span className="invoice__error">{errors.branchId}</span>}
                </label>
              ) : null}
              <label className="invoice__field">
                <span>Nhân viên</span>
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
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    {errors.employeeId && <span className="invoice__error">{errors.employeeId}</span>}
                  </>
                )}
              </label>
            </div>

            <h4 className="invoice__subsection-title">Dịch vụ</h4>
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
                      <span className="invoice__service-price">{formatCurrency(service.price)}</span>
                    </span>
                  </div>
                )
              })}
            </div>

            <ServiceDetailTable items={totals.services?.length ? totals.services : selectedDetails} totals={totals} />

            <div className="invoice__money-grid">
              <label className="invoice__field">
                <span>Giảm giá / Khuyến mãi</span>
                <input
                  type="text"
                  placeholder="VD: 10% hoặc 50000"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                />
              </label>
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
              <div className="invoice__calc">
                <div className="invoice__calc-row">
                  <span>Giá vé</span>
                  <strong>{formatCurrency(totals.originalServiceTotal)}</strong>
                </div>
                <div className="invoice__calc-row">
                  <span>Khuyến mãi</span>
                  <strong className="is-discount">−{formatCurrency(totals.discountAmount)}</strong>
                </div>
                <div className="invoice__calc-row">
                  <span>Thanh toán</span>
                  <strong>{formatCurrency(totals.serviceTotal)}</strong>
                </div>
                <div className="invoice__calc-row">
                  <span>Tips</span>
                  <strong>{formatCurrency(totals.tips)}</strong>
                </div>
                <div className="invoice__calc-row invoice__calc-row--total">
                  <span>Tổng khách trả</span>
                  <strong>{formatCurrency(totals.total)}</strong>
                </div>
              </div>
            </div>

            <label className="invoice__field invoice__field--full">
              <span>Ghi chú</span>
              <textarea
                rows={3}
                placeholder="Ghi chú thêm..."
                value={form.note}
                onChange={(e) => updateForm('note', e.target.value)}
              />
            </label>
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
        </>
      )}

      <InvoiceDetailModal
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={handleEdit}
        canEdit={(inv) => canEditInvoice(inv)}
      />
    </div>
  )
}
