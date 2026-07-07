import { useEffect, useState } from 'react'
import { subscribeToDataSync } from '../utils/supabaseSync'

/**
 * Trả về một số tăng dần mỗi khi có dữ liệu mới được đồng bộ về từ
 * Supabase (nhân viên/hóa đơn/chi phí... trên thiết bị khác). Đưa giá trị
 * này vào dependency của useEffect/useMemo để danh sách tự làm mới mà
 * KHÔNG remount lại toàn trang (không mất form/modal đang mở).
 *
 * Không có tác dụng gì nếu chưa cấu hình Supabase (không có sự kiện nào
 * được bắn ra).
 */
export function useDataSyncVersion() {
  const [version, setVersion] = useState(0)

  useEffect(() => subscribeToDataSync(() => setVersion((v) => v + 1)), [])

  return version
}
