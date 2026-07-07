import { Phone } from 'lucide-react'
import { BRANCH_CONTACTS, BRAND_SLOGAN, SYSTEM_HOTLINE } from '../../constants/branchContacts'
import './BranchContactsFooter.css'

export default function BranchContactsFooter({ variant = 'dark', showBranches = true }) {
  return (
    <div className={`branch-contacts-footer branch-contacts-footer--${variant}`}>
      <div className="branch-contacts-footer__hotline">
        <Phone size={14} aria-hidden />
        <span>Hotline hệ thống:</span>
        <a href={`tel:${SYSTEM_HOTLINE.replace(/\./g, '')}`}>{SYSTEM_HOTLINE}</a>
      </div>
      {showBranches && (
        <ul className="branch-contacts-footer__list">
          {BRANCH_CONTACTS.map((item) => (
            <li key={item.id}>
              <strong>{item.label}</strong>
              <span className="branch-contacts-footer__address">{item.address}</span>
              <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`}>{item.phone}</a>
            </li>
          ))}
        </ul>
      )}
      <p className="branch-contacts-footer__copy">© 2026 Khoẻ Spa · {BRAND_SLOGAN}</p>
    </div>
  )
}
