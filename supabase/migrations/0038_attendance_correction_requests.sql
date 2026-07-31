-- Batch 4: Yêu cầu bổ sung / chỉnh sửa chấm công + audit append-only
--
-- Lưu ý bảo mật: app dùng anon key (không JWT employee/manager).
-- RLS theo role thật chưa khả thi. Bảo vệ chính:
--   - UNIQUE một yêu cầu pending / (employee_id, attendance_date)
--   - Trigger chặn NV tự duyệt / đổi identity
--   - Validate bắt buộc trong service/repository
-- Quản lý ngoài chi nhánh: enforce ở service (anon không mang claim branch).

create table if not exists public.attendance_correction_requests (
  id text primary key,
  type text not null default 'create'
    check (type in ('create', 'update')),
  attendance_id text,
  employee_id text not null references public.employees(id) on delete cascade,
  employee_name text not null default '',
  branch_id text references public.branches(id) on delete set null,
  branch_name text not null default '',
  attendance_date text not null,
  -- Dữ liệu gốc (nếu đã có bản ghi)
  old_status text not null default '',
  old_reason text not null default '',
  old_note text not null default '',
  old_check_in text not null default '',
  old_check_out text not null default '',
  -- Đề nghị của nhân viên
  proposed_status text not null default 'on_time',
  proposed_reason text not null default '',
  proposed_note text not null default '',
  proposed_check_in text not null default '',
  proposed_check_out text not null default '',
  evidence_note text not null default '',
  -- Dữ liệu Admin/QL chỉnh trước khi duyệt (có thể khác proposed)
  final_status text not null default '',
  final_reason text not null default '',
  final_note text not null default '',
  final_check_in text not null default '',
  final_check_out text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  requested_by text not null default '',
  requested_by_name text not null default '',
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  reviewed_by_name text not null default '',
  review_note text not null default '',
  reject_reason text not null default '',
  employee_notified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Một yêu cầu đang chờ duyệt cho mỗi NV + ngày
create unique index if not exists attendance_correction_requests_pending_uniq
  on public.attendance_correction_requests (employee_id, attendance_date)
  where status = 'pending';

create index if not exists attendance_correction_requests_branch_status_idx
  on public.attendance_correction_requests (branch_id, status, attendance_date desc);
create index if not exists attendance_correction_requests_employee_idx
  on public.attendance_correction_requests (employee_id, attendance_date desc);
create index if not exists attendance_correction_requests_status_idx
  on public.attendance_correction_requests (status, requested_at desc);

-- Audit append-only: mọi thao tác gửi / duyệt / từ chối / hủy / sửa
create table if not exists public.attendance_change_events (
  id text primary key,
  request_id text references public.attendance_correction_requests(id) on delete set null,
  attendance_id text,
  employee_id text not null,
  branch_id text,
  attendance_date text not null default '',
  event_type text not null
    check (event_type in (
      'request_submitted',
      'request_updated',
      'request_cancelled',
      'request_approved',
      'request_rejected',
      'attendance_created',
      'attendance_updated',
      'attendance_voided'
    )),
  actor_id text not null default '',
  actor_name text not null default '',
  actor_role text not null default '',
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  note text not null default '',
  branch_at_action text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists attendance_change_events_request_idx
  on public.attendance_change_events (request_id, created_at desc);
create index if not exists attendance_change_events_employee_idx
  on public.attendance_change_events (employee_id, attendance_date, created_at desc);

-- Guard: không cho NV tự duyệt; khóa identity sau khi tạo; không đổi employee/date khi đã duyệt
create or replace function public.attendance_correction_requests_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status in ('approved', 'rejected', 'cancelled')
       and new.status is distinct from old.status
       and old.status = 'approved' then
      -- Đã duyệt: không đổi status / dữ liệu đề nghị
      if new.status is distinct from old.status
         or new.proposed_status is distinct from old.proposed_status
         or new.proposed_check_in is distinct from old.proposed_check_in
         or new.proposed_check_out is distinct from old.proposed_check_out
         or new.final_status is distinct from old.final_status
         or new.final_check_in is distinct from old.final_check_in
         or new.final_check_out is distinct from old.final_check_out then
        raise exception 'Yêu cầu đã duyệt — không được sửa (id=%)', old.id;
      end if;
    end if;

    if new.employee_id is distinct from old.employee_id
       or new.attendance_date is distinct from old.attendance_date then
      raise exception 'Không được đổi nhân viên hoặc ngày của yêu cầu (id=%)', old.id;
    end if;

    -- Chặn tự duyệt: requested_by = reviewed_by khi chuyển sang approved
    if new.status = 'approved'
       and old.status is distinct from 'approved'
       and coalesce(nullif(trim(new.reviewed_by), ''), '') <> ''
       and coalesce(nullif(trim(new.requested_by), ''), '') <> ''
       and new.reviewed_by = new.requested_by then
      raise exception 'Nhân viên không được tự duyệt yêu cầu chấm công (id=%)', old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_correction_requests_guard_trg
  on public.attendance_correction_requests;
create trigger attendance_correction_requests_guard_trg
  before update on public.attendance_correction_requests
  for each row execute function public.attendance_correction_requests_guard();

alter table public.attendance_correction_requests enable row level security;
alter table public.attendance_change_events enable row level security;

drop policy if exists allow_all_anon_attendance_correction_requests
  on public.attendance_correction_requests;
create policy allow_all_anon_attendance_correction_requests
  on public.attendance_correction_requests
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists allow_all_anon_attendance_change_events
  on public.attendance_change_events;
create policy allow_all_anon_attendance_change_events
  on public.attendance_change_events
  for all to anon, authenticated
  using (true) with check (true);

comment on table public.attendance_correction_requests is
  'Batch 4: yêu cầu bổ sung/sửa chấm công. Role RLS chưa khả thi (anon key); enforce ở trigger + service.';
comment on table public.attendance_change_events is
  'Batch 4: audit append-only cho yêu cầu và thay đổi chấm công chính thức.';
