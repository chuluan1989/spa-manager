/**
 * UAT Evidence — Login Username/Password V2 + Admin Account Management
 * Run: npm run evidence:uat-login-v2
 *
 * Output: docs/uat-evidence/UAT_EVIDENCE_LOGIN_V2.md + JSON
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './_polyfill-storage.mjs'
import '../src/constants/branches.js'
import { ROLES } from '../src/constants/roles.js'
import { verifyLoginWithUsername } from '../src/constants/loginCredentials.js'
import {
  changeOwnEmployeePassword,
  ensureCredentialsHashed,
  getAccountList,
  loadCredentials,
  resetEmployeePasswordToDefault,
  resetBranchPasswordToDefault,
  resetEmployeePasswordsBulk,
  resetEmployeePasswordsByBranch,
  resetAllLoginPasswordsToDefault,
  syncEmployeeCredentialForEmployee,
  syncEmployeeCredentialsFromEmployees,
  syncMissingBranchCredentials,
} from '../src/utils/credentialsStorage.js'
import {
  allocateEmployeeLoginUsername,
  computeBranchManagerDefaultPassword,
  computeBranchManagerLoginUsername,
  computeEmployeeDefaultPasswordFromProfile,
  computeEmployeeDefaultPasswordFromUsername,
  computeEmployeeLoginUsername,
  employeeCredentialNeedsPasswordChange,
  branchCredentialNeedsPasswordChange,
  getEmployeeLoginUsername,
} from '../src/utils/loginUsername.js'
import {
  normalizeEmployee,
  saveEmployees,
  EMPLOYEE_STATUS,
} from '../src/utils/employeeStorage.js'
import { seedDefaultTestEmployees } from './test-employee-fixtures.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT_DIR = path.join(ROOT, 'docs/uat-evidence')

mkdirSync(OUT_DIR, { recursive: true })

function setSession(user) {
  sessionStorage.setItem('spa-manager-current-user', JSON.stringify(user))
}

const evidence = {
  generatedAt: new Date().toISOString(),
  version: 'login-v2',
  rules: [],
  useCases: [],
  summary: { passed: 0, failed: 0 },
}

function recordUseCase(id, title, steps, ok, notes = '') {
  evidence.useCases.push({ id, title, steps, ok, notes })
  if (ok) evidence.summary.passed += 1
  else evidence.summary.failed += 1
  console.log(`  ${ok ? '✓' : '✗'} ${id}: ${title}`)
}

// --- Rule examples (spec) ---
const ruleExamples = [
  { name: 'Hồng Thương', username: computeEmployeeLoginUsername('Hồng Thương'), branchId: 'vinh-long', password: computeEmployeeDefaultPasswordFromProfile('Hồng Thương', 'vinh-long') },
  { name: 'Thúy An', username: computeEmployeeLoginUsername('Thúy An'), branchId: 'soc-trang', password: computeEmployeeDefaultPasswordFromProfile('Thúy An', 'soc-trang') },
  { name: 'QL Trạm Spa', username: computeBranchManagerLoginUsername('tram-spa'), branchId: 'tram-spa', password: computeBranchManagerDefaultPassword('tram-spa') },
]

for (const ex of ruleExamples) {
  evidence.rules.push(ex)
}

console.log('\n=== UAT Evidence — Login V2 ===\n')
console.log('--- Quy tắc username/password ---\n')
for (const ex of ruleExamples) {
  console.log(`  ${ex.name} → username: ${ex.username}, MK mặc định: ${ex.password}`)
}

seedDefaultTestEmployees()
await ensureCredentialsHashed()
await syncMissingBranchCredentials()
await syncEmployeeCredentialsFromEmployees()

// UC-1: Branch manager V2 login
const mgr = await verifyLoginWithUsername({
  role: ROLES.BRANCH_MANAGER,
  username: 'tramspa',
  password: 'tramspa123',
})
recordUseCase(
  'UC-1',
  'Quản lý chi nhánh đăng nhập (tramspa / tramspa123)',
  ['Chọn QL CN', 'Nhập tramspa', 'Nhập tramspa123'],
  mgr.ok && mgr.user?.branch === 'tram-spa' && mgr.user?.mustChangePassword === true,
  mgr.ok ? `branch=${mgr.user.branch}, mustChangePassword=${mgr.user.mustChangePassword}` : mgr.message,
)

// UC-2: Employee V2 login by display name
const emp = await verifyLoginWithUsername({
  role: ROLES.EMPLOYEE,
  username: 'thanh',
  password: 'thanhtramspa',
})
recordUseCase(
  'UC-2',
  'Nhân viên đăng nhập theo họ tên (thanh / thanhtramspa)',
  ['Chọn NV', 'Nhập thanh', 'Nhập thanhtramspa'],
  emp.ok && emp.user?.employeeId === 'tram-spa-thanh' && emp.user?.mustChangePassword === true,
)

// UC-3: Mandatory password change flow
setSession({
  role: ROLES.EMPLOYEE,
  branch: 'tram-spa',
  employeeId: 'tram-spa-thanh',
  employeeName: 'Thanh',
  mustChangePassword: true,
})
const changeResult = await changeOwnEmployeePassword({
  employeeId: 'tram-spa-thanh',
  currentPassword: 'thanhtramspa',
  newPassword: 'thanhv2pass1',
  confirmPassword: 'thanhv2pass1',
})
const credsAfterChange = loadCredentials().employees?.['tram-spa-thanh']
recordUseCase(
  'UC-3',
  'Đăng nhập lần đầu — bắt buộc đổi mật khẩu',
  ['Login MK mặc định', 'mustChangePassword=true', 'Đổi MK mới', 'customPassword=true'],
  changeResult.success
    && credsAfterChange?.customPassword === true
    && !employeeCredentialNeedsPasswordChange('tram-spa-thanh'),
  changeResult.success ? 'MK mới: thanhv2pass1 (test)' : changeResult.error,
)

const empAfterChange = await verifyLoginWithUsername({
  role: ROLES.EMPLOYEE,
  username: 'thanh',
  password: 'thanhv2pass1',
})
recordUseCase(
  'UC-3b',
  'Sau đổi MK — login bằng mật khẩu mới',
  ['Login thanh / thanhv2pass1'],
  empAfterChange.ok && empAfterChange.user?.mustChangePassword === false,
)

// UC-4: Admin account list metadata
const accounts = getAccountList()
const thanhAccount = accounts.find((a) => a.id === 'tram-spa-thanh')
const tramManager = accounts.find((a) => a.id === 'tram-spa')
recordUseCase(
  'UC-4',
  'Admin — Danh sách tài khoản (username, đã đổi MK, cập nhật MK)',
  ['Settings → Tài khoản & phân quyền'],
  Boolean(thanhAccount?.username === 'thanh')
    && thanhAccount?.hasChangedPassword === true
    && Boolean(thanhAccount?.passwordUpdatedAt)
    && tramManager?.username === 'tramspa'
    && tramManager?.hasChangedPassword === false,
  `Thanh: ${thanhAccount?.username}, đổi MK=${thanhAccount?.hasChangedPassword}; QL: ${tramManager?.username}`,
)

// UC-5: Admin reset to default
setSession({ role: ROLES.ADMIN, branch: 'all' })
const resetEmp = await resetEmployeePasswordToDefault('tram-spa-thanh')
recordUseCase(
  'UC-5a',
  'Admin — Reset Password nhân viên về mặc định',
  ['Reset MK mặc định → thanhtramspa', 'customPassword=false'],
  resetEmp.success
    && resetEmp.defaultPassword === 'thanhtramspa'
    && employeeCredentialNeedsPasswordChange('tram-spa-thanh'),
)

const resetMgr = await resetBranchPasswordToDefault('tram-spa')
recordUseCase(
  'UC-5b',
  'Admin — Reset Password QL CN về mặc định',
  ['Reset MK mặc định → tramspa123'],
  resetMgr.success
    && resetMgr.defaultPassword === 'tramspa123'
    && branchCredentialNeedsPasswordChange('tram-spa'),
)

// UC-6: Create new employee — auto account
setSession({ role: ROLES.ADMIN, branch: 'all' })
const expectedUser = 'hongthuong'
const expectedPwd = computeEmployeeDefaultPasswordFromProfile('Hồng Thương', 'vinh-long')

const demoEmployee = normalizeEmployee({
  id: 'uat-login-v2-hong-thuong',
  name: 'Hồng Thương',
  branchId: 'vinh-long',
  status: EMPLOYEE_STATUS.ACTIVE,
  position: 'KTV',
})
saveEmployees([demoEmployee])
await syncEmployeeCredentialForEmployee(demoEmployee.id)

const demoAccount = {
  username: getEmployeeLoginUsername(demoEmployee),
  defaultPassword: computeEmployeeDefaultPasswordFromUsername(
    getEmployeeLoginUsername(demoEmployee),
    demoEmployee.branchId,
  ),
  mustChangePassword: employeeCredentialNeedsPasswordChange(demoEmployee.id),
}

recordUseCase(
  'UC-6',
  'Thêm nhân viên mới — tự sinh account theo quy tắc V2',
  ['Tạo Hồng Thương @ Vĩnh Long', `username=${expectedUser}`, `MK=${expectedPwd}`],
  demoAccount.username === expectedUser
    && demoAccount.defaultPassword === expectedPwd
    && demoAccount.mustChangePassword === true,
  JSON.stringify(demoAccount),
)

const loginNew = await verifyLoginWithUsername({
  role: ROLES.EMPLOYEE,
  username: expectedUser,
  password: expectedPwd,
})
recordUseCase(
  'UC-6b',
  'Nhân viên mới đăng nhập ngay sau tạo',
  [`Login ${expectedUser} / ${expectedPwd}`],
  loginNew.ok && loginNew.user?.mustChangePassword === true,
)

// UC-7: Lock/unlock metadata present in account list
const lockedKey = accounts.some((a) => typeof a.status === 'string')
recordUseCase(
  'UC-7',
  'Admin — Khóa / Mở khóa (metadata trạng thái có trong danh sách)',
  ['Cột trạng thái đăng nhập: active | locked'],
  lockedKey,
)

// UC-8: Trùng tên — tự thêm hậu tố số
const dupA = normalizeEmployee({
  id: 'uat-dup-thuy-an-1',
  name: 'Thúy An',
  branchId: 'soc-trang',
  status: EMPLOYEE_STATUS.ACTIVE,
})
const dupB = normalizeEmployee({
  id: 'uat-dup-thuy-an-2',
  name: 'Thúy An',
  branchId: 'vinh-long',
  status: EMPLOYEE_STATUS.ACTIVE,
})
saveEmployees([dupA, dupB])
await syncEmployeeCredentialForEmployee(dupA.id)
await syncEmployeeCredentialForEmployee(dupB.id)
const dupUser1 = getEmployeeLoginUsername(dupA)
const dupUser2 = getEmployeeLoginUsername(dupB)
recordUseCase(
  'UC-8',
  'Trùng tên — username tự thêm hậu tố (thuyan, thuyan2)',
  ['Tạo 2 NV cùng tên Thúy An', 'Username không trùng nhau'],
  dupUser1 === 'thuyan' && dupUser2 === 'thuyan2',
  `${dupUser1}, ${dupUser2}`,
)

// UC-9: Đổi tên hồ sơ — username không đổi
const renamed = normalizeEmployee({
  ...dupA,
  name: 'Thúy An Nguyễn',
})
saveEmployees([renamed, dupB])
await syncEmployeeCredentialsFromEmployees()
recordUseCase(
  'UC-9',
  'Đổi tên Hồ sơ — username giữ nguyên',
  ['Sửa tên Thúy An → Thúy An Nguyễn', 'Username vẫn thuyan'],
  getEmployeeLoginUsername(renamed) === 'thuyan',
)

// UC-10–12: Reset hàng loạt
seedDefaultTestEmployees()
await syncEmployeeCredentialsFromEmployees()
setSession({ role: ROLES.ADMIN, branch: 'all' })
const bulkSelected = await resetEmployeePasswordsBulk(['tram-spa-thanh', 'admin'])
recordUseCase(
  'UC-10',
  'Reset MK hàng loạt — báo succeeded/failed/skipped, không reset Admin',
  ['Chọn NV → Reset', 'Admin bị bỏ qua'],
  bulkSelected.success
    && bulkSelected.succeeded >= 1
    && bulkSelected.skipped >= 1
    && bulkSelected.failed === 0,
  `ok=${bulkSelected.succeeded} skip=${bulkSelected.skipped} fail=${bulkSelected.failed}`,
)

const bulkBranch = await resetEmployeePasswordsByBranch('tram-spa')
recordUseCase(
  'UC-11',
  'Reset MK hàng loạt — theo chi nhánh (offline/local)',
  ['Reset NV + QL CN chi nhánh — chỉ môi trường local'],
  bulkBranch.success && bulkBranch.employeeCount >= 1,
  `employees=${bulkBranch.employeeCount}`,
)

const bulkAll = await resetAllLoginPasswordsToDefault()
recordUseCase(
  'UC-12',
  'Reset MK hàng loạt — toàn hệ thống (offline/local)',
  ['Reset tất cả NV + QL — chỉ môi trường local; bị chặn trên Preview/Production'],
  bulkAll.success && bulkAll.employeeCount >= 1 && bulkAll.branchCount === 8,
  `employees=${bulkAll.employeeCount}, branches=${bulkAll.branchCount}`,
)

recordUseCase(
  'UC-13',
  'allocateEmployeeLoginUsername — gợi ý username không trùng',
  ['thuyan đã dùng → thuyan3'],
  allocateEmployeeLoginUsername('Thúy An') === 'thuyan3',
)

// Write outputs
const md = [
  '# UAT Evidence — Login Username/Password V2 (Final)',
  '',
  `Generated: ${evidence.generatedAt}`,
  '',
  '## Quy tắc',
  '',
  '| Họ tên / Vai trò | Username | Mật khẩu mặc định |',
  '| --- | --- | --- |',
  ...ruleExamples.map((ex) => `| ${ex.name} | \`${ex.username}\` | \`${ex.password}\` |`),
  '',
  '## Use cases',
  '',
  ...evidence.useCases.map((uc) => [
    `### ${uc.id}: ${uc.title}`,
    '',
    `- **Kết quả:** ${uc.ok ? 'PASS' : 'FAIL'}`,
    uc.notes ? `- **Ghi chú:** ${uc.notes}` : '',
    '- **Bước:**',
    ...uc.steps.map((s) => `  1. ${s}`),
    '',
  ].join('\n')),
  '',
  `## Summary: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed`,
  '',
].join('\n')

writeFileSync(path.join(OUT_DIR, 'UAT_EVIDENCE_LOGIN_V2.md'), md, 'utf8')
writeFileSync(path.join(OUT_DIR, 'UAT_EVIDENCE_LOGIN_V2.json'), JSON.stringify(evidence, null, 2), 'utf8')

console.log(`\n=== Summary: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed ===`)
console.log(`Report: docs/uat-evidence/UAT_EVIDENCE_LOGIN_V2.md\n`)

if (evidence.summary.failed > 0) process.exitCode = 1
