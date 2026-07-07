/**
 * Logo thương hiệu Khoẻ Spa (nền trong suốt, biểu tượng + chữ vàng).
 * File gốc: /public/assets/logo.png
 */
export default function KhoeSpaLogo({ size = 56, className = '', priority = false }) {
  return (
    <img
      src="/assets/logo.png"
      alt="Khoẻ Spa"
      className={`khoe-spa-logo ${className}`.trim()}
      style={{ height: size, width: 'auto', maxWidth: 'min(100%, 420px)' }}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
