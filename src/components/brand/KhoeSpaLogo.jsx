/**
 * Biểu tượng thương hiệu Khoẻ Spa — họa tiết lá sen cách điệu,
 * dùng chung cho trang giới thiệu, trang đăng nhập và có thể mở rộng sau này.
 */
export default function KhoeSpaLogo({ size = 56, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`khoe-spa-logo ${className}`.trim()}
      role="img"
      aria-label="Khoẻ Spa"
    >
      <defs>
        <linearGradient id="khoeSpaLogoBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2f9e6f" />
          <stop offset="1" stopColor="#0d6b4a" />
        </linearGradient>
        <linearGradient id="khoeSpaLogoLeaf" x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#dff7ec" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#khoeSpaLogoBg)" />
      <path
        d="M32 47c-9.4 0-17-7.6-17-17 0-5.9 3.3-10.9 6.9-14.5 0.6 6.1 4.4 10.5 10.1 10.5s9.5-4.4 10.1-10.5c3.6 3.6 6.9 8.6 6.9 14.5 0 9.4-7.6 17-17 17z"
        fill="url(#khoeSpaLogoLeaf)"
      />
      <path
        d="M32 22c0 7-3.5 11.5-3.5 11.5s3.5 4.5 3.5 11.5c0-7 3.5-11.5 3.5-11.5S32 29 32 22z"
        fill="#2f9e6f"
        fillOpacity="0.55"
      />
    </svg>
  )
}
