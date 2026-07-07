import { MapPin, Phone } from 'lucide-react'
import { BRANCH_CONTACTS } from '../../constants/branchContacts'
import './BranchContactsGrid.css'

function shortAddress(address) {
  return address.split(',')[0]?.trim() || address
}

export default function BranchContactsGrid({ variant = 'dark', columns = 'auto' }) {
  return (
    <div className={`branch-grid branch-grid--${variant} branch-grid--cols-${columns}`}>
      {BRANCH_CONTACTS.map((item) => (
        <article key={item.id} className="branch-grid__card">
          <div className="branch-grid__label">{item.label}</div>
          <p className="branch-grid__address">
            <MapPin size={14} aria-hidden />
            <span>{shortAddress(item.address)}</span>
          </p>
          <a href={`tel:${item.phone.replace(/[\s.]/g, '')}`} className="branch-grid__phone">
            <Phone size={14} aria-hidden />
            <span>{item.phone}</span>
          </a>
        </article>
      ))}
    </div>
  )
}
