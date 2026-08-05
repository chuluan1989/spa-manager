# Đối chiếu tác động Production — trước khi duyệt deploy

**CHƯA DEPLOY.** Backup đã lưu tại: `docs/uat-evidence/admin-payroll-board-local/set-totals/remove-other-adjustment/prod-impact/2026-08-05T16-08-40`

## 1) Thu Hương · Bạc Liêu · 2026-08 Kỳ 1

### A. Production trước thay đổi (baseline nghiệp vụ)

| Hạng mục | Số tiền |
|----------|--------:|
| Thưởng | 500.000 |
| KPI | 0 |
| Phạt | 0 |
| Ứng lương | 0 |
| Điều chỉnh khác | 500.000 |
| **Lương thực nhận** | **434.600** |

Nguồn: DB trước migrate + công thức Production cũ `net = … − advance + otherAdjustment`.

### B. Sau deploy (DB đã migrate + công thức mới)

| Hạng mục | Số tiền |
|----------|--------:|
| Thưởng | 500.000 |
| KPI | 0 |
| Phạt | 0 |
| Ứng lương | 500.000 |
| Điều chỉnh khác | 0 |
| **Lương thực nhận** | **-565.400** |

### C. Chênh lệch (B − A)

| Hạng mục | Δ |
|----------|--:|
| Thưởng | 0 |
| KPI | 0 |
| Phạt | 0 |
| Ứng lương | 500.000 |
| Điều chỉnh khác | -500.000 |
| **Lương thực nhận** | **-1.000.000** |

## 2) Vì sao net giảm 1.000.000

Công thức Production cũ:

```
net_old = base + commission + tips + bonus + kpi − reduction − penalty − advance + otherAdjustment
```

Công thức sau deploy:

```
net_new = base + commission + tips + bonus + kpi − reduction − penalty − advance
```

Với Thu Hương (các hạng mục khác không đổi):

1. **Bỏ cộng Điều chỉnh khác:** otherAdjustment từ **500.000 → không còn cộng**  
   → Δ₁ = **−500.000**

2. **Cộng Ứng lương (trừ net):** advance từ **0 → 500.000**  
   → Δ₂ = **−500.000**

```
Δnet = Δ₁ + Δ₂ = −500.000 + (−500.000) = −1.000.000
```

Kiểm tra số: 434.600 → -565.400  
Identity: `PASS` (`Δnet = −otherAdjustment_cũ + (−Δadvance) = -500000 + (-500000) = -1000000`)

## 3) Toàn hệ thống (Jul K1 / Jul K2 / Aug K1)

- Employee-periods kiểm tra: **105**
- Bị ảnh hưởng net bởi gói thay đổi (migrate + công thức): **1**

**Chỉ duy nhất Thu Hương bị ảnh hưởng.**

Code-deploy-only trên DB hiện tại (ai có otherAdjustment ≠ 0): **0**  
(ĐC đã = 0 toàn hệ → deploy code **không** đổi thêm net ai khác.)

## 4) Backup

| Bảng | Số dòng |
|------|--------:|
| payroll_adjustments | 83 |
| payroll_audit_logs | 428 |
| payroll_locks | 5 |
| payroll_cycle_closes | 1 |

Rollback Thu Hương: xem `BACKUP_META.json` → `thuHuongRollback`  
(Files: `BACKUP_thu_huong_adjustments.json`, `BACKUP_thu_huong_audit_logs.json`)

## 5) Điều kiện duyệt

| Điều kiện | |
|-----------|--|
| Chứng minh Δ net = −1.000.000 bằng công thức | PASS |
| Chỉ Thu Hương bị ảnh hưởng | PASS |
| Backup hoàn tất | PASS (thư mục trên) |
| Deploy | **CHƯA** — chờ anh duyệt |
