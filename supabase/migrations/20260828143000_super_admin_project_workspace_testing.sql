-- Allow authenticated Super Admins to exercise the real student project
-- workspace for product testing without weakening ordinary student enrollment.

drop policy if exists project_workspace_files_insert_own on public.project_workspace_files;
create policy project_workspace_files_insert_own
on public.project_workspace_files
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'super_admin'
    )
    or exists (
      select 1
      from public.projects project
      join public.course_enrollments enrollment on enrollment.course_id = project.course_id
      where project.id = project_id
        and project.is_published = true
        and enrollment.student_id = (select auth.uid())
        and (enrollment.access_status = 'active' or enrollment.access_status is null)
    )
  )
);

drop policy if exists project_workspace_files_update_own on public.project_workspace_files;
create policy project_workspace_files_update_own
on public.project_workspace_files
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'super_admin'
    )
    or exists (
      select 1
      from public.projects project
      join public.course_enrollments enrollment on enrollment.course_id = project.course_id
      where project.id = project_id
        and project.is_published = true
        and enrollment.student_id = (select auth.uid())
        and (enrollment.access_status = 'active' or enrollment.access_status is null)
    )
  )
)
with check (student_id = (select auth.uid()));

drop policy if exists project_workspace_files_delete_own on public.project_workspace_files;
create policy project_workspace_files_delete_own
on public.project_workspace_files
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'super_admin'
    )
    or exists (
      select 1
      from public.projects project
      join public.course_enrollments enrollment on enrollment.course_id = project.course_id
      where project.id = project_id
        and enrollment.student_id = (select auth.uid())
    )
  )
);
