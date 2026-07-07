/**
 * Logo thương hiệu Khoẻ Spa (nền trong suốt, biểu tượng + chữ vàng).
 * File gốc: /public/assets/logo.png — dùng chung cho trang đăng nhập,
 * trang giới thiệu và các vị trí thương hiệu khác trong hệ thống.
 */
export default function KhoeSpaLogo({ size = 56, className = '' }) {
  return (
    <img
      src="/assets/logo.png"
      alt="Khoẻ Spa"
      className={`khoe-spa-logo ${className}`.trim()}
      style={{ height: size, width: 'auto' }}
    />
  )
}
