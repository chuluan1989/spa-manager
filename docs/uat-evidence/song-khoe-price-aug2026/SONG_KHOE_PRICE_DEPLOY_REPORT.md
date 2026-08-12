# Deploy Production — Bảng giá Sống Khoẻ Aug2026

| Field | Value |
|-------|-------|
| **Commit SHA (HEAD)** | `7bb5f3d70e28170486080f753cff3a9cc6a4716c` |
| Feature commit | `0c379da8249fc6fc441425f0f832834c6b032dda` |
| Production URL | https://www.khoespa.net.vn |
| Vercel deployment | https://spa-manager-neiakkmhz-chuluantn-7418s-projects.vercel.app |
| Inspect | https://vercel.com/chuluantn-7418s-projects/spa-manager/F4SyXMFTQJaMymDQtokaTNfX3NUB |
| Asset | `/assets/index-D67q82p6.js` |
| Apply Production data | **Không chạy lại** |
| Rewrite 38 HĐ ≥ 01/08 | **Không** |
| Post-deploy smoke | **PASS** |

## Phạm vi deploy

- Seed Sống Khoẻ 15 dịch vụ + map catalog
- Preview helper + chặn push `serviceCatalogV2` khi `VITE_SONG_KHOE_CATALOG_PREVIEW=1`
- Scripts audit / apply (dry-run) / UAT / smoke
- Evidence Preview UAT

## Post-deploy smoke

| Step | Result |
|------|--------|
| Bundle production load | PASS |
| Preview flag không bake vào prod | PASS |
| Catalog 15 giá Sống Khoẻ đúng | PASS |
| Sóc Trăng body-60 = 189k | PASS |
| Trạm Spa body-60 = 160k | PASS |
| HĐ Sống Khoẻ ≥ 01/08 vẫn **38** | PASS |
| Form HĐ Sống Khoẻ giá mới + Combo/Đắp thuốc | PASS |
| Cross-branch Sóc Trăng (189k) | PASS |

JSON: `docs/uat-evidence/song-khoe-price-aug2026/SONG_KHOE_PRICE_PROD_SMOKE.json`
