import { COMMISSION } from './services'

const C = COMMISSION

/** Bảng giá Gia Lai — CN3 & CN8 (cấu trúc: nhóm → dịch vụ → thời lượng → giá). */
export const GIA_LAI_CATALOG_VERSION = 1

export const GIA_LAI_SERVICE_CATALOG = {
  version: GIA_LAI_CATALOG_VERSION,
  groups: [
    {
      id: 'combo',
      name: 'COMBO',
      services: [
        { id: 'gl-combo-relax-90', name: 'Combo Relax', durationMinutes: 90, price: 399000, commissionPercent: C.TEN },
        { id: 'gl-combo-fresh-90', name: 'Combo Fresh', durationMinutes: 90, price: 450000, commissionPercent: C.TEN },
        { id: 'gl-combo-lung-vai-gay-90', name: 'Combo Lưng Vai Gáy', durationMinutes: 90, price: 499000, commissionPercent: C.TEN },
        { id: 'gl-combo-body-chan-90', name: 'Combo Body + Chân', durationMinutes: 90, price: 499000, commissionPercent: C.TEN },
        { id: 'gl-combo-phuc-hoi-90', name: 'Combo Chuyên Sâu Phục Hồi', durationMinutes: 90, price: 499000, commissionPercent: C.TEN },
        { id: 'gl-combo-vip-120', name: 'Combo VIP', durationMinutes: 120, price: 699000, commissionPercent: C.TEN },
      ],
    },
    {
      id: 'massage-body',
      name: 'MASSAGE BODY',
      families: [
        {
          id: 'massage-foot',
          name: 'Massage Foot',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-foot-30', durationMinutes: 30, price: 199000 },
            { id: 'gl-foot-60', durationMinutes: 60, price: 349000 },
          ],
        },
        {
          id: 'massage-body-tinh-dau',
          name: 'Massage Body Tinh Dầu',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-body-tinh-dau-60', durationMinutes: 60, price: 349000 },
            { id: 'gl-body-tinh-dau-90', durationMinutes: 90, price: 449000 },
          ],
        },
        {
          id: 'massage-body-nen',
          name: 'Massage Body Nến Cao Cấp',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-body-nen-60', durationMinutes: 60, price: 399000 },
            { id: 'gl-body-nen-90', durationMinutes: 90, price: 499000 },
          ],
        },
        {
          id: 'massage-body-chuyen-sau',
          name: 'Massage Body Chuyên Sâu',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-body-chuyen-sau-90', durationMinutes: 90, price: 499000 },
            { id: 'gl-body-chuyen-sau-120', durationMinutes: 120, price: 599000 },
          ],
        },
        {
          id: 'massage-body-da-nong',
          name: 'Massage Body Đá Nóng',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-body-da-nong-60', durationMinutes: 60, price: 399000 },
            { id: 'gl-body-da-nong-90', durationMinutes: 90, price: 499000 },
          ],
        },
        {
          id: 'massage-bau',
          name: 'Massage Bầu',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-bau-60', durationMinutes: 60, price: 299000 },
            { id: 'gl-bau-75', durationMinutes: 75, price: 349000 },
          ],
        },
        {
          id: 'massage-co-vai-gay',
          name: 'Massage Cổ Vai Gáy',
          commissionPercent: C.NONE,
          variants: [
            { id: 'gl-co-vai-gay-60', durationMinutes: 60, price: 399000 },
            { id: 'gl-co-vai-gay-90', durationMinutes: 90, price: 499000 },
          ],
        },
      ],
    },
    {
      id: 'goi-dau',
      name: 'GỘI ĐẦU DƯỠNG SINH',
      families: [
        {
          id: 'goi-thu-gian',
          name: 'Gội Thư Giãn',
          commissionPercent: C.TWENTY,
          variants: [
            { id: 'gl-goi-thu-gian-30', durationMinutes: 30, price: 99000 },
          ],
        },
        {
          id: 'goi-giam-stress',
          name: 'Gội Giảm Stress',
          commissionPercent: C.TWENTY,
          variants: [
            { id: 'gl-goi-giam-stress-45', durationMinutes: 45, price: 179000 },
          ],
        },
        {
          id: 'goi-duong-sinh',
          name: 'Gội Dưỡng Sinh',
          commissionPercent: C.TWENTY,
          variants: [
            { id: 'gl-goi-duong-sinh-60', durationMinutes: 60, price: 249000 },
            { id: 'gl-goi-duong-sinh-90', durationMinutes: 90, price: 299000 },
          ],
        },
        {
          id: 'goi-thao-duoc',
          name: 'Gội Thảo Dược Chuyên Sâu',
          commissionPercent: C.TWENTY,
          variants: [
            { id: 'gl-goi-thao-duoc-60', durationMinutes: 60, price: 299000 },
            { id: 'gl-goi-thao-duoc-90', durationMinutes: 90, price: 349000 },
          ],
        },
      ],
    },
    {
      id: 'other',
      name: 'DỊCH VỤ KHÁC',
      services: [
        { id: 'gl-cao-gio-giac-hoi', name: 'Cạo Gió Giác Hơi', price: 79000, commissionPercent: C.TWENTY },
        { id: 'gl-thai-doc-ong-truc', name: 'Thải Độc Ống Trúc', price: 99000, commissionPercent: C.TWENTY },
        { id: 'gl-da-nong-addon', name: 'Đá Nóng', price: 49000, commissionPercent: C.TWENTY },
        { id: 'gl-dap-cao-vung', name: 'Đắp Cao Theo Vùng', price: 49000, commissionPercent: C.TWENTY },
        { id: 'gl-book-phong-don', name: 'Book Phòng Đơn', price: 99000, commissionPercent: C.TWENTY },
        {
          id: 'massage-them-gio',
          name: 'Massage thêm giờ',
          commissionPercent: C.TWENTY,
          variants: [
            { id: 'gl-them-gio-15', durationMinutes: 15, price: 49000 },
            { id: 'gl-them-gio-30', durationMinutes: 30, price: 99000 },
          ],
        },
        { id: 'gl-xong-hoi-da-muoi', name: 'Xông Hơi Đá Muối + Ngâm Chân', price: 99000, commissionPercent: C.NONE },
      ],
    },
  ],
}
