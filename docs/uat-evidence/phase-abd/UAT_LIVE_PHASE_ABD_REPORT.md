# UAT LIVE Phase A+B+D — Report (2026-08-04)

Preview: `http://127.0.0.1:4191/`  
Bundle: `index-DJ8Kc4Xe.js`  
Env: `node scripts/build-preview-with-production-env.mjs` → `configured=true`, `urlLen=40`, `keyLen=46`  
Script: `node scripts/uat-live-phase-abd.mjs`  
Chưa commit · Chưa deploy

## Env / Browser

| Check | Result |
|-------|--------|
| Production env từ bundle | PASS (`keyLen=46`, không in key) |
| Preview rebuild port 4191 | PASS |
| Bundle nhúng Supabase | PASS (`configuredLikely=true`) |
| UI Dịch vụ không còn “Supabase chưa cấu hình” | PASS |
| Ô giá/% editable (Sóc Trăng) | PASS — screenshot `G-configured-services-editable.png` |

## Schema

| Object | Result |
|--------|--------|
| `branch_catalogs` | PASS (tồn tại / accessible) |
| `branch_service_prices` | PASS |
| `service_change_logs.change_reason` | PASS |
| Migration repo khớp Prod | **Đã thêm** `supabase/migrations/0044_branch_pricing_v2_tables_align.sql` (idempotent; bảng V2 không FK `service_durations`) |

> 0016/0018 đã có trong repo nhưng 0016 gắn FK tới bảng normalized không dùng; Production đang dùng schema V2 thực tế → 0044 align đúng thực tế.

## Live UAT A–F (duration UAT-only + rollback)

Duration test: `uat-abd-dur-1785781773013` (đã xóa sau test)  
Leftover prices/audits: **0**

| Case | Status | Evidence |
|------|--------|----------|
| **A** Đổi giá Sóc Trăng cô lập | **PASS** | ST `111000→222000`; Trạm/Sống Khoẻ giữ `111000` |
| **B** Đổi % + snapshot cũ/mới | **PASS** | % `11→33`; snapshot cũ `%11/12210`; mới `%33/73260` |
| **C** HĐ liên CN (phục vụ Trạm) | **PASS** | `branchId=tram-spa`, giá/% Trạm `111000/11`, `homeBranchId=soc-trang` |
| **D** Đổi CN phục vụ prune | **PASS** | prune còn đúng duration hợp lệ; NV giữ nguyên |
| **E** Copy modes | **PASS** | overwrite giá Trạm: price→222000 giữ %11; overwrite % SK: %→33 giữ giá 111000 |
| **F** Audit | **PASS** | `change_reason`, old/new, actor `Admin UAT ABD`, `branch_id=soc-trang`, `created_at` |
| Rollback | **PASS** | UAT prices + audits cleaned |

### Record A (trước → sau)

```
ST:   111000/11% → 222000/11%
Trạm: 111000/11% → 111000/11% (không đổi)
SK:   111000/11% → 111000/11% (không đổi)
```

### Invoice snapshot B

```json
{
  "old": { "price": 111000, "commissionPercent": 11, "commissionAmount": 12210, "pricingSource": "branch_service_prices" },
  "new": { "price": 222000, "commissionPercent": 33, "commissionAmount": 73260, "pricingSource": "branch_service_prices" }
}
```

### Audit F (sau A)

```json
{
  "branch_id": "soc-trang",
  "change_reason": "uat-abd-… A change price Soc Trang",
  "old_values": { "price": 111000, "commissionPercent": 11 },
  "new_values": { "price": 222000, "commissionPercent": 11, "reason": "…" },
  "changed_by_name": "Admin UAT ABD",
  "created_at": "2026-08-03T18:29:35.858+00:00"
}
```

## Ghi chú

- Live ghi chỉ trên **duration UAT riêng**, không đụng Body/Combo vận hành.
- UI Admin trên Preview đã online-configured; confirm không còn banner chặn.
- Không commit / không deploy.
