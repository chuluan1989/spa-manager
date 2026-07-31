-- Phiếu chốt kỳ lương (payroll cycle close)
-- Quy ước: Kỳ 1 = 16→cuối tháng trước (gửi ngày 02); Kỳ 2 = 01→15 (gửi ngày 17)
--
-- Lưu ý bảo mật: app hiện dùng anon key (không JWT employee/manager).
-- RLS theo role thật chưa khả thi như các bảng payroll hiện có.
-- Bảo vệ chính: UNIQUE chống trùng kỳ, trigger khóa phiếu approved,
-- và validate bắt buộc trong service/repository (submit/approve/return).

create table if not exists public.payroll_cycle_closes (
  id text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  employee_name text not null default '',
  branch_id text references public.branches(id) on delete set null,
  branch_name text not null default '',
  billing_month text not null,
  cycle text not null check (cycle in ('period1', 'period2')),
  -- cycle_start_date / cycle_end_date
  from_date text not null,
  to_date text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'returned', 'resubmitted', 'approved')),
  submission_version integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  attendance_snapshot jsonb not null default '[]'::jsonb,
  submission_history jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  ticket_revenue integer not null default 0,
  commission integer not null default 0,
  tips integer not null default 0,
  bonus integer not null default 0,
  penalty integer not null default 0,
  advance integer not null default 0,
  reduction integer not null default 0,
  other_adjustment integer not null default 0,
  base_salary integer not null default 0,
  net_salary integer not null default 0,
  submitted_at timestamptz,
  submitted_by text not null default '',
  submitted_by_name text not null default '',
  returned_at timestamptz,
  returned_by text not null default '',
  returned_by_name text not null default '',
  return_reason text not null default '',
  resubmitted_at timestamptz,
  resubmitted_by text not null default '',
  resubmitted_by_name text not null default '',
  approved_at timestamptz,
  approved_by text not null default '',
  approved_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, billing_month, cycle),
  unique (employee_id, from_date, to_date)
);

create index if not exists payroll_cycle_closes_month_cycle_idx
  on public.payroll_cycle_closes (billing_month, cycle);
create index if not exists payroll_cycle_closes_branch_idx
  on public.payroll_cycle_closes (branch_id, billing_month, cycle);
create index if not exists payroll_cycle_closes_status_idx
  on public.payroll_cycle_closes (status);
create index if not exists payroll_cycle_closes_employee_idx
  on public.payroll_cycle_closes (employee_id);

-- Lịch sử append-only mỗi lần gửi / trả / duyệt
create table if not exists public.payroll_cycle_close_events (
  id text primary key,
  close_id text not null references public.payroll_cycle_closes(id) on delete cascade,
  employee_id text not null,
  event_type text not null
    check (event_type in ('submitted', 'returned', 'resubmitted', 'approved')),
  from_status text not null default '',
  to_status text not null default '',
  submission_version integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  note text not null default '',
  actor_id text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payroll_cycle_close_events_close_idx
  on public.payroll_cycle_close_events (close_id, created_at desc);

-- Không cho sửa identity / kỳ sau khi tạo; khóa toàn bộ khi approved
create or replace function public.payroll_cycle_closes_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      raise exception 'Phiếu chốt kỳ đã duyệt — không được sửa (id=%)', old.id;
    end if;

    if new.employee_id is distinct from old.employee_id
       or new.from_date is distinct from old.from_date
       or new.to_date is distinct from old.to_date
       or new.billing_month is distinct from old.billing_month
       or new.cycle is distinct from old.cycle
       or new.id is distinct from old.id then
      raise exception 'Không được đổi employee_id / kỳ / id của phiếu chốt.';
    end if;

    -- Nhân viên (qua API anon) không được tự approved
    if new.status = 'approved' and old.status is distinct from 'approved' then
      if coalesce(new.approved_by, '') = '' then
        raise exception 'Thiếu approved_by khi duyệt phiếu chốt.';
      end if;
      if new.approved_by = new.employee_id then
        raise exception 'Nhân viên không được tự duyệt phiếu chốt của mình.';
      end if;
    end if;

    -- Không hạ status từ approved
    if old.status = 'approved' and new.status is distinct from 'approved' then
      raise exception 'Không được đổi trạng thái phiếu đã duyệt.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_cycle_closes_guard on public.payroll_cycle_closes;
create trigger trg_payroll_cycle_closes_guard
  before update on public.payroll_cycle_closes
  for each row execute function public.payroll_cycle_closes_guard();

alter table public.payroll_cycle_closes enable row level security;
alter table public.payroll_cycle_close_events enable row level security;

-- Khớp pattern payroll hiện tại (anon). Enforce chi tiết ở app service.
drop policy if exists allow_all_anon_payroll_cycle_closes on public.payroll_cycle_closes;
create policy allow_all_anon_payroll_cycle_closes on public.payroll_cycle_closes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists allow_all_anon_payroll_cycle_close_events on public.payroll_cycle_close_events;
create policy allow_all_anon_payroll_cycle_close_events on public.payroll_cycle_close_events
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on public.payroll_cycle_closes to anon, authenticated;
grant all on public.payroll_cycle_close_events to anon, authenticated;
