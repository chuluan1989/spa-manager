import { useMemo, useState } from 'react'
import {
  addCustomRole,
  getAllRoles,
  removeCustomRole,
} from '../../utils/rolesStorage'

export default function SettingsRolesTab({ showToast }) {
  const [roles, setRoles] = useState(() => getAllRoles())
  const [newRoleLabel, setNewRoleLabel] = useState('')

  const handleAddRole = () => {
    const result = addCustomRole(newRoleLabel)
    if (!result.success) {
      showToast(result.error)
      return
    }
    setNewRoleLabel('')
    setRoles(getAllRoles())
    showToast('Đã tạo vai trò mới')
  }

  const handleRemoveRole = (roleId) => {
    removeCustomRole(roleId)
    setRoles(getAllRoles())
    showToast('Đã xóa vai trò tùy chỉnh')
  }

  return (
    <section className="settings__card">
      <h3 className="settings__card-title">Vai trò hệ thống</h3>
      <div className="settings__role-list">
        {roles.map((role) => (
          <div key={role.id} className="settings__role-chip">
            <span>{role.label}</span>
            {!role.builtin && (
              <button type="button" className="settings__role-remove" onClick={() => handleRemoveRole(role.id)} aria-label="Xóa">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="settings__role-add">
        <input
          type="text"
          placeholder="Tên vai trò mới (vd. Thu ngân)"
          value={newRoleLabel}
          onChange={(e) => setNewRoleLabel(e.target.value)}
        />
        <button type="button" className="settings__btn settings__btn--secondary" onClick={handleAddRole}>
          Thêm vai trò
        </button>
      </div>
      <p className="settings__hint">Vai trò mặc định: Admin, Quản lý chi nhánh, Nhân viên.</p>
      <p className="settings__hint">Quản lý chi nhánh tại menu <strong>Chi nhánh</strong> (Admin).</p>
    </section>
  )
}
