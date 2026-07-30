# Employee Lifecycle Management V1

Module nền tảng quản lý vòng đời nhân viên — thay thế các hotfix rời rạc bằng kiến trúc thống nhất.

## Mục tiêu nghiệp vụ

| # | Nghiệp vụ | Hành vi |
|---|-----------|---------|
| I | Thêm nhân viên | Tự động: Employee + app_credentials + username + password mặc định + role + current branch + active |
| II | Đăng nhập | Admin / QL CN / NV — username mapping nhất quán |
| III | Chuyển chi nhánh | Chỉ cập nhật Current Branch + Branch History |
| IV | Sau chuyển | NV/Admin/QL xem đúng phạm vi theo Record Branch |
| V | Nghỉ việc | Inactive, không xóa dữ liệu |
| VI | Kích hoạt lại | Khôi phục credential, đăng nhập bình thường |

## Ba khái niệm dữ liệu (Design Freeze)

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Current Branch     │     │   Record Branch      │     │  Branch History     │
│  employees.branch_id│     │  invoice.branch_id   │     │  branch_history[]   │
│  Login, HĐ mới,     │     │  attendance.branch_id│     │  Timeline chuyển CN │
│  chấm công mới      │     │  BẤT BIẾN sau tạo    │     │                     │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

**Cấm:** bulk-update `record.branch_id` khi chuyển nhân viên.

## Kiến trúc V1

### 1. Record Fetch Contract V2

**File:** `src/contracts/recordFetchContract.js`

Use cases (nghiệp vụ, không gắn màn hình):

- `VIEW_SINGLE_EMPLOYEE_HISTORY` — NV xem lịch sử / Admin drill-down theo NV
- `VIEW_BRANCH_HISTORY` — QL CN / Admin theo record.branch_id
- `VIEW_SYSTEM_HISTORY` — Admin toàn hệ thống
- `TODAY_OPERATION` — Dashboard hôm nay
- `CREATE_RECORD` — Tạo HĐ/chấm công mới (current branch)
- `BRANCH_ROSTER` — Danh sách NV tại chi nhánh

Resolver trả **Strategy** → `buildRepositoryFilters()` → `{ branchId, employeeId }` cho repository.

**Không** viết logic fetch riêng trong từng page — dùng `getRecordFetchFilters(useCase, …)` từ `auth.js`.

### 2. Branch Roster Contract

**File:** `src/contracts/recordFetchRoster.js`

Roster QL CN = NV **hiện tại tại CN** + NV có **activity tại CN** (record branch) trong kỳ.

### 3. Employee Lifecycle Service

**File:** `src/services/employeeLifecycleService.js`

| API | Mô tả |
|-----|-------|
| `createEmployeeWithAccount(data)` | Create + provision credential |
| `transferEmployeeLifecycle(id, branch, opts)` | Transfer — không đụng record cũ |
| `resignEmployee(id)` | Nghỉ việc + xóa credential |
| `reactivateEmployee(id)` | Kích hoạt + provision credential |
| `getEmployeeAccountSummary(id)` | Username / default password hint |

### 4. Login

- Username NV = `employee.id`
- Username QL CN = `branch.id`
- `ensureLoginDataReady()` kéo credentials + employees trước login
- Session branch = Current Branch sau login

## Phạm vi xem sau chuyển chi nhánh

| Vai trò | Phạm vi |
|---------|---------|
| **Nhân viên** | Toàn bộ lịch sử theo `employee_id` (mọi record branch) |
| **QL CN cũ** | Records có `record.branch_id = CN cũ` |
| **QL CN mới** | Records từ ngày chuyển tại CN mới |
| **Admin** | Toàn bộ |

## Luồng chuyển Cherry / Trúc Ly (regression)

1. Cherry có HĐ tại `tram-spa`, chuyển sang `bac-lieu`
2. Employee login → thấy HĐ cả tram-spa và bac-lieu
3. QL Trạm Spa → thấy HĐ tram-spa
4. QL Bạc Liêu → chỉ thấy HĐ bac-lieu (sau ngày chuyển)
5. Admin → thấy tất cả

## File tham chiếu

| Layer | Files |
|-------|-------|
| Contract | `src/contracts/recordFetchContract.js`, `recordFetchRoster.js` |
| Lifecycle | `src/services/employeeLifecycleService.js` |
| Storage | `src/utils/employeeStorage.js`, `credentialsStorage.js` |
| Timeline | `src/utils/employeeBranchTimeline.js` |
| Auth bridge | `src/constants/auth.js` |
| UI | `EmployeeHubSettings.jsx`, `BranchEmployeesTab.jsx` |
| Hooks | `usePayrollData.js`, `useEmployeeHubData.js` |

## Verify

```bash
npm run verify:employee-lifecycle-v1
npm run verify:rc1
npm run test
```
