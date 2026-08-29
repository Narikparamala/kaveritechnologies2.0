create table if not exists public.project_workspace_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  file_path text not null check (length(file_path) between 1 and 240 and file_path !~ '(^|/)\.\.(/|$)'),
  content text not null default '' check (octet_length(content) <= 1048576),
  language text not null default 'text',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, student_id, file_path)
);
create index if not exists project_workspace_files_owner_idx on public.project_workspace_files (student_id, project_id, order_index);
drop trigger if exists update_project_workspace_files_updated_at on public.project_workspace_files;
create trigger update_project_workspace_files_updated_at before update on public.project_workspace_files for each row execute function public.update_updated_at_column();
alter table public.project_workspace_files enable row level security;
create policy project_workspace_files_select_own on public.project_workspace_files for select to authenticated using (student_id = (select auth.uid()));
create policy project_workspace_files_insert_own on public.project_workspace_files for insert to authenticated with check (
  student_id = (select auth.uid()) and exists (
    select 1 from public.projects p join public.course_enrollments ce on ce.course_id = p.course_id
    where p.id = project_id and p.is_published = true and ce.student_id = (select auth.uid())
  )
);
create policy project_workspace_files_update_own on public.project_workspace_files for update to authenticated using (
  student_id = (select auth.uid()) and exists (
    select 1 from public.projects p join public.course_enrollments ce on ce.course_id = p.course_id
    where p.id = project_id and p.is_published = true and ce.student_id = (select auth.uid())
  )
) with check (student_id = (select auth.uid()));
create policy project_workspace_files_delete_own on public.project_workspace_files for delete to authenticated using (
  student_id = (select auth.uid()) and exists (
    select 1 from public.projects p join public.course_enrollments ce on ce.course_id = p.course_id
    where p.id = project_id and ce.student_id = (select auth.uid())
  )
);
grant select, insert, update, delete on public.project_workspace_files to authenticated;
