import { useEffect, useMemo, useState } from 'react'
import { useDataSyncVersion } from '../hooks/useDataSyncVersion'
import { getBranchContactByBranchId } from '../constants/branchContacts'
import { getPayrollBranchDisplayTitle } from '../constants/branchPayrollDisplay'
import { getPriceGroupsWithBranchLabels, PRICE_GROUPS } from '../constants/priceGroups'
import { canAccessBranchesPage, canManageBranches, isAdmin } from '../constants/auth'
import BranchEmployeesTab from '../components/branches/BranchEmployeesTab'
import BranchOverviewTab from '../components/branches/BranchOverviewTab'
import BranchPricingTab from '../components/branches/BranchPricingTab'
import BranchCommissionTab from '../components/branches/BranchCommissionTab'
import BranchAttendanceTab from '../components/branches/BranchAttendanceTab'
import BranchSalaryTab from '../components/branches/BranchSalaryTab'
import {
  addBranch,
  BRANCH_STATUS,
  createBranchId,
  getCanonicalBranchesForDisplay,
  getStatusLabel,
  loadBranches,
  lockBranch,
  unlockBranch,
  updateBranch,
} from '../utils/branchStorage'
import { normalizeEmployee } from '../utils/employeeStorage'
import { countEmployeesForBranch } from '../utils/branchEmployeeMatch'
import { deleteBranch } from '../utils/branchLifecycle'
import { canDeleteBranch, BRANCH_DELETE_BLOCKED_MESSAGE } from '../utils/branchDeleteGuard'
import { registerBranchCredential, updateBranchPassword } from '../utils/credentialsStorage'
import { assignBranchManager, getAccountMeta, getBranchManagerAssignments } from '../utils/accountMetadataStorage'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { fetchEmployeesFiltered } from '../repositories/employeesRepository'
import './AdminBranches.css'

const EMPTY_FORM = {
  name: '',
  address: '',
  hotline: '',
  sortOrder: '',
  priceGroupId: PRICE_GROUPS[0].id,
  status: BRANCH_STATUS.ACTIVE,
  supportEnabled: false,
  password: '',
}

const DETAIL_TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'employees', label: 'Nhân viên' },
  { id: 'pricing', label: 'Bảng giá' },
  { id: 'commission', label: 'Hoa hồng' },
  { id: 'attendance', label: 'Chấm công' },
  { id: 'salary', label: 'Lương' },
]

export default function AdminBranches() {
  const readOnly = !canManageBranches()
  const syncVersion = useDataSyncVersion()
  const [branches, setBranches] = useState(() => getCanonicalBranchesForDisplay())
  const [cloudEmployees, setCloudEmployees] = useState([])
  const [employeesError, setEmployeesError] = useState('')
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [detailTab, setDetailTab] = useState('overview')
  const [editModal, setEditModal] = useState(null)
  const [managerModal, setManagerModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [managerName, setManagerName] = useState('')
  const [toast, setToast] = useState('')

  const refresh = () => setBranches(getCanonicalBranchesForDisplay())

  const employeeCounts = useMemo(() => Object.fromEntries(
    branches.map((branch) => [branch.id, countEmployeesForBranch(cloudEmployees, branch.id)]),
  ), [branches, cloudEmployees])

  useEffect(() => {
    if (syncVersion > 0) refresh()
  }, [syncVersion])

  useEffect(() => {
    let cancelled = false
    async function loadEmployeesFromCloud() {
      setEmployeesError('')
      if (!isSupabaseConfigured) {
        setEmployeesError('Supabase chưa cấu hình. Không thể tải nhân viên.')
        setCloudEmployees([])
        return
      }
      try {
        const rows = await fetchEmployeesFiltered({})
        if (cancelled) return
        setCloudEmployees((rows ?? []).map((row) => normalizeEmployee(row)))
      } catch (err) {
        if (cancelled) return
        setEmployeesError(err?.message ?? 'Không thể tải nhân viên từ Supabase.')
        setCloudEmployees([])
      }
    }
    loadEmployeesFromCloud()
    return () => { cancelled = true }
  }, [syncVersion])

  const priceGroups = useMemo(() => getPriceGroupsWithBranchLabels(), [branches])
  const managers = useMemo(() => getBranchManagerAssignments(), [branches, managerModal])

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  )

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 3000)
  }

  if (!canAccessBranchesPage()) {
    return (
      <div className="admin-branches admin-branches--denied">
        <h2 className="admin-branches__title">Không có quyền truy cập</h2>
        <p className="admin-branches__subtitle">Menu Chi nhánh chỉ dành cho Admin.</p>
      </div>
    )
  }

  const openAdd = () => {
    const maxSort = branches.reduce((max, b) => Math.max(max, b.sortOrder ?? 0), 0)
    setForm({ ...EMPTY_FORM, sortOrder: String(maxSort + 1) })
    setEditModal({ mode: 'add' })
  }

  const openEdit = (branch) => {
    const contact = getBranchContactByBranchId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address || contact?.address || '',
      hotline: branch.hotline || contact?.phone || '',
      sortOrder: String(branch.sortOrder ?? ''),
      priceGroupId: branch.priceGroupId,
      status: branch.status,
      supportEnabled: branch.supportEnabled,
      password: '',
    })
    setEditModal({ mode: 'edit', branchId: branch.id })
  }

  const closeEditModal = () => {
    setEditModal(null)
    setForm(EMPTY_FORM)
  }

  const saveBranch = async () => {
    if (!form.name?.trim()) {
      showToast('Vui lòng nhập tên chi nhánh')
      return
    }

    const payload = {
      name: form.name,
      address: form.address,
      hotline: form.hotline,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
      priceGroupId: form.priceGroupId,
      status: form.status,
      supportEnabled: form.supportEnabled,
    }

    if (editModal?.mode === 'edit') {
      updateBranch(editModal.branchId, payload)
      if (form.password?.trim()) {
        await updateBranchPassword(editModal.branchId, form.password)
      }
      showToast('Đã cập nhật chi nhánh')
      setSelectedBranchId(editModal.branchId)
    } else {
      const id = createBranchId(form.name)
      addBranch({ id, ...payload })
      await registerBranchCredential(id, form.password || `spa-${id}`)
      showToast('Đã thêm chi nhánh')
      setSelectedBranchId(id)
    }

    closeEditModal()
    refresh()
  }

  const handleDelete = (branch) => {
    const check = canDeleteBranch(branch.id)
    if (!check.allowed) {
      showToast(check.reason ?? BRANCH_DELETE_BLOCKED_MESSAGE)
      return
    }
    if (!window.confirm(`Xóa chi nhánh "${branch.name}"? Hành động không thể hoàn tác.`)) return
    const result = deleteBranch(branch.id)
    if (!result.success) {
      showToast(result.error ?? 'Không thể xóa chi nhánh')
      return
    }
    showToast('Đã xóa chi nhánh')
    const remaining = loadBranches()
    setSelectedBranchId(remaining[0]?.id ?? '')
    refresh()
  }

  const handleToggleLock = (branch) => {
    if (branch.status === BRANCH_STATUS.LOCKED) {
      unlockBranch(branch.id)
      showToast('Đã mở khóa chi nhánh')
    } else {
      lockBranch(branch.id)
      showToast('Đã khóa chi nhánh')
    }
    refresh()
  }

  const openManager = (branch) => {
    setManagerName(getAccountMeta(branch.id).managerName ?? managers[branch.id] ?? '')
    setManagerModal({ branchId: branch.id, branchName: branch.name })
  }

  const saveManager = () => {
    if (!managerModal?.branchId) return
    assignBranchManager(managerModal.branchId, managerName)
    showToast('Đã gán quản lý phụ trách')
    setManagerModal(null)
    setManagerName('')
    refresh()
  }

  const branchDisplayCode = (branch) => {
    const contact = getBranchContactByBranchId(branch.id)
    return contact?.label ?? getPayrollBranchDisplayTitle(branch.id, branch.name)
  }

  return (
    <div className="admin-branches">
      {toast && <div className="admin-branches__toast">{toast}</div>}

      <header className="admin-branches__header">
        <div>
          <h2 className="admin-branches__title">Chi nhánh</h2>
          <p className="admin-branches__subtitle">
            Quản lý chi nhánh theo <code>branch_id</code> — thứ tự hiển thị chỉ dùng <code>sort_order</code>
          </p>
          {employeesError && (
            <p className="admin-branches__hint admin-branches__hint--error">{employeesError}</p>
          )}
        </div>
        {!readOnly && isAdmin() && (
          <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={openAdd}>
            + Thêm chi nhánh
          </button>
        )}
      </header>

      <div className="admin-branches__layout">
        {!selectedBranch ? (
          <section className="admin-branches__grid">
            <h3 className="admin-branches__list-title">8 chi nhánh chuẩn ({branches.length})</h3>
            <div className="admin-branches__grid-cards">
              {branches.map((branch) => (
                <article key={branch.id} className="admin-branches__card">
                  <span className="admin-branches__list-code">{branchDisplayCode(branch)}</span>
                  <h4 className="admin-branches__card-title">{branch.name}</h4>
                  <p className="admin-branches__card-meta">{branch.address || '—'}</p>
                  <p className="admin-branches__card-meta">Hotline: {branch.hotline || '—'}</p>
                  <p className="admin-branches__card-meta">Nhân viên: {employeeCounts[branch.id] ?? 0}</p>
                  <p className="admin-branches__detail-id">branch_id: {branch.id}</p>
                  <button
                    type="button"
                    className="admin-branches__btn admin-branches__btn--primary"
                    onClick={() => {
                      setSelectedBranchId(branch.id)
                      setDetailTab('overview')
                    }}
                  >
                    Xem chi tiết
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <>
            <aside className="admin-branches__list">
              <button
                type="button"
                className="admin-branches__btn admin-branches__btn--secondary admin-branches__back"
                onClick={() => {
                  setSelectedBranchId('')
                  setDetailTab('overview')
                }}
              >
                ← Danh sách chi nhánh
              </button>
              <h3 className="admin-branches__list-title">Chọn nhanh</h3>
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  className={`admin-branches__list-item${selectedBranchId === branch.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedBranchId(branch.id)
                    setDetailTab('overview')
                  }}
                >
                  <span className="admin-branches__list-code">{branchDisplayCode(branch)}</span>
                  <span className="admin-branches__list-name">{branch.name}</span>
                  <span className={`admin-branches__status admin-branches__status--${branch.status === BRANCH_STATUS.ACTIVE ? 'active' : 'locked'}`}>
                    {getStatusLabel(branch.status)}
                  </span>
                </button>
              ))}
            </aside>

            <main className="admin-branches__detail">
              <div className="admin-branches__detail-head">
                <div>
                  <span className="admin-branches__detail-code">{branchDisplayCode(selectedBranch)}</span>
                  <h3 className="admin-branches__detail-title">{selectedBranch.name}</h3>
                  <p className="admin-branches__detail-id">branch_id: {selectedBranch.id}</p>
                </div>
                {!readOnly && isAdmin() && (
                  <div className="admin-branches__detail-actions">
                    <button type="button" className="admin-branches__btn admin-branches__btn--secondary" onClick={() => openEdit(selectedBranch)}>Sửa</button>
                    <button type="button" className="admin-branches__btn admin-branches__btn--secondary" onClick={() => handleToggleLock(selectedBranch)}>
                      {selectedBranch.status === BRANCH_STATUS.LOCKED ? 'Mở khóa' : 'Khóa'}
                    </button>
                    <button type="button" className="admin-branches__btn admin-branches__btn--secondary" onClick={() => openManager(selectedBranch)}>Gán QL</button>
                    <button type="button" className="admin-branches__btn admin-branches__btn--danger" onClick={() => handleDelete(selectedBranch)}>Xóa</button>
                  </div>
                )}
              </div>

              <nav className="admin-branches__tabs">
                {DETAIL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`admin-branches__tab${detailTab === tab.id ? ' is-active' : ''}`}
                    onClick={() => setDetailTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {detailTab === 'overview' && (
                <BranchOverviewTab branchId={selectedBranch.id} />
              )}

              {detailTab === 'employees' && (
                <BranchEmployeesTab
                  branchId={selectedBranch.id}
                  branchName={selectedBranch.name}
                  showToast={showToast}
                  readOnly={readOnly}
                />
              )}

              {detailTab === 'pricing' && (
                <BranchPricingTab branchId={selectedBranch.id} showToast={showToast} readOnly={readOnly} />
              )}

              {detailTab === 'commission' && (
                <BranchCommissionTab branchId={selectedBranch.id} showToast={showToast} />
              )}

              {detailTab === 'attendance' && (
                <BranchAttendanceTab branchId={selectedBranch.id} />
              )}

              {detailTab === 'salary' && (
                <BranchSalaryTab branchId={selectedBranch.id} />
              )}
            </main>
          </>
        )}
      </div>

      {editModal && (
        <div className="admin-branches__modal-backdrop" onClick={closeEditModal}>
          <div className="admin-branches__modal admin-branches__modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">
              {editModal.mode === 'add' ? 'Thêm chi nhánh' : 'Sửa chi nhánh'}
            </h3>
            <div className="admin-branches__form-grid">
              <label className="admin-branches__field admin-branches__field--full">
                <span>Tên chi nhánh</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="admin-branches__field admin-branches__field--full">
                <span>Địa chỉ</span>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="admin-branches__field">
                <span>Hotline</span>
                <input value={form.hotline} onChange={(e) => setForm({ ...form, hotline: e.target.value })} />
              </label>
              <label className="admin-branches__field">
                <span>Thứ tự hiển thị</span>
                <input type="number" min="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </label>
              <label className="admin-branches__field">
                <span>Nhóm giá</span>
                <select value={form.priceGroupId} onChange={(e) => setForm({ ...form, priceGroupId: e.target.value })}>
                  {priceGroups.map((group) => (
                    <option key={group.id} value={group.id}>{group.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-branches__field">
                <span>Trạng thái</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value={BRANCH_STATUS.ACTIVE}>Hoạt động</option>
                  <option value={BRANCH_STATUS.LOCKED}>Tạm khóa</option>
                </select>
              </label>
              <label className="admin-branches__field admin-branches__field--full">
                <span>Mật khẩu QL {editModal.mode === 'edit' ? '(để trống nếu giữ nguyên)' : ''}</span>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            </div>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={saveBranch}>Lưu</button>
              <button type="button" className="admin-branches__btn" onClick={closeEditModal}>Hủy</button>
            </div>
          </div>
        </div>
      )}

      {managerModal && (
        <div className="admin-branches__modal-backdrop" onClick={() => setManagerModal(null)}>
          <div className="admin-branches__modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="admin-branches__modal-title">Gán quản lý — {managerModal.branchName}</h3>
            <label className="admin-branches__field admin-branches__field--full">
              <span>Tên quản lý phụ trách</span>
              <input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Họ tên quản lý" />
            </label>
            <div className="admin-branches__modal-actions">
              <button type="button" className="admin-branches__btn admin-branches__btn--primary" onClick={saveManager}>Lưu</button>
              <button type="button" className="admin-branches__btn" onClick={() => setManagerModal(null)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
