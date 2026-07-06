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
    { id: 'body-60', name: 'Body 60', price: 160000, commissionPercent: C.NONE },
    { id: 'body-90', name: 'Body 90', price: 200000, commissionPercent: C.NONE },
    { id: 'foot', name: 'Foot', price: 150000, commissionPercent: C.NONE },
    { id: 'co-vai-gay', name: 'Cổ vai gáy', price: 150000, commissionPercent: C.NONE },
    { id: 'goi-sach', name: 'Gội sạch', price: 60000, commissionPercent: C.TWENTY },
    { id: 'goi-duong-sinh', name: 'Gội dưỡng sinh', price: 120000, commissionPercent: C.TWENTY },
    { id: 'combo-1', name: 'Combo 1', price: 220000, commissionPercent: C.TEN },
    { id: 'combo-2', name: 'Combo 2', price: 260000, commissionPercent: C.TEN },
    { id: 'dap-thuoc', name: 'Đắp thuốc', price: 30000, commissionPercent: C.TWENTY },
    { id: 'giac-hoi', name: 'Giác hơi', price: 30000, commissionPercent: C.TWENTY },
    { id: 'cao-mat', name: 'Cạo mặt', price: 30000, commissionPercent: C.TWENTY },
    { id: 'phong-don', name: 'Phòng đơn', price: 50000, commissionPercent: C.TWENTY },
  ],
  [PRICE_GROUP_IDS.SONG_KHOE_SPA]: [
    { id: 'body-60', name: 'Body 60', price: 190000, commissionPercent: C.NONE },
    { id: 'body-75', name: 'Body 75', price: 230000, commissionPercent: C.NONE },
    { id: 'body-90', name: 'Body 90', price: 250000, commissionPercent: C.NONE },
    { id: 'chuyen-sau', name: 'Chuyên sâu', price: 350000, commissionPercent: C.TEN },
    { id: 'foot', name: 'Foot', price: 100000, commissionPercent: C.NONE },
    { id: 'co-vai-gay', name: 'Cổ vai gáy', price: 150000, commissionPercent: C.NONE },
    { id: 'goi-sach', name: 'Gội sạch', price: 70000, commissionPercent: C.TWENTY },
    { id: 'goi-duong-sinh', name: 'Gội dưỡng sinh', price: 130000, commissionPercent: C.TWENTY },
    { id: 'giac-hoi', name: 'Giác hơi', price: 50000, commissionPercent: C.TWENTY },
    { id: 'cao-mat', name: 'Cạo mặt', price: 50000, commissionPercent: C.TWENTY },
    { id: 'phong-don', name: 'Phòng đơn', price: 40000, commissionPercent: C.TWENTY },
  ],
}
