const SERVICES = [
  { id: 'cvg', price: 189000, commissionPercent: 0 },
  { id: 'body-60', price: 189000, commissionPercent: 0 },
  { id: 'body-75', price: 219000, commissionPercent: 0 },
  { id: 'body-90', price: 249000, commissionPercent: 0 },
  { id: 'chuyen-sau', price: 249000, commissionPercent: 10 },
  { id: 'foot', price: 189000, commissionPercent: 0 },
  { id: 'goi-sach', price: 69000, commissionPercent: 20 },
  { id: 'goi-duong-sinh', price: 129000, commissionPercent: 20 },
  { id: 'combo-1', price: 258000, commissionPercent: 10 },
  { id: 'combo-2', price: 318000, commissionPercent: 10 },
  { id: 'dap-thuoc', price: 29000, commissionPercent: 20 },
  { id: 'phong-don', price: 49000, commissionPercent: 20 },
  { id: 'giac-hoi', price: 39000, commissionPercent: 20 },
  { id: 'cao-mat', price: 29000, commissionPercent: 20 },
  { id: 'xong-hoi', price: 50000, commissionPercent: 0 },
]

const MAP = Object.fromEntries(SERVICES.map((s) => [s.id, s]))

function calcCommission(ids, tips) {
  const selected = ids.map((id) => MAP[id]).filter(Boolean)
  const total10 = selected.filter((s) => s.commissionPercent === 10).reduce((s, x) => s + x.price, 0)
  const total20 = selected.filter((s) => s.commissionPercent === 20).reduce((s, x) => s + x.price, 0)
  return Math.round(total10 * 10 / 100) + Math.round(total20 * 20 / 100) + tips
}

const cases = [
  { name: 'CVG only, tips 0', ids: ['cvg'], tips: 0, commission: 0 },
  { name: 'CVG + Foot, tips 50000', ids: ['cvg', 'foot'], tips: 50000, commission: 50000 },
  { name: 'Chuyên sâu only', ids: ['chuyen-sau'], tips: 0, commission: 24900 },
  { name: 'Combo 1 + Combo 2', ids: ['combo-1', 'combo-2'], tips: 0, commission: 57600 },
  { name: 'Gội sạch + Gội dưỡng sinh + tips 10000', ids: ['goi-sach', 'goi-duong-sinh'], tips: 10000, commission: 49600 },
  { name: 'CVG + Chuyên sâu + Gội sạch + tips 20000', ids: ['cvg', 'chuyen-sau', 'goi-sach'], tips: 20000, commission: 58700 },
  { name: 'Body 60/75/90 only', ids: ['body-60', 'body-75', 'body-90'], tips: 0, commission: 0 },
  { name: '4 dịch vụ 20%', ids: ['dap-thuoc', 'phong-don', 'giac-hoi', 'cao-mat'], tips: 0, commission: 29200 },
  { name: 'Xông hơi + tips 15000', ids: ['xong-hoi'], tips: 15000, commission: 15000 },
  { name: 'Chuyên sâu + Gội sạch + tips 25000', ids: ['chuyen-sau', 'goi-sach'], tips: 25000, commission: 63700 },
]

let failed = 0
for (const c of cases) {
  const commission = calcCommission(c.ids, c.tips)
  const ok = commission === c.commission
  console.log(`${ok ? '✓' : '✗'} ${c.name}: ${commission} (expected ${c.commission})`)
  if (!ok) failed++
}

if (failed > 0) process.exit(1)
console.log(`\nAll ${cases.length} examples passed.`)
