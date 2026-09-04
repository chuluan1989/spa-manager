import { COMMISSION } from './services'
import { PRICE_GROUP_IDS } from './priceGroupIds'

const C = COMMISSION

export const DEFAULT_PRICE_GROUPS = {
  [PRICE_GROUP_IDS.STANDARD]: [
    { id: 'body-60', name: 'Body 60', price: 189000, commissionPercent: C.NONE },
    { id: 'body-75', name: 'Body 75', price: 229000, commissionPercent: C.NONE },
    { id: 'body-90', name: 'Body 90', price: 249000, commissionPercent: C.NONE },
    { id: 'chuyen-sau', name: 'Chuyên sâu', price: 349000, commissionPercent: C.TEN },
    { id: 'foot', name: 'Foot', price: 189000, commissionPercent: C.NONE },
    { id: 'co-vai-gay', name: 'Cổ vai gáy', price: 189000, commissionPercent: C.NONE },
    { id: 'goi-sach', name: 'Gội sạch', price: 69000, commissionPercent: C.TWENTY },
    { id: 'goi-duong-sinh', name: 'Gội dưỡng sinh', price: 129000, commissionPercent: C.TWENTY },
    { id: 'combo-1', name: 'Combo 1', price: 258000, commissionPercent: C.TEN },
    { id: 'combo-2', name: 'Combo 2', price: 318000, commissionPercent: C.TEN },
    { id: 'combo-3', name: 'Combo 3', price: 349000, commissionPercent: C.TEN },
    { id: 'dap-thuoc', name: 'Đắp thuốc', price: 39000, commissionPercent: C.TWENTY },
    { id: 'giac-hoi', name: 'Giác hơi', price: 39000, commissionPercent: C.TWENTY },
    { id: 'cao-mat', name: 'Cạo mặt', price: 29000, commissionPercent: C.TWENTY },
    { id: 'phong-don', name: 'Phòng đơn', price: 49000, commissionPercent: C.TWENTY },
    { id: 'xong-hoi', name: 'Xông hơi', price: 50000, commissionPercent: C.NONE },
  ],
  [PRICE_GROUP_IDS.TRAM_SPA]: [
    { id: 'body-60', name: 'Body 60', price: 180000, commissionPercent: C.NONE },
    { id: 'body-90', name: 'Body 90', price: 220000, commissionPercent: C.TEN },
    { id: 'foot', name: 'Foot', price: 180000, commissionPercent: C.NONE },
    { id: 'co-vai-gay', name: 'Cổ vai gáy', price: 180000, commissionPercent: C.NONE },
    { id: 'massage-thai', name: 'Massage Thái', price: 350000, commissionPercent: C.TWENTY },
    { id: 'goi-sach', name: 'Gội sạch', price: 60000, commissionPercent: C.TWENTY },
    { id: 'goi-duong-sinh', name: 'Gội dưỡng sinh', price: 130000, commissionPercent: C.TWENTY },
    { id: 'combo-1', name: "Combo Body 60' + Gội 30'", price: 240000, commissionPercent: C.TEN },
    { id: 'combo-2', name: "Combo Body 90' + Gội 30'", price: 280000, commissionPercent: C.TEN },
    { id: 'dap-thuoc', name: 'Đắp thuốc', price: 30000, commissionPercent: C.TWENTY },
    { id: 'giac-hoi', name: 'Giác hơi', price: 30000, commissionPercent: C.TWENTY },
    { id: 'cao-mat', name: 'Cạo gió', price: 30000, commissionPercent: C.TWENTY },
    { id: 'phong-don', name: 'Phòng đơn', price: 50000, commissionPercent: C.TWENTY },
  ],
  /** Bảng giá Sống Khoẻ — hiệu lực nghiệp vụ từ 2026-08-01. Chỉ price; % hoa hồng giữ nguyên. */
  [PRICE_GROUP_IDS.SONG_KHOE_SPA]: [
    { id: 'body-60', name: 'Massage Body 60 phút – không đá nóng', price: 190000, commissionPercent: C.NONE },
    { id: 'body-75', name: 'Massage Body 75 phút – đá nóng lưng', price: 230000, commissionPercent: C.NONE },
    { id: 'body-90', name: 'Massage Body 90 phút – đá nóng lưng + chân', price: 250000, commissionPercent: C.NONE },
    { id: 'goi-sach', name: 'Gội đầu thư giãn 30 phút', price: 70000, commissionPercent: C.TWENTY },
    { id: 'goi-duong-sinh', name: 'Gội đầu dưỡng sinh 60 phút', price: 130000, commissionPercent: C.TWENTY },
    { id: 'cao-mat', name: 'Cạo mặt + lột mụn + đắp mặt nạ 30 phút', price: 50000, commissionPercent: C.TWENTY },
    { id: 'chuyen-sau', name: 'Chuyên sâu 90 phút', price: 350000, commissionPercent: C.TEN },
    { id: 'combo-1', name: 'Combo 1 – Massage 60P + Gội đầu 30P', price: 260000, commissionPercent: C.TEN },
    { id: 'combo-2', name: 'Combo 2 – Massage 75P + Giác hơi', price: 280000, commissionPercent: C.TEN },
    { id: 'combo-3', name: 'Combo 3 – Massage 90P + Gội đầu 30P + Giác hơi', price: 370000, commissionPercent: C.TEN },
    { id: 'foot', name: 'Massage chân 30 phút', price: 100000, commissionPercent: C.NONE },
    { id: 'co-vai-gay', name: 'Trị liệu Cổ, Vai gáy 60 phút', price: 150000, commissionPercent: C.NONE },
    { id: 'giac-hoi', name: 'Giác hơi / Cạo gió 30 phút', price: 50000, commissionPercent: C.TWENTY },
    { id: 'dap-thuoc', name: 'Đắp thuốc thảo dược / Xông ngải cứu', price: 30000, commissionPercent: C.TWENTY },
    { id: 'phong-don', name: 'Phụ thu phòng đơn', price: 40000, commissionPercent: C.TWENTY },
  ],
}
