-- Enrollment production hardening.
--
-- 1. Drop the legacy MVP-era anon policies that let the public anon key
--    insert/update/delete/select course_enrollments rows without restriction.
--    Nothing on the public site reads enrollments anonymously: course pages
--    only check enrollment state for signed-in users. Row access for real
--    users is unchanged (enrollments_select_hardened / insert_hardened /
--    delete_admin for authenticated, plus faculty/admin helpers).
drop policy if exists anon_insert_enrollments on public.course_enrollments;
drop policy if exists anon_select_enrollments on public.course_enrollments;
drop policy if exists anon_update_enrollments on public.course_enrollments;
drop policy if exists anon_delete_enrollments on public.course_enrollments;

-- 2. Keep self-serve enrollment but make it explicit and safe: a student may
--    self-enrol only into a published course priced at 0, and the row must be
--    marked with the free_enrollment source (the client sends it). Paid or
--    batch-based courses can only be enrolled by faculty/admin through the
--    existing management flows.
drop policy if exists enrollments_insert_hardened on public.course_enrollments;

create policy enrollments_insert_hardened on public.course_enrollments
  for insert to authenticated
  with check (
    is_admin()
    or (
      student_id = (select auth.uid())
      and access_status = 'active'
      and enrollment_source = 'free_enrollment'
      and exists (
        select 1
        from public.courses c
        where c.id = course_enrollments.course_id
          and c.is_published = true
          and c.price = 0
      )
    )
  );
