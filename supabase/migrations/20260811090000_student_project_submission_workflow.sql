-- Student project submission workflow
-- Extends the existing projects/project_submissions foundation in place.
-- Existing submissions are preserved.

alter table public.project_submissions
  add column if not exists external_url text,
  add column if not exists score integer,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.project_submissions
  alter column submitted_at drop not null;

alter table public.project_submissions
  drop constraint if exists project_submissions_status_check;

alter table public.project_submissions
  add constraint project_submissions_status_check
  check (status in ('draft', 'submitted', 'reviewed', 'approved', 'rejected'));

alter table public.project_submissions
  drop constraint if exists project_submissions_score_check;

alter table public.project_submissions
  add constraint project_submissions_score_check
  check (score is null or score >= 0);

drop trigger if exists update_project_submissions_updated_at on public.project_submissions;
create trigger update_project_submissions_updated_at
  before update on public.project_submissions
  for each row execute function public.update_updated_at_column();

create table if not exists public.project_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_submissions(id) on delete cascade,
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0 and file_size <= 20971520),
  created_at timestamptz not null default now()
);

create index if not exists project_submission_files_submission_idx
  on public.project_submission_files (submission_id, created_at);

create index if not exists project_submission_files_student_idx
  on public.project_submission_files (student_id);

alter table public.project_submission_files enable row level security;

-- New public tables are not automatically exposed by every Supabase project.
-- Keep the grants explicit as well as the RLS policies below.
grant select, insert, delete on public.project_submission_files to authenticated;

-- Replace the legacy submission insert policy so browser clients cannot forge
-- faculty-only review fields while the application rolls over to the RPC flow.
drop policy if exists project_submissions_insert on public.project_submissions;
create policy project_submissions_insert
  on public.project_submissions for insert to authenticated with check (
    student_id = (select auth.uid())
    and status = 'draft'
    and feedback is null
    and score is null
    and reviewed_by is null
    and reviewed_at is null
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

-- Student writes go through save_project_submission(), which validates the
-- project mode, enrolment, deadline and required evidence in one transaction.
-- Faculty/admin updates remain available for existing management screens.
drop policy if exists project_submissions_update on public.project_submissions;
create policy project_submissions_update
  on public.project_submissions for update to authenticated using (
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and (
          p.created_by = (select auth.uid())
          or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        )
    )
  ) with check (
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = project_submissions.project_id
        and (
          p.created_by = (select auth.uid())
          or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        )
    )
  );

drop policy if exists project_submissions_delete on public.project_submissions;
create policy project_submissions_delete
  on public.project_submissions for delete to authenticated using (
    public.is_admin()
    or (
      student_id = (select auth.uid())
      and status in ('draft', 'reviewed', 'rejected')
    )
  );

drop policy if exists project_submission_files_select on public.project_submission_files;
create policy project_submission_files_select
  on public.project_submission_files for select to authenticated using (
    student_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1
      from public.project_submissions ps
      join public.projects p on p.id = ps.project_id
      where ps.id = project_submission_files.submission_id
        and (
          p.created_by = (select auth.uid())
          or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
        )
    )
  );

drop policy if exists project_submission_files_insert on public.project_submission_files;
create policy project_submission_files_insert
  on public.project_submission_files for insert to authenticated with check (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.project_submissions ps
      where ps.id = project_submission_files.submission_id
        and ps.student_id = (select auth.uid())
        and ps.status in ('draft', 'rejected', 'reviewed')
    )
  );

drop policy if exists project_submission_files_delete on public.project_submission_files;
create policy project_submission_files_delete
  on public.project_submission_files for delete to authenticated using (
    public.is_admin()
    or (
      student_id = (select auth.uid())
      and exists (
        select 1
        from public.project_submissions ps
        where ps.id = project_submission_files.submission_id
          and ps.student_id = (select auth.uid())
          and ps.status in ('draft', 'rejected', 'reviewed')
      )
    )
  );

-- Defence in depth: even if a future policy accidentally permits a direct
-- student update, review-only fields and the score boundary remain protected.
create or replace function public.protect_project_submission_review_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max_marks integer;
begin
  if new.score is not null then
    select p.max_marks into v_max_marks
    from public.projects p
    where p.id = new.project_id;

    if v_max_marks is null or new.score > v_max_marks then
      raise exception 'Score exceeds the project maximum marks';
    end if;
  end if;

  if (select auth.uid()) is not null
     and old.student_id = (select auth.uid())
     and coalesce(current_setting('app.project_submission_rpc', true), '') <> '1'
  then
    if new.project_id is distinct from old.project_id
       or new.student_id is distinct from old.student_id
       or new.feedback is distinct from old.feedback
       or new.score is distinct from old.score
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.submitted_at is distinct from old.submitted_at
       or new.status not in ('draft', 'submitted')
    then
      raise exception 'Students cannot change faculty review fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_project_submission_review_fields on public.project_submissions;
create trigger protect_project_submission_review_fields
  before update on public.project_submissions
  for each row execute function public.protect_project_submission_review_fields();

revoke all on function public.protect_project_submission_review_fields() from public, anon, authenticated;

create or replace function public.save_project_submission(
  p_project_id uuid,
  p_github_url text default null,
  p_live_url text default null,
  p_external_url text default null,
  p_description text default null,
  p_submit boolean default false
)
returns public.project_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects%rowtype;
  v_submission public.project_submissions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id and is_published = true;

  if not found then
    raise exception 'Project is not available';
  end if;

  if v_project.course_id is not null and not exists (
    select 1
    from public.course_enrollments ce
    where ce.course_id = v_project.course_id
      and ce.student_id = v_user_id
      and coalesce(ce.access_status, 'active') = 'active'
  ) then
    raise exception 'You are not enrolled in this project course';
  end if;

  select * into v_submission
  from public.project_submissions
  where project_id = p_project_id and student_id = v_user_id;

  if found and v_submission.status = 'approved' then
    raise exception 'Approved submissions cannot be changed';
  end if;

  if found and v_submission.status = 'submitted' then
    raise exception 'This project is awaiting faculty review';
  end if;

  if length(coalesce(p_description, '')) > 10000 then
    raise exception 'Implementation notes cannot exceed 10000 characters';
  end if;

  if length(coalesce(p_github_url, '')) > 2048
     or length(coalesce(p_live_url, '')) > 2048
     or length(coalesce(p_external_url, '')) > 2048
  then
    raise exception 'A submitted URL is too long';
  end if;

  if nullif(trim(coalesce(p_github_url, '')), '') is not null
     and trim(p_github_url) !~* '^https://(www\.)?github\.com/'
  then
    raise exception 'Enter a valid GitHub repository URL';
  end if;

  if nullif(trim(coalesce(p_live_url, '')), '') is not null
     and trim(p_live_url) !~* '^https?://'
  then
    raise exception 'Enter a valid live demo URL';
  end if;

  if nullif(trim(coalesce(p_external_url, '')), '') is not null
     and trim(p_external_url) !~* '^https?://'
  then
    raise exception 'Enter a valid external project URL';
  end if;

  if p_submit then
    if v_project.due_at is not null
       and now() > v_project.due_at
       and not v_project.allow_late_submissions
    then
      raise exception 'The project deadline has passed';
    end if;

    if (v_project.repository_required or v_project.submission_mode in ('github', 'github_and_live'))
       and nullif(trim(coalesce(p_github_url, '')), '') is null
    then
      raise exception 'A GitHub repository URL is required';
    end if;

    if (v_project.live_demo_required or v_project.submission_mode = 'github_and_live')
       and nullif(trim(coalesce(p_live_url, '')), '') is null
    then
      raise exception 'A live demo URL is required';
    end if;

    if v_project.submission_mode = 'external_url'
       and nullif(trim(coalesce(p_external_url, '')), '') is null
    then
      raise exception 'An external project URL is required';
    end if;
  end if;

  perform set_config('app.project_submission_rpc', '1', true);

  insert into public.project_submissions (
    project_id,
    student_id,
    github_url,
    live_url,
    external_url,
    description,
    status,
    submitted_at,
    feedback,
    score,
    reviewed_by,
    reviewed_at
  ) values (
    p_project_id,
    v_user_id,
    nullif(trim(coalesce(p_github_url, '')), ''),
    nullif(trim(coalesce(p_live_url, '')), ''),
    nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    case when p_submit then 'submitted' else 'draft' end,
    case when p_submit then now() else null end,
    null,
    null,
    null,
    null
  )
  on conflict (project_id, student_id) do update set
    github_url = excluded.github_url,
    live_url = excluded.live_url,
    external_url = excluded.external_url,
    description = excluded.description,
    status = excluded.status,
    submitted_at = excluded.submitted_at,
    feedback = case when p_submit then null else public.project_submissions.feedback end,
    score = case when p_submit then null else public.project_submissions.score end,
    reviewed_by = case when p_submit then null else public.project_submissions.reviewed_by end,
    reviewed_at = case when p_submit then null else public.project_submissions.reviewed_at end,
    updated_at = now()
  returning * into v_submission;

  if p_submit and v_project.submission_mode = 'file_upload' and not exists (
    select 1 from public.project_submission_files f where f.submission_id = v_submission.id
  ) then
    raise exception 'Upload at least one project evidence file';
  end if;

  return v_submission;
end;
$$;

create or replace function public.review_project_submission(
  p_submission_id uuid,
  p_status text,
  p_score integer,
  p_feedback text default null
)
returns public.project_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_submission public.project_submissions%rowtype;
  v_project public.projects%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('reviewed', 'approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  select ps.* into v_submission
  from public.project_submissions ps
  where ps.id = p_submission_id;

  if not found then
    raise exception 'Submission not found';
  end if;

  if v_submission.status = 'draft' then
    raise exception 'Draft submissions cannot be reviewed';
  end if;

  select * into v_project from public.projects where id = v_submission.project_id;

  if not (
    public.is_admin()
    or v_project.created_by = v_user_id
    or (v_project.course_id is not null and public.faculty_can_access_course(v_project.course_id))
  ) then
    raise exception 'You cannot review this submission';
  end if;

  if p_score is null or p_score < 0 or p_score > v_project.max_marks then
    raise exception 'Score must be between 0 and %', v_project.max_marks;
  end if;

  perform set_config('app.project_submission_rpc', '1', true);

  update public.project_submissions set
    status = p_status,
    score = p_score,
    feedback = nullif(trim(coalesce(p_feedback, '')), ''),
    reviewed_by = v_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_submission_id
  returning * into v_submission;

  return v_submission;
end;
$$;

revoke all on function public.save_project_submission(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.review_project_submission(uuid, text, integer, text) from public, anon;
grant execute on function public.save_project_submission(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.review_project_submission(uuid, text, integer, text) to authenticated;

-- Private evidence bucket. Files remain inaccessible without an authenticated
-- owner/faculty policy match and are served with short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-submissions',
  'project-submissions',
  false,
  20971520,
  array[
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/csv',
    'application/json'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists project_submission_objects_insert on storage.objects;
create policy project_submission_objects_insert
  on storage.objects for insert to authenticated with check (
    bucket_id = 'project-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.project_submissions ps
      where ps.id::text = (storage.foldername(name))[2]
        and ps.student_id = (select auth.uid())
        and ps.status in ('draft', 'reviewed', 'rejected')
    )
  );

drop policy if exists project_submission_objects_select on storage.objects;
create policy project_submission_objects_select
  on storage.objects for select to authenticated using (
    bucket_id = 'project-submissions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or exists (
        select 1
        from public.project_submission_files f
        join public.project_submissions ps on ps.id = f.submission_id
        join public.projects p on p.id = ps.project_id
        where f.storage_path = storage.objects.name
          and (
            p.created_by = (select auth.uid())
            or (p.course_id is not null and public.faculty_can_access_course(p.course_id))
          )
      )
    )
  );

drop policy if exists project_submission_objects_delete on storage.objects;
create policy project_submission_objects_delete
  on storage.objects for delete to authenticated using (
    bucket_id = 'project-submissions'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.project_submission_files f
        join public.project_submissions ps on ps.id = f.submission_id
        where f.storage_path = storage.objects.name
          and ps.student_id = (select auth.uid())
          and ps.status in ('draft', 'reviewed', 'rejected')
      )
    )
  );
