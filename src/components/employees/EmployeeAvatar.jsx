import './EmployeeAvatar.css'

function getInitials(name) {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

export default function EmployeeAvatar({ name, avatar, size = 'md' }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name || 'Ảnh đại diện'}
        className={`employee-avatar employee-avatar--${size}`}
      />
    )
  }

  return (
    <span className={`employee-avatar employee-avatar--placeholder employee-avatar--${size}`}>
      {getInitials(name)}
    </span>
  )
}
