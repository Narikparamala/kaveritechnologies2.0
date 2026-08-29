-- Keep the real submission workflow while allowing Super Admins to exercise it
-- as authenticated product testers without requiring a fake course enrollment.

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
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_project
  from public.projects
  where id = p_project_id and is_published = true;
  if not found then raise exception 'Project is not available'; end if;

  if v_project.course_id is not null
     and not public.is_admin()
     and not exists (
       select 1 from public.course_enrollments ce
       where ce.course_id = v_project.course_id
         and ce.student_id = v_user_id
         and coalesce(ce.access_status, 'active') = 'active'
     )
  then
    raise exception 'You are not enrolled in this project course';
  end if;

  select * into v_submission
  from public.project_submissions
  where project_id = p_project_id and student_id = v_user_id;

  if found and v_submission.status = 'approved' then raise exception 'Approved submissions cannot be changed'; end if;
  if found and v_submission.status = 'submitted' then raise exception 'This project is awaiting faculty review'; end if;
  if length(coalesce(p_description, '')) > 10000 then raise exception 'Implementation notes cannot exceed 10000 characters'; end if;
  if length(coalesce(p_github_url, '')) > 2048
     or length(coalesce(p_live_url, '')) > 2048
     or length(coalesce(p_external_url, '')) > 2048
  then raise exception 'A submitted URL is too long'; end if;

  if nullif(trim(coalesce(p_github_url, '')), '') is not null
     and trim(p_github_url) !~* '^https://(www\.)?github\.com/'
  then raise exception 'Enter a valid GitHub repository URL'; end if;
  if nullif(trim(coalesce(p_live_url, '')), '') is not null
     and trim(p_live_url) !~* '^https?://'
  then raise exception 'Enter a valid live demo URL'; end if;
  if nullif(trim(coalesce(p_external_url, '')), '') is not null
     and trim(p_external_url) !~* '^https?://'
  then raise exception 'Enter a valid external project URL'; end if;

  if p_submit then
    if v_project.due_at is not null and now() > v_project.due_at and not v_project.allow_late_submissions
    then raise exception 'The project deadline has passed'; end if;
    if (v_project.repository_required or v_project.submission_mode in ('github', 'github_and_live'))
       and nullif(trim(coalesce(p_github_url, '')), '') is null
    then raise exception 'A GitHub repository URL is required'; end if;
    if (v_project.live_demo_required or v_project.submission_mode = 'github_and_live')
       and nullif(trim(coalesce(p_live_url, '')), '') is null
    then raise exception 'A live demo URL is required'; end if;
    if v_project.submission_mode = 'external_url'
       and nullif(trim(coalesce(p_external_url, '')), '') is null
    then raise exception 'An external project URL is required'; end if;
  end if;

  perform set_config('app.project_submission_rpc', '1', true);

  insert into public.project_submissions (
    project_id, student_id, github_url, live_url, external_url, description,
    status, submitted_at, feedback, score, reviewed_by, reviewed_at
  ) values (
    p_project_id, v_user_id,
    nullif(trim(coalesce(p_github_url, '')), ''),
    nullif(trim(coalesce(p_live_url, '')), ''),
    nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    case when p_submit then 'submitted' else 'draft' end,
    case when p_submit then now() else null end,
    null, null, null, null
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

revoke all on function public.save_project_submission(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.save_project_submission(uuid, text, text, text, text, boolean) to authenticated;
