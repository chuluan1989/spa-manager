import { loadSystemSettings } from '../../utils/systemSettingsStorage'
import { listCommissionPolicies } from '../../utils/commissionPolicyStorage'
import { SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../../constants/salary'

export default function SettingsPoliciesTab() {
  const system = loadSystemSettings()
  const policies = listCommissionPolicies()

  return (
    <div className="settings__panel">
      <h3 className="settings__section-title">Chính sách vận hành</h3>
      <p className="settings__hint">
        Tổng hợp các chính sách ảnh hưởng đến lương, hoa hồng và khuyến mãi trong hệ thống ERP Spa.
      </p>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Chính sách lương</h4>
        <ul className="settings__policy-list">
          <li>Lương kỳ = Hoa hồng (theo chính sách chi nhánh) + Tips + Thưởng − Phạt − Giảm lương − Ứng lương.</li>
          <li>Báo cáo lương theo kỳ 1–15, 16–cuối tháng và cả tháng tại module Lương / Nhân viên.</li>
          <li>Tỷ lệ lương riêng theo nhân viên (nếu có) được lưu trong hồ sơ nhân viên.</li>
        </ul>
      </section>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Chính sách hoa hồng</h4>
        <ul className="settings__policy-list">
          <li>Hoa hồng nhân viên chính: theo tab Chính sách hoa hồng từng chi nhánh (giá vé thực thu sau khuyến mãi).</li>
          <li>Hoa hồng nhân viên hỗ trợ: {(SUPPORT_EMPLOYEE_COMMISSION_RATE * 100).toFixed(0)}% trên hoa hồng nhân viên chính.</li>
          {policies.map((item) => (
            <li key={item.branchId}>
              {item.branchName}: {item.policy.policyType === 'flat'
                ? `${item.policy.flatRate ?? item.policy.defaultRate}% tất cả dịch vụ`
                : `Theo nhóm (mặc định ${item.policy.defaultRate}%)`}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Chính sách khuyến mãi</h4>
        <ul className="settings__policy-list">
          <li>Khuyến mãi áp dụng trên hóa đơn: giảm trực tiếp trên giá vé trước khi tính doanh thu.</li>
          <li>Bảng giá theo chi nhánh quy định giá vé và nhóm giá tại tab Bảng giá theo chi nhánh.</li>
          <li>Doanh thu báo cáo luôn dựa trên số tiền thực thu sau khuyến mãi.</li>
        </ul>
      </section>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Quản lý hệ thống</h4>
        <ul className="settings__policy-list">
          <li>Tên hệ thống: {system.systemName}</li>
          <li>Thương hiệu: {system.brandName}</li>
          <li>Hotline: {system.hotline || 'Chưa cập nhật'}</li>
          <li>Sao lưu / khôi phục dữ liệu: tab Sao lưu &amp; hệ thống.</li>
          <li>Nhật ký thao tác nhân viên: tab Nhật ký.</li>
        </ul>
      </section>
    </div>
  )
}
