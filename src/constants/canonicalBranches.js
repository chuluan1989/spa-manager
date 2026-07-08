import { PRICE_GROUP_IDS } from './priceGroupIds'

/** Chi nhánh lỗi — dữ liệu chuyển sang gia-lai-2 (CN7). */
export const DEPRECATED_BRANCH_IDS = ['gia-lai-3']

/** Map branch_id cũ → branch_id chuẩn (không đổi employee_id). */
export const BRANCH_ID_MIGRATION = {
  'gia-lai-3': 'gia-lai-2',
}

/** 8 chi nhánh chuẩn — thứ tự CN1→CN8, khóa theo branch_id. */
export const CANONICAL_BRANCH_IDS = [
  'soc-trang',
  'song-khoe-spa',
  'gia-lai-1',
  'tra-vinh',
  'bac-lieu',
  'vinh-long',
  'gia-lai-2',
  'tram-spa',
]

export const CANONICAL_BRANCHES = [
  {
    id: 'soc-trang',
    name: 'Sóc Trăng Khoẻ Spa',
    passwordName: 'Sóc Trăng',
    sortOrder: 1,
    cnCode: 'CN1',
    cnTitle: 'CN1 Sóc Trăng Khoẻ Spa',
    address: '61 Nguyễn Chí Thanh, P. Sóc Trăng, TP Cần Thơ',
    phone: '0846.80.80.83',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: true,
    managerPassword: 'khoespasoctrang',
  },
  {
    id: 'song-khoe-spa',
    name: 'Sống Khoẻ Spa',
    passwordName: 'Sống Khoẻ Spa',
    sortOrder: 2,
    cnCode: 'CN2',
    cnTitle: 'CN2 Sống Khoẻ Spa',
    address: '286 Trần Hưng Đạo, P. Phú Lợi, TP Cần Thơ',
    phone: '085.4758.777',
    priceGroupId: PRICE_GROUP_IDS.SONG_KHOE_SPA,
    supportEnabled: true,
    managerPassword: 'songkhoespa',
  },
  {
    id: 'gia-lai-1',
    name: 'Gia Lai 1',
    passwordName: 'Gia Lai',
    sortOrder: 3,
    cnCode: 'CN3',
    cnTitle: 'CN3 Gia Lai 1',
    address: '63 Trần Khánh Dư, P. Pleiku, Gia Lai',
    phone: '0779.881.388',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: false,
    managerPassword: 'khoespagialai1',
  },
  {
    id: 'tra-vinh',
    name: 'Trà Vinh Khoẻ Spa',
    passwordName: 'Trà Vinh',
    sortOrder: 4,
    cnCode: 'CN4',
    cnTitle: 'CN4 Trà Vinh Khoẻ Spa',
    address: '55D14 Phạm Thái Bường, P. Phước Hậu, Vĩnh Long (Lốc cuối dãy VinHome)',
    phone: '0704.884.777',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: false,
    managerPassword: 'khoespatravinh',
  },
  {
    id: 'bac-lieu',
    name: 'Bạc Liêu Khoẻ Spa',
    passwordName: 'Bạc Liêu',
    sortOrder: 5,
    cnCode: 'CN5',
    cnTitle: 'CN5 Bạc Liêu Khoẻ Spa',
    address: '36 Ninh Bình, P. Bạc Liêu, Cà Mau',
    phone: '0888.077.655',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: false,
    managerPassword: 'khoespabaclieu',
  },
  {
    id: 'vinh-long',
    name: 'Vĩnh Long Khoẻ Spa',
    passwordName: 'Vĩnh Long',
    sortOrder: 6,
    cnCode: 'CN6',
    cnTitle: 'CN6 Vĩnh Long Khoẻ Spa',
    address: 'Tuyến 5, Dãy nhà TNR, Đường Võ Nguyên Giáp, P. Nguyệt Hóa, Vĩnh Long',
    phone: '0704.858.777',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: false,
    managerPassword: 'khoespavinhlong',
  },
  {
    id: 'gia-lai-2',
    name: 'Gia Lai 2',
    passwordName: 'Gia Lai',
    sortOrder: 7,
    cnCode: 'CN7',
    cnTitle: 'CN7 Gia Lai 2',
    address: '174 Tạ Quang Bửu, P. Pleiku, Gia Lai',
    phone: '0779.881.388',
    priceGroupId: PRICE_GROUP_IDS.STANDARD,
    supportEnabled: false,
    managerPassword: 'khoespagialai2',
  },
  {
    id: 'tram-spa',
    name: 'Trạm Spa',
    passwordName: 'Trạm Spa',
    sortOrder: 8,
    cnCode: 'CN8',
    cnTitle: 'CN8 Trạm Spa',
    address: '347 Phú Lợi, P. Phú Lợi, TP Cần Thơ',
    phone: '0933.664.368',
    priceGroupId: PRICE_GROUP_IDS.TRAM_SPA,
    supportEnabled: true,
    managerPassword: 'tramspa',
  },
]

export const CANONICAL_BRANCH_BY_ID = Object.fromEntries(
  CANONICAL_BRANCHES.map((branch) => [branch.id, branch]),
)

export function isCanonicalBranchId(branchId) {
  return CANONICAL_BRANCH_IDS.includes(branchId)
}

export function resolveCanonicalBranchId(branchId) {
  if (!branchId) return branchId
  return BRANCH_ID_MIGRATION[branchId] ?? branchId
}

export function getCanonicalBranch(branchId) {
  const resolved = resolveCanonicalBranchId(branchId)
  return CANONICAL_BRANCH_BY_ID[resolved] ?? null
}

/** Tên hiển thị đầy đủ theo branch_id. */
export function getCanonicalBranchName(branchId) {
  return getCanonicalBranch(branchId)?.name ?? ''
}

/** Tên rút gọn dùng tính mật khẩu nhân viên (không dấu, viết liền). */
export function getPasswordBranchName(branchId) {
  return getCanonicalBranch(branchId)?.passwordName ?? getCanonicalBranchName(branchId)
}

export function getDefaultBranchId() {
  return CANONICAL_BRANCH_IDS[0]
}
