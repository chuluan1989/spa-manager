import { ArrowRight, BarChart3, Building2, ClipboardList, Phone, ShieldCheck } from 'lucide-react'
import KhoeSpaLogo from '../components/brand/KhoeSpaLogo'
import BranchContactsGrid from '../components/common/BranchContactsGrid'
import { BRAND_SLOGAN, SYSTEM_HOTLINE } from '../constants/branchContacts'
import './Landing.css'

const FEATURE_BLOCKS = [
  {
    icon: ClipboardList,
    title: 'Nhân viên tự nhập Tour',
    description: 'Ghi nhận hóa đơn và dịch vụ ngay sau mỗi lượt khách.',
  },
  {
    icon: Building2,
    title: 'Quản lý chi nhánh',
    description: 'Theo dõi doanh thu, nhân sự và lương theo thời gian thực.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin toàn hệ thống',
    description: 'Giám sát toàn bộ chi nhánh trên một nền tảng duy nhất.',
  },
  {
    icon: BarChart3,
    title: 'Báo cáo doanh thu',
    description: 'Thống kê doanh thu, hoa hồng và lương minh bạch.',
  },
]

export default function Landing({ onStart }) {
  return (
    <div className="landing">
      <header className="landing__banner">
        <div className="landing__banner-media" aria-hidden="true">
          <img src="/assets/spa-hero.png" alt="" className="landing__banner-image" />
          <div className="landing__banner-overlay" />
        </div>

        <div className="landing__banner-content">
          <KhoeSpaLogo size={180} className="landing__logo" priority />
          <p className="landing__eyebrow">Hệ thống quản trị vận hành</p>
          <h1 className="landing__title">Khoẻ Spa</h1>
          <p className="landing__slogan">{BRAND_SLOGAN}</p>

          <a href={`tel:${SYSTEM_HOTLINE.replace(/\./g, '')}`} className="landing__hotline">
            <Phone size={18} />
            <span>Hotline</span>
            <strong>{SYSTEM_HOTLINE}</strong>
          </a>

          <button type="button" className="landing__cta" onClick={onStart}>
            Đăng nhập hệ thống
            <ArrowRight size={18} strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <div className="landing__body">
        <section className="landing__features">
          {FEATURE_BLOCKS.map((item) => {
            const Icon = item.icon
            return (
              <article key={item.title} className="landing__feature-card">
                <div className="landing__feature-icon">
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="landing__feature-title">{item.title}</h3>
                <p className="landing__feature-desc">{item.description}</p>
              </article>
            )
          })}
        </section>

        <section className="landing__branches">
          <h2 className="landing__branches-title">Hệ thống 8 chi nhánh</h2>
          <BranchContactsGrid variant="dark" />
        </section>

        <footer className="landing__footer">
          <p>© 2026 Khoẻ Spa · {BRAND_SLOGAN}</p>
        </footer>
      </div>
    </div>
  )
}
