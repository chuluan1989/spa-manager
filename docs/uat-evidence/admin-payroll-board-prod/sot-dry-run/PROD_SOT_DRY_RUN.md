# Production Dry Run — ONE SOURCE OF TRUTH (READ ONLY)

**ONE SOURCE OF TRUTH (Production Read-only) = PASS**

- mismatch = 0
- employees = 21 (min 10)
- branches = 6 (min 5)
- periods = 2 (min 2)
- write/migrate/backfill/deploy = false

## Periods

- 2026-08 Kỳ 1: rows=47, dashboardNet=41739379, labor=41739379, branches=soc-trang,tra-vinh,vinh-long,song-khoe-spa,tram-spa
- 2026-07 Kỳ 2: rows=47, dashboardNet=137016700, labor=137016700, branches=tra-vinh,vinh-long,soc-trang,bac-lieu,tram-spa

## Sampled employees

- Trúc Ly (tram-spa-truc-ly) · soc-trang · 2026-08 Kỳ 1
- Chị 7 (soc-trang-chi-7) · soc-trang · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Bảo Trân (soc-trang-bao-tran) · soc-trang · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Trúc Trinh (tra-vinh-truc-trinh) · tra-vinh · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Mai Nhi (tra-vinh-mai-nhi) · tra-vinh · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Diễm Trinh (tra-vinh-diem-trinh) · tra-vinh · 2026-08 Kỳ 1
- Thu Thảo (vinh-long-thao) · vinh-long · 2026-08 Kỳ 1
- Ngọc Diệu (vinh-long-dieu) · vinh-long · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Ngọc Trâm (vinh-long-tram) · vinh-long · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Kim Ngân (song-khoe-spa-ngan) · song-khoe-spa · 2026-08 Kỳ 1
- Úc (song-khoe-spa-uc) · song-khoe-spa · 2026-08 Kỳ 1
- Ngọc Ánh (song-khoe-spa-anh) · song-khoe-spa · 2026-08 Kỳ 1
- Như Hà (tram-spa-nhu-ha) · tram-spa · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Lan Anh (tram-spa-lan-anh) · tram-spa · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Thanh (tram-spa-thanh) · tram-spa · 2026-08 Kỳ 1, 2026-07 Kỳ 2
- Cẩm Hà (tra-vinh-nhat-ha) · tra-vinh · 2026-07 Kỳ 2
- Hồng Thương (vinh-long-bo) · vinh-long · 2026-07 Kỳ 2
- Ly Ly (soc-trang-ly-ly) · soc-trang · 2026-07 Kỳ 2
- Thảo Cầm (bac-lieu-thao-cam) · bac-lieu · 2026-07 Kỳ 2
- Kim Yến (bac-lieu-yen) · bac-lieu · 2026-07 Kỳ 2
- Thanh Thư (bac-lieu-thanh-thu) · bac-lieu · 2026-07 Kỳ 2

## Mismatches

None.

## Next

Được xin deploy. Sau deploy: smoke Production (hard refresh, asset mới, 10 NV, xác nhận SoT).