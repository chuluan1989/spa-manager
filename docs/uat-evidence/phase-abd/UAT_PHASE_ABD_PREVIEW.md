# UAT Phase A+B+D — Preview Evidence (2026-08-04)

Preview: `http://127.0.0.1:4190/`  
Build: `index-rH4k0Xq5.js`  
Commit/deploy: **không**

## 1) Migration

| Item | Result |
|------|--------|
| `0043_service_change_logs_reason.sql` | **PASS** — cột `change_reason text NOT NULL DEFAULT ''` đã có |
| Bảng V2 thiếu trên DB (`branch_catalogs`, `branch_service_prices`) | **Đã tạo** (prereq Phase D; trước đó không tồn tại) |

## 2) Blocker chính (chặn live A/B/C/F save)

`.env.local` / Vercel pull: `VITE_SUPABASE_ANON_KEY` **không hợp lệ** (length &lt; 40)  
→ Preview hiện: **「Supabase chưa cấu hình. Không thể chỉnh bảng giá.」**  
→ Admin **không lưu được** giá/% lên server trên Preview.

## 3) PASS / FAIL từng mục

| Case | Kết quả | Ghi chú |
|------|---------|---------|
| **A** Đổi giá Sóc Trăng | **BLOCKED** | Không lưu được (Supabase chưa cấu hình). Logic unit: PASS |
| **B** Đổi % + HĐ cũ giữ snapshot | **BLOCKED** (live) / **PASS** (logic + HĐ cũ DB) | HĐ cũ đã có `commissionPercent`/`commissionAmount` trong snapshot |
| **C** HĐ liên chi nhánh | **BLOCKED** (live) / **PASS** (logic) | Cần tạo HĐ sau khi có anon key |
| **D** Đổi CN phục vụ | **PASS** (logic prune) | Live form chưa chạy vì không đổi giá được |
| **E** Copy preview + modes | **PASS** (preview UI) / **BLOCKED** (confirm ghi) | Preview Sóc Trăng → Trạm hiện đủ; confirm disabled |
| **F** Audit | **PASS** (schema) / **PARTIAL** | Có `change_reason`; log cũ (Bạc Liêu) có old/new/actor/time nhưng `change_reason=''` (trước Phase B) |
| **G** Offline / not configured | **PASS** | Banner chặn sửa; Import/Confirm disabled; không ghi local lệch |

Logic script: `node scripts/verify-branch-pricing-phase-abd-uat.mjs` → **9/9 PASS**

## 4) Screenshots

- `docs/uat-evidence/phase-abd/G-supabase-not-configured.png` — banner chặn sửa bảng giá
- Browser: Nâng cao → Sao chép — preview Sóc Trăng → Trạm:
  - Dịch vụ mới: 4
  - Giá thay đổi: 12
  - % thay đổi: 0
  - Ví dụ: Body 60 `160.000→189.000`
  - Modes dropdown: chỉ thêm / ghi đè giá / % / cả hai
  - **Xác nhận sao chép** disabled khi chưa cấu hình Supabase

## 5) Invoice snapshot mẫu (HĐ cũ trên DB — read-only)

```json
{"id":"d388f259-…","branchId":"soc-trang","employeeId":"soc-trang-chi-7",
 "serviceSample":{"id":"body-60","name":"Body 60 60'","price":189000,"commissionPercent":0,"commissionAmount":0}}
{"id":"2303c6e9-…","branchId":"soc-trang","employeeId":"soc-trang-chi-7",
 "serviceSample":{"id":"body-75","name":"Body 75 75'","price":229000,"commissionPercent":20,"commissionAmount":45800}}
{"id":"fce13d28-…","branchId":"tram-spa","employeeId":"tram-spa-thanh",
 "serviceSample":{"id":"body-60","name":"Body 60'","price":160000,"commissionPercent":0,"commissionAmount":0}}
```

→ HĐ cũ đã có snapshot %/amount; Trạm Body 60 = 160k ≠ Sóc Trăng 189k (cô lập chi nhánh trên dữ liệu lịch sử).

## 6) Audit log mẫu (gần nhất)

```json
{
  "branch_id": "bac-lieu",
  "change_reason": "",
  "old_values": {"price": 189000, "commissionPercent": 0},
  "new_values": {"price": 189000, "commissionPercent": 20},
  "changed_by_name": "Admin",
  "created_at": "2026-08-03T17:46:24.067Z"
}
```

Cột `change_reason` sẵn sàng; log mới sau khi có anon key sẽ bắt buộc reason.

## 7) Việc cần để UAT live A–F đủ

1. Điền `VITE_SUPABASE_ANON_KEY` thật (≥40 ký tự) vào `.env.local`
2. `npm run build` + restart Preview `:4190`
3. Chạy lại A–F: sửa giá Sóc Trăng → tạo HĐ mới → đối chiếu Trạm/Sống Khoẻ → audit log có reason

Chưa commit. Chưa deploy.
