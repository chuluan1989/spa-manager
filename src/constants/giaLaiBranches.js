/** CN3 — 63 Trần Khánh Dư, Pleiku */
export const GIA_LAI_CN3_BRANCH_ID = 'gia-lai-1'

/** CN7 — 174 Tạ Quang Bửu, Pleiku */
export const GIA_LAI_CN7_BRANCH_ID = 'gia-lai-2'

/** Chi nhánh dùng catalog Gia Lai đầy đủ (giá Pleiku). */
export const GIA_LAI_CATALOG_BRANCH_IDS = [
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN7_BRANCH_ID,
]

/** Chi nhánh dùng UI nhóm dịch vụ (4 nhóm trên hóa đơn). */
export const GROUPED_CATALOG_BRANCH_IDS = [
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN7_BRANCH_ID,
  'tram-spa',
]

export function isGiaLaiCatalogBranch(branchId) {
  return GIA_LAI_CATALOG_BRANCH_IDS.includes(branchId)
}

export function isGroupedCatalogBranch(branchId) {
  return GROUPED_CATALOG_BRANCH_IDS.includes(branchId)
}
