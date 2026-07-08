/** Thông tin liên hệ chi nhánh — khóa theo branch_id, không theo index mảng. */
export const SYSTEM_HOTLINE = '0774.099.777'
export const BRAND_SLOGAN = 'Massage Y Học Cổ Truyền'

export const BRANCH_CONTACTS = [
  {
    branchId: 'tram-spa',
    label: 'CN1',
    address: '347 Phú Lợi, P. Phú Lợi, TP Cần Thơ',
    phone: '0933.664.368',
  },
  {
    branchId: 'soc-trang',
    label: 'CN2',
    address: '61 Nguyễn Chí Thanh, P. Sóc Trăng, TP Cần Thơ',
    phone: '0846.80.80.83',
  },
  {
    branchId: 'gia-lai-1',
    label: 'CN3',
    address: '63 Trần Khánh Dư, P. Pleiku, Gia Lai',
    phone: '0779.881.388',
  },
  {
    branchId: 'vinh-long',
    label: 'CN4',
    address: 'Tuyến 5, Dãy nhà TNR, Đường Võ Nguyên Giáp, P. Nguyệt Hóa, Vĩnh Long',
    phone: '0704.858.777',
  },
  {
    branchId: 'bac-lieu',
    label: 'CN5',
    address: '36 Ninh Bình, P. Bạc Liêu, Cà Mau',
    phone: '0888.077.655',
  },
  {
    branchId: 'tra-vinh',
    label: 'CN6',
    address: '55D14 Phạm Thái Bường, P. Phước Hậu, Vĩnh Long (Lốc cuối dãy VinHome)',
    phone: '0704.884.777',
  },
  {
    branchId: 'song-khoe-spa',
    label: 'CN7',
    address: '286 Trần Hưng Đạo, P. Phú Lợi, TP Cần Thơ',
    phone: '085.4758.777',
  },
  {
    branchId: 'gia-lai-3',
    label: 'CN8',
    address: '174 Tạ Quang Bửu, P. Pleiku, Gia Lai',
    phone: '0779.881.388',
  },
]

export const BRANCH_CONTACT_BY_ID = Object.fromEntries(
  BRANCH_CONTACTS.map((entry) => [entry.branchId, entry]),
)

/** Lấy nhãn CN / địa chỉ / hotline theo branch_id. */
export function getBranchContactByBranchId(branchId) {
  return BRANCH_CONTACT_BY_ID[branchId] ?? null
}
