/** CN3 — 63 Trần Khánh Dư, Pleiku */
export const GIA_LAI_CN3_BRANCH_ID = 'gia-lai-1'

/** CN8 — 174 Tạ Quang Bửu, Pleiku */
export const GIA_LAI_CN8_BRANCH_ID = 'gia-lai-3'

/** Chi nhánh dùng catalog Gia Lai đầy đủ (giá Pleiku). */
export const GIA_LAI_CATALOG_BRANCH_IDS = [
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN8_BRANCH_ID,
]

/** Chi nhánh dùng UI nhóm dịch vụ (catalog Gia Lai). Gia Lai 1/2/3 — không áp dụng cho CN khác. */
export const GROUPED_CATALOG_BRANCH_IDS = [
  GIA_LAI_CN3_BRANCH_ID,
  'gia-lai-2',
  GIA_LAI_CN8_BRANCH_ID,
]

export function isGiaLaiCatalogBranch(branchId) {
  return GIA_LAI_CATALOG_BRANCH_IDS.includes(branchId)
}

export function isGroupedCatalogBranch(branchId) {
  return GROUPED_CATALOG_BRANCH_IDS.includes(branchId)
}
