-- Faculty Project Builder foundation
-- Adds structured project setup while preserving the existing projects and
-- project_submissions workflow used by students and faculty reviewers.

-- The original Kaveri database already had these two tables. The replacement
-- Supabase project was created from the newer feature migrations, so create the
-- missing project foundation here before applying the builder upgrade below.

-- The replacement database also skipped the helper functions from the legacy
-- initial schema. Keep this migration self-contained so its RLS policies and
-- updated_at triggers work on both the old and replacement databases.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_faculty()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('faculty', 'admin', 'super_admin')
  );
$$;

create or replace function public.faculty_can_access_course(p_course_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.course_faculty cf
    where cf.course_id = p_course_id
      and cf.faculty_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_faculty() from public, anon;
revoke all on function public.faculty_can_access_course(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_faculty() to authenticated;
grant execute on function public.faculty_can_access_course(uuid) to authenticated;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  difficulty text not null default 'beginner'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  category text default 'general',
  estimated_hours integer default 5,
  tech_tags text[] default '{}',
  requirements text,
  starter_code text,
  course_id uuid references public.courses(id) on delete set null,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_difficulty
  on public.projects (difficulty);
create index if not exists idx_projects_category
  on public.projects (category);
create index if not exists idx_projects_course
  on public.projects (course_id);
create index if not exists idx_projects_created_by
  on public.projects (created_by);

drop trigger if exists update_projects_updated_at on public.projects;
create trigger update_projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at_column();

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  github_url text,
  live_url text,
  description text,
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewed', 'approved', 'rejected')),
  feedback text,
  submitted_at timestamptz not null default now(),
  unique (project_id, student_id)
);

create index if not exists idx_project_submissions_student
  on public.project_submissions (student_id);
create index if not exists idx_project_submissions_project
  on public.project_submissions (project_id);

alter table public.projects enable row level security;
alter table public.project_submissions enable row level security;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_submissions to authenticated;

drop policy if exists project_submissions_select on public.project_submissions;
create policy project_submissions_select
  on public.project_submissions for select to authenticated using (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and (
          p.created_by = (select auth.uid())
          or (
            p.course_id is not null
            and public.faculty_can_access_course(p.course_id)
          )
        )
    )
  );

drop policy if exists project_submissions_insert on public.project_submissions;
create policy project_submissions_insert
  on public.project_submissions for insert to authenticated with check (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and p.is_published = true
        and (
          p.course_id is null
          or exists (
            select 1
            from public.course_enrollments ce
            where ce.course_id = p.course_id
              and ce.student_id = (select auth.uid())
              and coalesce(ce.access_status, 'active') = 'active'
          )
        )
    )
  );

drop policy if exists project_submissions_update on public.project_submissions;
create policy project_submissions_update
  on public.project_submissions for update to authenticated using (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and (
          p.created_by = (select auth.uid())
          or (
            p.course_id is not null
            and public.faculty_can_access_course(p.course_id)
          )
        )
    )
  ) with check (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and (
          p.created_by = (select auth.uid())
          or (
            p.course_id is not null
            and public.faculty_can_access_course(p.course_id)
          )
        )
    )
  );

drop policy if exists project_submissions_delete on public.project_submissions;
create policy project_submissions_delete
  on public.project_submissions for delete to authenticated using (
    student_id = (select auth.uid()) or public.is_admin()
  );

alter table public.projects
  add column if not exists project_type text not null default 'python',
  add column if not exists objectives text,
  add column if not exists instructions text,
  add column if not exists submission_mode text not null default 'github_and_live',
  add column if not exists max_marks integer not null default 100,
  add column if not exists due_at timestamptz,
  add column if not exists allow_late_submissions boolean not null default false,
  add column if not exists repository_required boolean not null default true,
  add column if not exists live_demo_required boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_project_type_check'
  ) then
    alter table public.projects add constraint projects_project_type_check
      check (project_type in (
        'python', 'html_css_js', 'selenium_python', 'selenium_java',
        'python_fullstack', 'java_fullstack', 'mern', 'csharp_fullstack',
        'genai', 'n8n', 'custom'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_submission_mode_check'
  ) then
    alter table public.projects add constraint projects_submission_mode_check
      check (submission_mode in ('github', 'github_and_live', 'file_upload', 'external_url'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_max_marks_check'
  ) then
    alter table public.projects add constraint projects_max_marks_check
      check (max_marks between 1 and 1000);
  end if;
end $$;

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  order_index integer not null default 0,
  max_marks integer not null default 0 check (max_marks between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_rubric_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  order_index integer not null default 0,
  max_marks integer not null default 10 check (max_marks between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_starter_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_path text not null,
  content text not null default '',
  language text not null default 'text',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, file_path)
);

create index if not exists project_milestones_project_order_idx
  on public.project_milestones (project_id, order_index);
create index if not exists project_rubric_items_project_order_idx
  on public.project_rubric_items (project_id, order_index);
create index if not exists project_starter_files_project_order_idx
  on public.project_starter_files (project_id, order_index);

drop trigger if exists update_project_milestones_updated_at on public.project_milestones;
create trigger update_project_milestones_updated_at
  before update on public.project_milestones
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_project_rubric_items_updated_at on public.project_rubric_items;
create trigger update_project_rubric_items_updated_at
  before update on public.project_rubric_items
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_project_starter_files_updated_at on public.project_starter_files;
create trigger update_project_starter_files_updated_at
  before update on public.project_starter_files
  for each row execute function public.update_updated_at_column();

alter table public.project_milestones enable row level security;
alter table public.project_rubric_items enable row level security;
alter table public.project_starter_files enable row level security;

-- Project owners and faculty assigned to the course can manage the project.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  public.is_admin()
  or created_by = (select auth.uid())
  or (course_id is not null and public.faculty_can_access_course(course_id))
  or (
    is_published = true
    and course_id is not null
    and exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = projects.course_id
        and ce.student_id = (select auth.uid())
    )
  )
);

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (
  public.is_admin()
  or (
    public.is_faculty()
    and created_by = (select auth.uid())
    and (course_id is null or public.faculty_can_access_course(course_id))
  )
);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using (
  public.is_admin()
  or (
    public.is_faculty()
    and (created_by = (select auth.uid()) or (course_id is not null and public.faculty_can_access_course(course_id)))
  )
) with check (
  public.is_admin()
  or (
    public.is_faculty()
    and (created_by = (select auth.uid()) or (course_id is not null and public.faculty_can_access_course(course_id)))
  )
);

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using (
  public.is_admin()
  or (
    public.is_faculty()
    and (created_by = (select auth.uid()) or (course_id is not null and public.faculty_can_access_course(course_id)))
  )
);

-- The same policy shape is applied to each structured child table.
drop policy if exists project_milestones_select on public.project_milestones;
create policy project_milestones_select on public.project_milestones for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = project_milestones.project_id
      and (
        public.is_admin()
        or p.created_by = (select auth.uid())
        or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        or (
          p.is_published = true
          and p.course_id is not null
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = p.course_id and ce.student_id = (select auth.uid())
          )
        )
      )
  )
);
drop policy if exists project_milestones_insert on public.project_milestones;
create policy project_milestones_insert on public.project_milestones for insert to authenticated with check (
  exists (
    select 1 from public.projects p where p.id = project_milestones.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_milestones_update on public.project_milestones;
create policy project_milestones_update on public.project_milestones for update to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_milestones.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
) with check (
  exists (
    select 1 from public.projects p where p.id = project_milestones.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_milestones_delete on public.project_milestones;
create policy project_milestones_delete on public.project_milestones for delete to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_milestones.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);

drop policy if exists project_rubric_items_select on public.project_rubric_items;
create policy project_rubric_items_select on public.project_rubric_items for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = project_rubric_items.project_id
      and (
        public.is_admin()
        or p.created_by = (select auth.uid())
        or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        or (
          p.is_published = true
          and p.course_id is not null
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = p.course_id and ce.student_id = (select auth.uid())
          )
        )
      )
  )
);
drop policy if exists project_rubric_items_insert on public.project_rubric_items;
create policy project_rubric_items_insert on public.project_rubric_items for insert to authenticated with check (
  exists (
    select 1 from public.projects p where p.id = project_rubric_items.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_rubric_items_update on public.project_rubric_items;
create policy project_rubric_items_update on public.project_rubric_items for update to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_rubric_items.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
) with check (
  exists (
    select 1 from public.projects p where p.id = project_rubric_items.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_rubric_items_delete on public.project_rubric_items;
create policy project_rubric_items_delete on public.project_rubric_items for delete to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_rubric_items.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);

drop policy if exists project_starter_files_select on public.project_starter_files;
create policy project_starter_files_select on public.project_starter_files for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.id = project_starter_files.project_id
      and (
        public.is_admin()
        or p.created_by = (select auth.uid())
        or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        or (
          p.is_published = true
          and p.course_id is not null
          and exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = p.course_id and ce.student_id = (select auth.uid())
          )
        )
      )
  )
);
drop policy if exists project_starter_files_insert on public.project_starter_files;
create policy project_starter_files_insert on public.project_starter_files for insert to authenticated with check (
  exists (
    select 1 from public.projects p where p.id = project_starter_files.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_starter_files_update on public.project_starter_files;
create policy project_starter_files_update on public.project_starter_files for update to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_starter_files.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
) with check (
  exists (
    select 1 from public.projects p where p.id = project_starter_files.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);
drop policy if exists project_starter_files_delete on public.project_starter_files;
create policy project_starter_files_delete on public.project_starter_files for delete to authenticated using (
  exists (
    select 1 from public.projects p where p.id = project_starter_files.project_id
      and (public.is_admin() or p.created_by = (select auth.uid()) or (p.course_id is not null and public.faculty_can_access_course(p.course_id)))
  )
);

grant select, insert, update, delete on public.project_milestones to authenticated;
grant select, insert, update, delete on public.project_rubric_items to authenticated;
grant select, insert, update, delete on public.project_starter_files to authenticated;

-- Replace the complete project structure in one transaction. RLS is still
-- evaluated because this function runs with the caller's privileges.
create or replace function public.save_project_structure(
  p_project_id uuid,
  p_milestones jsonb default '[]'::jsonb,
  p_rubric jsonb default '[]'::jsonb,
  p_starter_files jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.project_milestones where project_id = p_project_id;
  delete from public.project_rubric_items where project_id = p_project_id;
  delete from public.project_starter_files where project_id = p_project_id;

  insert into public.project_milestones (project_id, title, description, max_marks, order_index)
  select
    p_project_id,
    item.value->>'title',
    nullif(item.value->>'description', ''),
    greatest(coalesce((item.value->>'max_marks')::integer, 0), 0),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) with ordinality as item(value, ordinality);

  insert into public.project_rubric_items (project_id, title, description, max_marks, order_index)
  select
    p_project_id,
    item.value->>'title',
    nullif(item.value->>'description', ''),
    greatest(coalesce((item.value->>'max_marks')::integer, 1), 1),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_rubric, '[]'::jsonb)) with ordinality as item(value, ordinality);

  insert into public.project_starter_files (project_id, file_path, content, language, order_index)
  select
    p_project_id,
    item.value->>'file_path',
    coalesce(item.value->>'content', ''),
    coalesce(nullif(item.value->>'language', ''), 'text'),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_starter_files, '[]'::jsonb)) with ordinality as item(value, ordinality);
end;
$$;

revoke all on function public.save_project_structure(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_structure(uuid, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
