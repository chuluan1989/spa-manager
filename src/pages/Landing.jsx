import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import './Landing.css'

const FEATURE_BLOCKS = [
  {
    icon: '📝',
    title: 'Nhân viên tự nhập tour',
    description: 'Nhân viên chủ động ghi nhận hóa đơn, dịch vụ đã thực hiện ngay sau mỗi lượt khách.',
  },
  {
    icon: '🏢',
    title: 'Quản lý theo dõi chi nhánh',
    description: 'Quản lý chi nhánh nắm bắt doanh thu, nhân sự và báo cáo lương theo thời gian thực.',
  },
  {
    icon: '📊',
    title: 'Admin xem toàn hệ thống',
    description: 'Admin theo dõi toàn bộ chi nhánh, doanh thu, chi phí và vận hành trên một nền tảng duy nhất.',
  },
]

export default function Landing({ onStart }) {
  return (
    <div className="landing">
      <div className="landing__glow landing__glow--one" aria-hidden="true" />
      <div className="landing__glow landing__glow--two" aria-hidden="true" />

      <div className="landing__content">
        <main className="landing__hero">
          <KhoeSpaLogo size={104} className="landing__logo" />
          <p className="landing__eyebrow">Hệ thống quản lý vận hành</p>
          <h1 className="landing__title">Khoẻ Spa Manager</h1>
          <p className="landing__description">
            Phần mềm quản lý doanh thu, tour, nhân viên và lương cho hệ thống Khoẻ Spa.
          </p>

          <button type="button" className="landing__cta" onClick={onStart}>
            Đăng nhập hệ thống
            <span className="landing__cta-arrow" aria-hidden="true">→</span>
          </button>

          <div className="landing__features">
            {FEATURE_BLOCKS.map((item) => (
              <div key={item.title} className="landing__feature-card">
                <div className="landing__feature-icon">{item.icon}</div>
                <h3 className="landing__feature-title">{item.title}</h3>
                <p className="landing__feature-desc">{item.description}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="landing__footer">© 2026 Khoẻ Spa</footer>
      </div>
    </div>
  )
}
