import { ArrowRight, BarChart3, Building2, ClipboardList, MapPin, Phone, ShieldCheck } from 'lucide-react'
import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import BranchContactsFooter from '../components/common/BranchContactsFooter'
import { BRANCH_CONTACTS } from '../constants/branchContacts'
import './Landing.css'

const FEATURE_BLOCKS = [
  {
    icon: ClipboardList,
    title: 'Nhân viên tự nhập Tour',
    description: 'Nhân viên chủ động ghi nhận hóa đơn, dịch vụ đã thực hiện ngay sau mỗi lượt khách.',
  },
  {
    icon: Building2,
    title: 'Quản lý theo dõi chi nhánh',
    description: 'Quản lý chi nhánh nắm bắt doanh thu, nhân sự và báo cáo lương theo thời gian thực.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin quản lý toàn hệ thống',
    description: 'Admin theo dõi toàn bộ chi nhánh, doanh thu, chi phí và vận hành trên một nền tảng duy nhất.',
  },
  {
    icon: BarChart3,
    title: 'Báo cáo doanh thu',
    description: 'Thống kê doanh thu, hoa hồng và lương theo ngày, theo chu kỳ — chính xác, minh bạch.',
  },
]

export default function Landing({ onStart }) {
  return (
    <div className="landing">
      <div className="landing__texture" aria-hidden="true" />
      <div className="landing__glow landing__glow--one" aria-hidden="true" />
      <div className="landing__glow landing__glow--two" aria-hidden="true" />

      <div className="landing__content">
        <main className="landing__hero">
          <KhoeSpaLogo size={128} className="landing__logo" />
          <p className="landing__eyebrow">Hệ thống quản lý vận hành</p>
          <h1 className="landing__title">Khoẻ Spa Manager</h1>
          <p className="landing__description">
            Phần mềm quản lý doanh thu, tour, nhân viên và lương cho hệ thống Khoẻ Spa.
          </p>

          <button type="button" className="landing__cta" onClick={onStart}>
            Đăng nhập hệ thống
            <ArrowRight size={18} strokeWidth={2.25} />
          </button>
        </main>

        <section className="landing__features">
          {FEATURE_BLOCKS.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className="landing__feature-card">
                <div className="landing__feature-icon">
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="landing__feature-title">{item.title}</h3>
                <p className="landing__feature-desc">{item.description}</p>
              </div>
            )
          })}
        </section>

        <section className="landing__branches">
          <p className="landing__branches-eyebrow">Hệ thống chi nhánh</p>
          <h2 className="landing__branches-title">CN1 — CN8</h2>
          <div className="landing__branches-grid">
            {BRANCH_CONTACTS.map((item) => (
              <article key={item.id} className="landing__branch-card">
                <div className="landing__branch-card-badge">{item.label}</div>
                <p className="landing__branch-card-address">
                  <MapPin size={14} aria-hidden />
                  {item.address}
                </p>
                <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`} className="landing__branch-card-phone">
                  <Phone size={14} aria-hidden />
                  {item.phone}
                </a>
              </article>
            ))}
          </div>
        </section>

        <footer className="landing__footer">
          <KhoeSpaLogo size={36} />
          <BranchContactsFooter variant="dark" showBranches={false} />
        </footer>
      </div>
    </div>
  )
}
