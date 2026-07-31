-- Batch 4.1: khóa nhận diện nguồn JSON legacy cho attendance_correction_requests
-- Idempotent; không xóa dữ liệu.

alter table public.attendance_correction_requests
  add column if not exists legacy_source_id text;

create unique index if not exists attendance_correction_requests_legacy_source_uniq
  on public.attendance_correction_requests (legacy_source_id)
  where legacy_source_id is not null and trim(legacy_source_id) <> '';

comment on column public.attendance_correction_requests.legacy_source_id is
  'ID gốc từ settings.attendanceEditRequests (JSON). Dùng để migrate idempotent; không xóa JSON cũ.';
