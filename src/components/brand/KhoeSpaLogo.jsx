import khoeSpaLogo from '../../assets/khoe-spa-logo.png'

/**
 * Logo thương hiệu Khoẻ Spa (ảnh gốc: nền đen, biểu tượng + chữ vàng).
 * Dùng chung cho trang giới thiệu, trang đăng nhập và có thể mở rộng sau này.
 */
export default function KhoeSpaLogo({ size = 56, className = '' }) {
  return (
    <img
      src={khoeSpaLogo}
      alt="Khoẻ Spa"
      className={`khoe-spa-logo ${className}`.trim()}
      style={{ height: size, width: 'auto' }}
    />
  )
}
