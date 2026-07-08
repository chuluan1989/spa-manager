import { useMemo, useState } from 'react'
import { getCurrentUserName } from '../../constants/auth'
import {
  addCustomerCareLog,
  getCareLogsForCustomer,
} from '../../utils/customerProfileStorage'

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export default function CustomerCareTab({ customerKey, onUpdated }) {
  const [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState({
    careDate: new Date().toISOString().slice(0, 10),
    content: '',
    result: '',
    followUpDate: '',
  })

  const logs = useMemo(() => {
    void refresh
    return getCareLogsForCustomer(customerKey)
  }, [customerKey, refresh])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.content.trim()) return
    addCustomerCareLog({
      customerKey,
      careDate: form.careDate,
      caretaker: getCurrentUserName(),
      content: form.content,
      result: form.result,
      followUpDate: form.followUpDate,
    })
    setForm({
      careDate: new Date().toISOString().slice(0, 10),
      content: '',
      result: '',
      followUpDate: '',
    })
    setRefresh((value) => value + 1)
    onUpdated?.()
  }

  return (
    <section className="crm-care">
      <form className="crm-care__form" onSubmit={handleSubmit}>
        <h3>Ghi chăm sóc mới</h3>
        <div className="crm-care__grid">
          <label><span>Ngày chăm sóc</span><input type="date" required value={form.careDate} onChange={(e) => setForm({ ...form, careDate: e.target.value })} /></label>
          <label><span>Hẹn chăm sóc lại</span><input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} /></label>
          <label className="crm-care__full"><span>Nội dung</span><textarea required rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Nội dung trao đổi, ưu đãi, lời nhắn..." /></label>
          <label className="crm-care__full"><span>Kết quả</span><textarea rows={2} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="Khách hẹn quay lại, từ chối, cần gọi lại..." /></label>
        </div>
        <button type="submit" className="crm-btn crm-btn--primary">Lưu chăm sóc</button>
      </form>

      <div className="crm-care__history">
        <h3>Lịch sử chăm sóc</h3>
        {logs.length === 0 && <p className="crm-care__empty">Chưa có ghi chú chăm sóc.</p>}
        <ul>
          {logs.map((log) => (
            <li key={log.id} className="crm-care__log">
              <header>
                <strong>{formatDate(log.careDate)}</strong>
                <span>{log.caretaker}</span>
              </header>
              <p>{log.content}</p>
              {log.result && <p className="crm-care__result">Kết quả: {log.result}</p>}
              {log.followUpDate && <p className="crm-care__follow">Hẹn lại: {formatDate(log.followUpDate)}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
