-- Restore the faculty course-creation RPC expected by the React application.
-- This migration keeps authorization in the database: only faculty and
-- super_admin profiles can create courses.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Required table public.profiles is missing';
  end if;

  if to_regclass('public.courses') is null then
    raise exception 'Required table public.courses is missing';
  end if;

  if to_regclass('public.course_faculty') is null then
    raise exception 'Required table public.course_faculty is missing';
  end if;
end;
$$;

alter table public.courses
  add column if not exists language text not null default 'English';

create or replace function public.create_faculty_course(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_course_id uuid;
  v_title text := nullif(trim(p_payload->>'title'), '');
  v_slug text := nullif(trim(p_payload->>'slug'), '');
  v_short_desc text := nullif(trim(p_payload->>'short_description'), '');
  v_desc text := nullif(trim(p_payload->>'description'), '');
  v_thumb text := nullif(trim(p_payload->>'thumbnail_url'), '');
  v_difficulty text := coalesce(nullif(trim(p_payload->>'difficulty'), ''), 'beginner');
  v_category text := coalesce(nullif(trim(p_payload->>'category'), ''), 'python');
  v_language text := coalesce(nullif(trim(p_payload->>'language'), ''), 'English');
  v_duration integer := coalesce(nullif(p_payload->>'duration_hours', '')::integer, 0);
  v_is_published boolean := coalesce(nullif(p_payload->>'is_published', '')::boolean, false);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
    into v_role
  from public.profiles as p
  where p.id = v_user_id;

  if v_role is null then
    raise exception 'Profile not found';
  end if;

  if v_role not in ('faculty', 'super_admin') then
    raise exception 'Only faculty or admin can create courses';
  end if;

  -- Faculty-created courses always begin as drafts.
  if v_role = 'faculty' then
    v_is_published := false;
  end if;

  if v_title is null then
    raise exception 'Title is required';
  end if;

  if v_slug is null then
    raise exception 'Slug is required';
  end if;

  insert into public.courses (
    title,
    slug,
    short_description,
    description,
    thumbnail_url,
    difficulty,
    category,
    language,
    duration_hours,
    is_published,
    is_featured,
    created_by
  ) values (
    v_title,
    v_slug,
    v_short_desc,
    v_desc,
    v_thumb,
    v_difficulty,
    v_category,
    v_language,
    v_duration,
    v_is_published,
    false,
    v_user_id
  )
  returning id into v_course_id;

  insert into public.course_faculty (course_id, faculty_id)
  values (v_course_id, v_user_id)
  on conflict (course_id, faculty_id) do nothing;

  return jsonb_build_object(
    'id', v_course_id,
    'title', v_title,
    'slug', v_slug,
    'created_by', v_user_id,
    'is_published', v_is_published
  );
end;
$function$;

revoke execute on function public.create_faculty_course(jsonb) from public;
revoke execute on function public.create_faculty_course(jsonb) from anon;
grant execute on function public.create_faculty_course(jsonb) to authenticated;

notify pgrst, 'reload schema';
