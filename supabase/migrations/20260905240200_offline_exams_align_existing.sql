-- Kaveri LMS — offline exams: align the pre-existing table to the bridge
-- contract (forward, LOCAL only)
--
-- 20260905235000 assumed public.offline_exams did not exist, but an earlier
-- LMS migration (20260712065732) had created a dormant faculty-created
-- offline-exam table with a different shape: timestamptz exam_date, NOT NULL
-- course_id/duration/marks, venue, statuses scheduled/ongoing/completed/
-- cancelled, no external-linkage columns, and a status-blind student SELECT
-- policy. That table has zero rows and no UI consumers, so instead of a
-- parallel table we ALIGN it to the Question Paper bridge contract in place:
--
--   * add the bridge columns (external linkage, batch label, start time,
--     student instructions)
--   * relax NOT NULLs (course/date/duration/marks may be unknown at sync
--     time; the QP payload is metadata-only)
--   * exam_date timestamptz -> date (the QP system sends calendar dates; the
--     student/staff UIs format date-only values)
--   * extend the status check to the union of the old and bridge statuses
--   * unique (external_source, external_paper_id) for idempotent ingest
--   * drop the old status-blind admin_select policy — students must not see
--     draft/cancelled exams; the bridge policies from 20260905235000 and
--     20260905240100 already govern all reads/writes on this table.
--
-- offline_exam_students (attendance/roster, dormant, no consumers) is left
-- untouched. The pre-existing course_id ON DELETE CASCADE FK is preserved.

alter table public.offline_exams
  alter column course_id drop not null,
  alter column exam_date drop not null,
  alter column duration_minutes drop not null,
  alter column max_marks drop not null;

alter table public.offline_exams
  alter column exam_date type date using exam_date::date;

alter table public.offline_exams
  add column if not exists batch_label text,
  add column if not exists external_source text not null default 'kaveri_question_paper',
  add column if not exists external_paper_id text,
  add column if not exists external_set_id text,
  add column if not exists start_time time,
  add column if not exists student_instructions text;

alter table public.offline_exams
  drop constraint if exists offline_exams_status_check;
alter table public.offline_exams
  add constraint offline_exams_status_check
  check (status in ('draft','scheduled','ongoing','conducted','completed','results_pending','results_published','cancelled'));

create unique index if not exists uq_offline_exams_external
  on public.offline_exams (external_source, external_paper_id);

-- The old domain's status-blind student SELECT is incompatible with the
-- bridge confidentiality contract. The bridge policies (student_read,
-- staff_read, faculty_insert, staff_update, admin_delete) supersede it.
drop policy if exists admin_select_offline_exams on public.offline_exams;
drop policy if exists admin_insert_offline_exams on public.offline_exams;
drop policy if exists admin_update_offline_exams on public.offline_exams;
drop policy if exists admin_delete_offline_exams on public.offline_exams;