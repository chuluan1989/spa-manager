const STORAGE_KEY = 'spa-manager-admin-profile'

export const DEFAULT_ADMIN_PROFILE = {
  name: 'Quản trị viên',
  email: '',
  phone: '',
  avatar: '',
  logoUrl: '',
}

export function loadAdminProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ADMIN_PROFILE))
      return { ...DEFAULT_ADMIN_PROFILE }
    }
    const data = JSON.parse(raw)
    return { ...DEFAULT_ADMIN_PROFILE, ...data }
  } catch {
    return { ...DEFAULT_ADMIN_PROFILE }
  }
}

export function saveAdminProfile(profile) {
  const normalized = {
    name: profile.name?.trim() ?? DEFAULT_ADMIN_PROFILE.name,
    email: profile.email?.trim() ?? '',
    phone: profile.phone?.trim() ?? '',
    avatar: profile.avatar ?? '',
    logoUrl: profile.logoUrl ?? '',
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
