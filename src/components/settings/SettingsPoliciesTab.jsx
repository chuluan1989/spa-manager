import { EMPLOYEE_COMMISSION_PERCENT, SUPPORT_EMPLOYEE_COMMISSION_RATE } from '../../constants/salary'
import { loadSystemSettings } from '../../utils/systemSettingsStorage'

export default function SettingsPoliciesTab() {
  const system = loadSystemSettings()

  return (
    <div className="settings__panel">
      <h3 className="settings__section-title">Chính sách vận hành</h3>
      <p className="settings__hint">
        Tổng hợp các chính sách ảnh hưởng đến lương, hoa hồng và khuyến mãi trong hệ thống ERP Spa.
      </p>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Chính sách lương</h4>
        <ul className="settings__policy-list">
          <li>Lương kỳ = Hoa hồng (40% giá vé thực thu) + Tips + Thưởng − Phạt − Giảm lương − Ứng lương.</li>
          <li>Báo cáo lương theo kỳ 1–15, 16–cuối tháng và cả tháng tại module Lương / Nhân viên.</li>
          <li>Tỷ lệ lương riêng theo nhân viên (nếu có) được lưu trong hồ sơ nhân viên.</li>
        </ul>
      </section>

      <section className="settings__policy-block">
        <h4 className="settings__subheading">Chính sách hoa hồng</h4>
        <ul className="settings__policy-list">
          <li>Hoa hồng nhân viên chính: {EMPLOYEE_COMMISSION_PERCENT}% trên giá vé thực thu (sau khuyến mãi). Không tính trên Tips hay tổng thanh toán.</li>
          <li>Hoa hồng nhân viên hỗ trợ: {(SUPPORT_EMPLOYEE_COMMISSION_RATE * 100).toFixed(0)}% trên hoa hồng nhân viên chính (tương đương 20% giá vé thực thu).</li>
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
