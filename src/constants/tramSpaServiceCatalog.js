import { COMMISSION } from './services'

const C = COMMISSION

/** Bảng giá Trạm Spa — CN1 Cần Thơ (4 nhóm: Combo, Massage Body, Gội đầu, Dịch vụ khác). */
export const TRAM_SPA_CATALOG_VERSION = 1

export const TRAM_SPA_SERVICE_CATALOG = {
  version: TRAM_SPA_CATALOG_VERSION,
  groups: [
    {
      id: 'combo',
      name: 'COMBO',
      services: [
        {
          id: 'combo-1',
          name: 'Combo 1',
          durationMinutes: 90,
          price: 220000,
          commissionPercent: C.TEN,
        },
        {
          id: 'combo-2',
          name: 'Combo 2',
          durationMinutes: 120,
          price: 260000,
          commissionPercent: C.TEN,
        },
      ],
    },
    {
      id: 'massage-body',
      name: 'MASSAGE BODY',
      families: [
        {
          id: 'body',
          name: 'Body',
          commissionPercent: C.NONE,
          variants: [
            { id: 'body-60', durationMinutes: 60, price: 160000 },
            { id: 'body-90', durationMinutes: 90, price: 200000 },
          ],
        },
        {
          id: 'foot',
          name: 'Foot',
          commissionPercent: C.NONE,
          variants: [
            { id: 'foot', durationMinutes: 60, price: 150000 },
          ],
        },
        {
          id: 'co-vai-gay',
          name: 'Cổ Vai Gáy',
          commissionPercent: C.NONE,
          variants: [
            { id: 'co-vai-gay', durationMinutes: 60, price: 150000 },
          ],
        },
      ],
    },
    {
      id: 'goi-dau',
      name: 'GỘI ĐẦU',
      services: [
        { id: 'goi-sach', name: 'Gội sạch', durationMinutes: 30, price: 60000, commissionPercent: C.TWENTY },
        { id: 'goi-duong-sinh', name: 'Gội dưỡng sinh', durationMinutes: 60, price: 120000, commissionPercent: C.TWENTY },
      ],
    },
    {
      id: 'other',
      name: 'DỊCH VỤ KHÁC',
      services: [
        { id: 'dap-thuoc', name: 'Đắp thuốc thảo dược', price: 30000, commissionPercent: C.TWENTY },
        { id: 'giac-hoi', name: 'Giác hơi', price: 30000, commissionPercent: C.TWENTY },
        { id: 'cao-mat', name: 'Cạo gió', price: 30000, commissionPercent: C.TWENTY },
        { id: 'phong-don', name: 'Phòng đơn', price: 50000, commissionPercent: C.TWENTY },
      ],
    },
  ],
}
