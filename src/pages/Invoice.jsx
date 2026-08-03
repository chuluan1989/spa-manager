import { useEffect, useMemo, useRef, useState } from 'react'
import BranchBanner from '../components/common/BranchBanner'
import { useInvoicesData } from '../hooks/useInvoicesData'
import {
  canDeleteInvoice,
  canEditInvoice,
  canSelectBranch,
  canAddInvoice,
  canAddInvoiceForDate,
  filterByUserScope,
  getCurrentUserBranch,
  getCurrentUserBranchName,
  getCurrentUserEmployeeId,
  getCurrentUserName,
  getScopedEmployeeId,
  isAdmin,
  isBranchManager,
  isEmployee,
} from '../constants/auth'
import { getBranchById } from '../constants/branches'
import {
  getActiveEmployeesByBranch,
  getAllActiveEmployees,
  getEmployeeById,
  isEmployeeInBranch,
} from '../utils/employeeStorage'
import {
  canEmployeeServeAtBranch,
  canSelectServingBranch,
  getServingBranchOptions,
} from '../utils/crossBranchSupport'
import { getActiveServicesForBranch, getServiceMapForBranch } from '../utils/serviceStorage'
import InvoiceDetailModal from '../components/invoice/InvoiceDetailModal'
import GroupedServicePicker from '../components/invoice/GroupedServicePicker'
import FlatServicePicker from '../components/invoice/FlatServicePicker'
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
  isKnownPaymentMethod,
  normalizePaymentMethod,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHODS,
} from '../constants/paymentMethods'
import {
  createInvoiceId,
  deleteInvoice,
  getMonthStartDate,
  getTodayDate,
  saveInvoice,
  updateInvoice,
} from '../utils/invoiceStorage'
import { getIctTodayDate } from '../utils/ictTime'
import {
  INVOICE_CUSTOMER_PHONE_SOFT_WARNING,
  INVOICE_CUSTOMER_REQUIRED_MESSAGE,
  isValidCustomerPhone,
} from '../utils/validators'
import { consumeInvoiceEditPrefill, consumeInvoiceCreateDatePrefill } from '../utils/navigationPrefill'
import { exportInvoicesCsv } from '../utils/invoiceExport'
import { getCatalogGroupsForBranch } from '../utils/branchPricingStorage'
import {
  getInvoiceCreateLockedDateMessage,
  isInvoiceInClosedPayCycle,
} from '../utils/invoiceEditPolicy'
import {
  getApprovedCloseLockMessage,
  isEmployeeDateLockedByApprovedCloseSync,
  refreshApprovedCloseCache,
} from '../utils/payrollCycleClose/approvedCloseLock'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { subscribeToDataSync } from '../utils/supabaseSync'
import './Invoice.css'

/** Ngày form hóa đơn — luôn theo giờ Việt Nam. */
function getInvoiceFormToday() {
  return getIctTodayDate()
}

const INITIAL_FILTERS = () => ({
  fromDate: getMonthStartDate(),
  toDate: getTodayDate(),
  branchId: canSelectBranch() ? '' : getCurrentUserBranch(),
  employeeId: '',
  serviceId: '',
  paymentMethod: '',
  search: '',
  discountFilter: '',
})

const INITIAL_FORM = () => ({
  date: getInvoiceFormToday(),
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

export default function Invoice({ onNavigate }) {
  const lockedBranch = !canSelectBranch()
  const lockedEmployee = isEmployee()
  const currentEmployeeId = getCurrentUserEmployeeId()
  const sessionBranchId = getCurrentUserBranch()
  // Quyền tạo HĐ chỉ theo role đăng nhập — không phụ thuộc hồ sơ/chấm công/payroll1.
  const canCreateInvoice = canAddInvoice()
  void onNavigate
  const activeBranchName = getCurrentUserBranchName()
  const [form, setForm] = useState(INITIAL_FORM())
  const [selectedIds, setSelectedIds] = useState([])
  const [fallbackServices, setFallbackServices] = useState([])
  const [tipsInput, setTipsInput] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.CASH)
  const [editingId, setEditingId] = useState(null)
  const { invoices, loading: invoicesLoading, error: invoicesError, reload: reloadInvoices } = useInvoicesData()
  const [listFilters, setListFilters] = useState(INITIAL_FILTERS)
  const [listPage, setListPage] = useState(1)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [adminEditReason, setAdminEditReason] = useState('')
  const [activeTab, setActiveTab] = useState(() => (isEmployee() ? 'create' : 'list'))
  const [approvedLockVersion, setApprovedLockVersion] = useState(0)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [pricingSyncNotice, setPricingSyncNotice] = useState('')
  const syncVersion = useDataSyncVersion()

  /** NV đang được nhập hộ (Admin/QL) hoặc chính mình (NV). */
  const actingEmployeeId = lockedEmployee ? currentEmployeeId : form.employeeId
  const actingEmployee = useMemo(
    () => (actingEmployeeId ? getEmployeeById(actingEmployeeId) : null),
    [actingEmployeeId],
  )
  const actingHomeBranchId = lockedEmployee
    ? sessionBranchId
    : (actingEmployee?.branchId || '')
  const canPickServingBranch = Boolean(
    actingEmployeeId && canSelectServingBranch(actingEmployeeId, actingHomeBranchId),
  )
  const servingBranchOptions = useMemo(
    () => (canPickServingBranch ? getServingBranchOptions(actingEmployeeId, actingHomeBranchId) : []),
    [canPickServingBranch, actingEmployeeId, actingHomeBranchId],
  )
  const homeBranchName = getBranchById(actingHomeBranchId)?.name
    || (lockedEmployee ? activeBranchName : '')
  const fixedBranchBannerName = canPickServingBranch
    ? ''
    : (getBranchById(form.branchId)?.name || homeBranchName || activeBranchName)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (isEmployee()) {
          await refreshApprovedCloseCache({ employeeId: currentEmployeeId || '' })
        } else if (isBranchManager()) {
          await refreshApprovedCloseCache({ branchId: sessionBranchId || '' })
        } else if (isAdmin()) {
          await refreshApprovedCloseCache({})
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setApprovedLockVersion((n) => n + 1)
    })()
    return () => { cancelled = true }
  }, [currentEmployeeId, sessionBranchId, syncVersion])

  const isFormDateLockedForActor = (date, employeeId = form.employeeId || currentEmployeeId) => {
    if (isAdmin()) return false
    if (!date || !employeeId) return false
    void approvedLockVersion
    return isEmployeeDateLockedByApprovedCloseSync(employeeId, date)
  }


  useEffect(() => {
    const prefillDate = consumeInvoiceCreateDatePrefill()
    if (!prefillDate) return
    const employeeId = currentEmployeeId || ''
    if (!isAdmin() && employeeId && isEmployeeDateLockedByApprovedCloseSync(employeeId, prefillDate)) {
      setForm((prev) => ({
        ...prev,
        date: getInvoiceFormToday(),
        invoiceTime: getCurrentTime(),
      }))
      setEditingId(null)
      setActiveTab('create')
      setToast(getInvoiceCreateLockedDateMessage())
      setTimeout(() => setToast(''), 4500)
      return
    }
    setForm((prev) => ({ ...prev, date: prefillDate }))
    setEditingId(null)
    setActiveTab('create')
  }, [currentEmployeeId])

  const getInvoiceByIdFromList = (id) => invoices.find((invoice) => invoice.id === id) ?? null

  const visibleInvoices = useMemo(
    () => filterByUserScope(invoices),
    [invoices],
  )

  const effectiveListFilters = useMemo(
    () => ({
      ...listFilters,
      branchId: lockedEmployee ? '' : (lockedBranch ? getCurrentUserBranch() : listFilters.branchId),
      employeeId: lockedEmployee ? getCurrentUserEmployeeId() : listFilters.employeeId,
    }),
    [listFilters, lockedBranch, lockedEmployee],
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

  const catalogGroups = useMemo(
    () => (form.branchId ? getCatalogGroupsForBranch(form.branchId) : []),
    [form.branchId, catalogRevision],
  )

  const branchServices = useMemo(
    () => (form.branchId ? getActiveServicesForBranch(form.branchId) : []),
    [form.branchId, catalogRevision],
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
      catalogRevision,
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
      catalogRevision,
    ],
  )

  const branchEmployees = useMemo(() => {
    if (lockedEmployee) return []
    if (isAdmin()) return getAllActiveEmployees()
    return getActiveEmployeesByBranch(sessionBranchId)
  }, [lockedEmployee, sessionBranchId])

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  /** Đổi CN phục vụ — giữ NV; reload catalog; bỏ dịch vụ không còn hợp lệ. */
  const handleBranchChange = (branchId) => {
    setForm((prev) => ({
      ...prev,
      branchId,
    }))
    const validMap = branchId ? getServiceMapForBranch(branchId) : {}
    setSelectedIds((prev) => prev.filter((id) => Boolean(validMap[id])))
    setFallbackServices([])
    setPricingSyncNotice('')
    setErrors((prev) => ({ ...prev, branchId: undefined, employeeId: undefined, services: undefined }))
  }

  useEffect(() => {
    return subscribeToDataSync((detail) => {
      const changed = detail?.changedEntities ?? []
      if (!changed.includes('serviceCatalogV2') && !changed.includes('branchPricing')) return
      setCatalogRevision((v) => v + 1)
      if (!form.branchId) return
      const validMap = getServiceMapForBranch(form.branchId)
      setSelectedIds((ids) => ids.filter((id) => Boolean(validMap[id])))
      setPricingSyncNotice('Bảng giá vừa được cập nhật. Danh sách dịch vụ đã tải lại.')
    })
  }, [form.branchId])

  /** Chọn NV trước — gắn CN phục vụ mặc định = nhà NV; hỗ trợ thì mở dropdown 3 CN. */
  const handleEmployeeChange = (employeeId) => {
    const employee = getEmployeeById(employeeId)
    const homeId = employee?.branchId || ''
    const canServe = Boolean(employeeId && canSelectServingBranch(employeeId, homeId))
    const optionIds = canServe
      ? getServingBranchOptions(employeeId, homeId).map((b) => b.id)
      : []

    setForm((prev) => {
      let nextBranchId = homeId
      if (canServe) {
        nextBranchId = optionIds.includes(prev.branchId) ? prev.branchId : homeId
      }
      if (nextBranchId !== prev.branchId) {
        setSelectedIds([])
        setFallbackServices([])
      }
      return { ...prev, employeeId, branchId: nextBranchId }
    })
    setErrors((prev) => ({
      ...prev,
      employeeId: undefined,
      branchId: undefined,
      services: undefined,
    }))
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

  const customerPhoneSoftWarning = Boolean(
    form.customerPhone.trim() && !isValidCustomerPhone(form.customerPhone),
  )

  const resolveFormBranchId = () => {
    if (lockedEmployee) {
      return canPickServingBranch ? form.branchId : getCurrentUserBranch()
    }
    if (!form.employeeId) return form.branchId || ''
    if (canPickServingBranch) return form.branchId || ''
    return actingHomeBranchId || form.branchId || ''
  }

  const validate = () => {
    const next = {}
    const branchId = resolveFormBranchId()
    const customerName = form.customerName.trim()

    // SĐT không bắt buộc; sai/thiếu/chữ chỉ cảnh báo nhẹ, không chặn lưu.
    if (!customerName) {
      next.customerRequired = INVOICE_CUSTOMER_REQUIRED_MESSAGE
    }

    if (!branchId) next.branchId = 'Vui lòng chọn chi nhánh'
    if (!form.employeeId) {
      next.employeeId = 'Vui lòng chọn nhân viên'
    } else if (canPickServingBranch) {
      if (!canEmployeeServeAtBranch(form.employeeId, branchId, actingHomeBranchId)) {
        next.branchId = 'Chi nhánh phục vụ không hợp lệ cho hỗ trợ liên chi nhánh'
      }
    } else if (!isEmployeeInBranch(form.employeeId, branchId)) {
      next.employeeId = 'Nhân viên không thuộc chi nhánh đã chọn'
    }
    if (selectedIds.length === 0) next.services = 'Vui lòng chọn ít nhất 1 dịch vụ'
    if (!isKnownPaymentMethod(paymentMethod)) {
      next.paymentMethod = 'Vui lòng chọn phương thức thanh toán'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const resetForm = () => {
    setForm({ ...INITIAL_FORM(), date: getInvoiceFormToday(), invoiceTime: getCurrentTime() })
    setSelectedIds([])
    setFallbackServices([])
    setTipsInput('')
    setDiscountInput('')
    setPaymentMethod(PAYMENT_METHODS.CASH)
    setEditingId(null)
    setAdminEditReason('')
    setErrors({})
  }

  /** Mở form thêm hóa đơn mới — reset toàn bộ, không kế thừa HĐ vừa sửa. */
  const openNewInvoiceForm = () => {
    resetForm()
    setDetailInvoice(null)
    setActiveTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  const buildInvoicePayload = (branchId, branch, employee, existingInvoice = null) => {
    const homeBranchId = employee.branchId || existingInvoice?.homeBranchId || ''
    const homeBranch = getBranchById(homeBranchId)
    return {
      date: form.date,
      invoiceTime: form.invoiceTime,
      branchId,
      branchName: branch.name,
      homeBranchId,
      homeBranchName: homeBranch?.name || existingInvoice?.homeBranchName || '',
      employeeId: form.employeeId,
      employeeName: employee.name,
      supportEmployeeId: existingInvoice?.supportEmployeeId ?? '',
      supportEmployeeName: existingInvoice?.supportEmployeeName ?? '',
      customerName: form.customerName.trim(),
      customerPhone: String(form.customerPhone ?? '').trim(),
      customerRequested: Boolean(form.customerRequested),
      serviceIds: selectedIds,
      services: totals.services ?? getSelectedServiceDetails(selectedIds, branchId, fallbackServices, branch.name),
      tips: totals.tips,
      paymentMethod: normalizePaymentMethod(paymentMethod),
      note: form.note.trim(),
      originalServiceTotal: totals.originalServiceTotal,
      discountInput: totals.discountInput,
      discountType: totals.discountType,
      discountValue: totals.discountValue,
      discountAmount: totals.discountAmount,
      serviceTotal: totals.serviceTotal,
      total: totals.total,
      commission: totals.serviceCommission,
      serviceCommission: totals.serviceCommission,
      enteredBy: existingInvoice?.enteredBy || getCurrentUserName(),
    }
  }

  const handleSave = async () => {
    if (saving) return
    if (!validate()) return

    const branchId = resolveFormBranchId()
    const branch = getBranchById(branchId)
    const employee = getEmployeeById(form.employeeId)
    const existingInvoice = editingId ? getInvoiceByIdFromList(editingId) : null

    const employeeOk = canPickServingBranch
      ? canEmployeeServeAtBranch(form.employeeId, branchId, actingHomeBranchId)
      : isEmployeeInBranch(form.employeeId, branchId)
    if (!branch || !employee || !employeeOk) {
      setErrors({
        employeeId: canPickServingBranch
          ? 'Chi nhánh phục vụ không hợp lệ'
          : 'Nhân viên không thuộc chi nhánh đã chọn',
      })
      return
    }

    const payload = buildInvoicePayload(branchId, branch, employee, existingInvoice)
    const lockedForSelectedEmployee = Boolean(
      form.employeeId
      && form.date
      && isEmployeeDateLockedByApprovedCloseSync(form.employeeId, form.date),
    )
    const closedTarget = editingId
      ? (isInvoiceInClosedPayCycle(existingInvoice) || lockedForSelectedEmployee)
      : lockedForSelectedEmployee

    if (!isAdmin() && closedTarget) {
      showToast(getApprovedCloseLockMessage(form.date) || getInvoiceCreateLockedDateMessage())
      return
    }
    if (isAdmin() && closedTarget && !adminEditReason.trim()) {
      setErrors({ adminEditReason: 'Vui lòng nhập lý do khi Admin bổ sung/sửa dữ liệu kỳ đã duyệt.' })
      return
    }

    setSaving(true)
    try {
      const editOptions = isAdmin() && closedTarget ? { editReason: adminEditReason.trim() } : {}
      if (editingId) {
        const result = await updateInvoice(editingId, payload, existingInvoice, editOptions)
        if (!result.success) {
          showToast(result.error ?? 'Không thể cập nhật hóa đơn')
          return
        }
        reloadInvoices()
        resetForm()
        setActiveTab(isEmployee() ? 'create' : 'list')
        showToast('Cập nhật hóa đơn thành công')
        return
      }

      const invoice = {
        id: createInvoiceId(),
        ...payload,
        createdAt: new Date().toISOString(),
      }

      const result = await saveInvoice(invoice, editOptions)
      if (!result.success) {
        showToast(result.error ?? 'Không thể lưu hóa đơn')
        return
      }
      reloadInvoices()
      resetForm()
      setActiveTab(isEmployee() ? 'create' : 'list')
      showToast('Lưu thành công')
    } finally {
      setSaving(false)
    }
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
    setPaymentMethod(normalizePaymentMethod(invoice.paymentMethod) || '')
    setErrors({})
    setActiveTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pendingEditIdRef = useRef(consumeInvoiceEditPrefill())

  useEffect(() => {
    const editId = pendingEditIdRef.current
    if (!editId || invoicesLoading) return
    const invoice = invoices.find((item) => item.id === editId)
    if (invoice) {
      pendingEditIdRef.current = null
      handleEdit(invoice)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicesLoading, invoices])

  const handleDelete = async (id) => {
    const invoice = invoices.find((inv) => inv.id === id)
    if (!canDeleteInvoice(invoice)) {
      showToast('Bạn không có quyền xóa hóa đơn.')
      return
    }
    const closed = invoice && isInvoiceInClosedPayCycle(invoice)
    let editReason = ''
    if (isAdmin() && closed) {
      editReason = window.prompt('Nhập lý do xóa hóa đơn trong kỳ đã chốt:') ?? ''
      if (!editReason.trim()) {
        showToast('Vui lòng nhập lý do khi Admin xóa dữ liệu kỳ đã chốt.')
        return
      }
    }
    if (!window.confirm('Bạn chắc chắn muốn xóa hóa đơn này? Thao tác này không thể hoàn tác.')) return

    const result = await deleteInvoice(id, invoice, isAdmin() && closed ? { editReason: editReason.trim() } : {})
    if (!result.success) {
      showToast(result.error ?? 'Bạn không có quyền xóa hóa đơn.')
      return
    }
    if (editingId === id) resetForm()
    reloadInvoices()
  }

  const handleViewInvoice = (invoice) => {
    setDetailInvoice(invoice)
  }

  const resetListFilters = () => {
    setListFilters(INITIAL_FILTERS())
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
        {canCreateInvoice && (
        <button
          type="button"
          className={`app-tabs__btn ${activeTab === 'create' && !editingId ? 'app-tabs__btn--active' : ''}`}
          onClick={openNewInvoiceForm}
        >
          Tạo hóa đơn
        </button>
        )}
        {canCreateInvoice && editingId && activeTab === 'create' ? (
          <button
            type="button"
            className="app-tabs__btn app-tabs__btn--active"
            onClick={() => setActiveTab('create')}
          >
            Sửa hóa đơn
          </button>
        ) : null}
      </div>

      {activeTab === 'list' && (
        <>
          {invoicesError && (
            <div className="invoice__error invoice__error--block" role="alert">
              Không thể tải hóa đơn từ Supabase: {invoicesError}
            </div>
          )}
          {invoicesLoading && (
            <p className="invoice__subtitle">Đang tải hóa đơn từ Supabase…</p>
          )}
          <InvoiceFilters
            filters={effectiveListFilters}
            onChange={setListFilters}
            onReset={resetListFilters}
            onExport={() => exportInvoicesCsv(filteredInvoices, effectiveListFilters)}
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
            allowDelete={(inv) => canDeleteInvoice(inv)}
            canEdit={(inv) => canEditInvoice(inv)}
            emptyMessage={listEmptyMessage}
          />
        </>
      )}

      {activeTab === 'create' && canCreateInvoice && (
        <>
      <div className="invoice__body">
        <div className="invoice__main">
          <section className="invoice__card invoice__form-section">
            <h3 className="invoice__section-title">A. Thông tin khách hàng</h3>
            {pricingSyncNotice ? (
              <p className="invoice__hint" role="status">{pricingSyncNotice}</p>
            ) : null}
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
                  type="text"
                  inputMode="text"
                  placeholder="VD: 0774.099.777"
                  value={form.customerPhone}
                  onChange={(e) => updateForm('customerPhone', e.target.value)}
                />
                {customerPhoneSoftWarning && (
                  <span className="invoice__hint">{INVOICE_CUSTOMER_PHONE_SOFT_WARNING}</span>
                )}
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
              {lockedEmployee && !canPickServingBranch && (
                <BranchBanner branchName={activeBranchName} />
              )}
              {!lockedEmployee && form.employeeId && !canPickServingBranch && (
                <BranchBanner branchName={fixedBranchBannerName} />
              )}
              {canPickServingBranch && (
                <p className="invoice__hint invoice__field--full">
                  Chi nhánh gốc: <strong>{homeBranchName || '—'}</strong>
                </p>
              )}
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
              <label className="invoice__field">
                <span>Nhân viên thực hiện</span>
                {lockedEmployee ? (
                  <input type="text" value={getCurrentUserName()} disabled readOnly />
                ) : (
                  <>
                    <select
                      value={form.employeeId}
                      onChange={(e) => handleEmployeeChange(e.target.value)}
                      className={errors.employeeId ? 'invoice__input--error' : ''}
                    >
                      <option value="" disabled>Chọn nhân viên</option>
                      {branchEmployees.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                    {errors.employeeId && <span className="invoice__error">{errors.employeeId}</span>}
                  </>
                )}
              </label>
              {canPickServingBranch ? (
                <label className="invoice__field">
                  <span>Chi nhánh phục vụ khách</span>
                  <select
                    value={form.branchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className={errors.branchId ? 'invoice__input--error' : ''}
                  >
                    {servingBranchOptions.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {errors.branchId && <span className="invoice__error">{errors.branchId}</span>}
                </label>
              ) : null}
            </div>

            <h4 className="invoice__subsection-title">Dịch vụ</h4>
            {errors.services && (
              <p className="invoice__error invoice__error--block">{errors.services}</p>
            )}
            {!form.employeeId && !lockedEmployee ? (
              <p className="invoice__hint">Chọn nhân viên trước.</p>
            ) : !form.branchId ? (
              <p className="invoice__hint">Chọn chi nhánh phục vụ trước.</p>
            ) : catalogGroups.length > 0 ? (
              <GroupedServicePicker
                groups={catalogGroups}
                getCount={getServiceCount}
                onAdd={addService}
                onRemove={removeOneService}
              />
            ) : (
              <FlatServicePicker
                services={branchServices}
                getCount={getServiceCount}
                onAdd={addService}
                onRemove={removeOneService}
              />
            )}

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
              <fieldset className={`invoice__field invoice__payment-method${errors.paymentMethod ? ' is-error' : ''}`}>
                <legend>Phương thức thanh toán</legend>
                <div className="invoice__payment-method-options" role="radiogroup" aria-label="Phương thức thanh toán">
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <label key={opt.value} className="invoice__payment-method-option">
                      <input
                        type="radio"
                        name="invoice-payment-method"
                        value={opt.value}
                        checked={paymentMethod === opt.value}
                        onChange={() => {
                          setPaymentMethod(opt.value)
                          setErrors((prev) => {
                            if (!prev.paymentMethod) return prev
                            const next = { ...prev }
                            delete next.paymentMethod
                            return next
                          })
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {errors.paymentMethod && (
                  <span className="invoice__error">{errors.paymentMethod}</span>
                )}
              </fieldset>
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

            {isAdmin() && form.employeeId && form.date
              && isEmployeeDateLockedByApprovedCloseSync(form.employeeId, form.date) && (
              <label className="invoice__field invoice__field--full">
                <span>Lý do bổ sung/sửa sau kỳ đã duyệt *</span>
                <textarea
                  rows={2}
                  value={adminEditReason}
                  onChange={(e) => {
                    setAdminEditReason(e.target.value)
                    setErrors((prev) => ({ ...prev, adminEditReason: undefined }))
                  }}
                  placeholder="Bắt buộc khi Admin nhập bổ sung hoặc sửa hóa đơn thuộc kỳ lương đã duyệt"
                  className={errors.adminEditReason ? 'invoice__input--error' : ''}
                />
                {errors.adminEditReason && <span className="invoice__error">{errors.adminEditReason}</span>}
              </label>
            )}

            {!isAdmin() && isFormDateLockedForActor(form.date) && (
              <p className="invoice__error invoice__error--block">{getInvoiceCreateLockedDateMessage()}</p>
            )}
          </section>

          <div className="invoice__actions">
            <button
              type="button"
              className="invoice__save-btn"
              onClick={handleSave}
              disabled={
                saving
                || (
                  !isAdmin() && (
                    isFormDateLockedForActor(form.date)
                    || !canAddInvoiceForDate(form.date, undefined, undefined, {
                      employeeId: form.employeeId || currentEmployeeId,
                    })
                  )
                )
              }
            >
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật hóa đơn' : 'Lưu hóa đơn'}
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
