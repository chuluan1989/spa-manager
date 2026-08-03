-- Cho phép đánh dấu validation sau khi phiếu đã approved
-- (bổ sung/sửa HĐ/CC của Admin) — KHÔNG cho sửa snapshot / số liệu lương / status.

create or replace function public.payroll_cycle_closes_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      -- Cấm đổi identity / kỳ / snapshot lương / status / số liệu đã duyệt.
      if new.employee_id is distinct from old.employee_id
         or new.from_date is distinct from old.from_date
         or new.to_date is distinct from old.to_date
         or new.billing_month is distinct from old.billing_month
         or new.cycle is distinct from old.cycle
         or new.id is distinct from old.id
         or new.status is distinct from old.status
         or new.snapshot is distinct from old.snapshot
         or new.attendance_snapshot is distinct from old.attendance_snapshot
         or new.submission_history is distinct from old.submission_history
         or new.ticket_revenue is distinct from old.ticket_revenue
         or new.commission is distinct from old.commission
         or new.tips is distinct from old.tips
         or new.bonus is distinct from old.bonus
         or new.penalty is distinct from old.penalty
         or new.advance is distinct from old.advance
         or new.reduction is distinct from old.reduction
         or new.other_adjustment is distinct from old.other_adjustment
         or new.base_salary is distinct from old.base_salary
         or new.net_salary is distinct from old.net_salary
         or new.approved_at is distinct from old.approved_at
         or new.approved_by is distinct from old.approved_by
         or new.approved_by_name is distinct from old.approved_by_name
         or new.submission_version is distinct from old.submission_version then
        raise exception 'Phiếu chốt kỳ đã duyệt — không được sửa snapshot/lương/status (id=%)', old.id;
      end if;
      -- Cho phép cập nhật validation (+ updated_at) để đánh dấu adjustment sau duyệt.
      return new;
    end if;

    if new.employee_id is distinct from old.employee_id
       or new.from_date is distinct from old.from_date
       or new.to_date is distinct from old.to_date
       or new.billing_month is distinct from old.billing_month
       or new.cycle is distinct from old.cycle
       or new.id is distinct from old.id then
      raise exception 'Không được đổi employee_id / kỳ / id của phiếu chốt.';
    end if;

    if new.status = 'approved' and old.status is distinct from 'approved' then
      if coalesce(new.approved_by, '') = '' then
        raise exception 'Thiếu approved_by khi duyệt phiếu chốt.';
      end if;
      if new.approved_by = new.employee_id then
        raise exception 'Nhân viên không được tự duyệt phiếu chốt của mình.';
      end if;
    end if;

    if old.status = 'approved' and new.status is distinct from 'approved' then
      raise exception 'Không được đổi trạng thái phiếu đã duyệt.';
    end if;
  end if;
  return new;
end;
$$;
