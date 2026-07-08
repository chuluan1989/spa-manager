import { CANONICAL_BRANCHES } from './canonicalBranches'

/** Thông tin liên hệ chi nhánh — khóa theo branch_id, không theo index mảng. */
export const SYSTEM_HOTLINE = '0774.099.777'
export const BRAND_SLOGAN = 'Massage Y Học Cổ Truyền'

export const BRANCH_CONTACTS = CANONICAL_BRANCHES.map((branch) => ({
  branchId: branch.id,
  label: branch.cnCode,
  address: branch.address,
  phone: branch.phone,
}))

export const BRANCH_CONTACT_BY_ID = Object.fromEntries(
  BRANCH_CONTACTS.map((entry) => [entry.branchId, entry]),
)

/** Lấy nhãn CN / địa chỉ / hotline theo branch_id. */
export function getBranchContactByBranchId(branchId) {
  return BRANCH_CONTACT_BY_ID[branchId] ?? null
}
