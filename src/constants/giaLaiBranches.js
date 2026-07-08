/** CN3 — 63 Trần Khánh Dư, Pleiku */
export const GIA_LAI_CN3_BRANCH_ID = 'gia-lai-1'

/** CN8 — 174 Tạ Quang Bửu, Pleiku */
export const GIA_LAI_CN8_BRANCH_ID = 'gia-lai-3'

export const GIA_LAI_CATALOG_BRANCH_IDS = [
  GIA_LAI_CN3_BRANCH_ID,
  GIA_LAI_CN8_BRANCH_ID,
]

export function isGiaLaiCatalogBranch(branchId) {
  return GIA_LAI_CATALOG_BRANCH_IDS.includes(branchId)
}
