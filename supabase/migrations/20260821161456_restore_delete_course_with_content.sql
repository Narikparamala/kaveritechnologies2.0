begin;

create or replace function public.delete_course_with_content(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_course_title text;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select p.role, c.title
    into v_user_role, v_course_title
  from public.courses c
  left join public.profiles p on p.id = v_user_id
  where c.id = p_course_id;

  if v_course_title is null then
    raise exception 'Course not found'
      using errcode = 'P0002';
  end if;

  if coalesce(v_user_role, '') <> 'super_admin'
     and not exists (
       select 1
       from public.course_faculty cf
       where cf.course_id = p_course_id
         and cf.faculty_id = v_user_id
     ) then
    raise exception 'You do not have permission to delete this course'
      using errcode = '42501';
  end if;

  delete from public.courses
  where id = p_course_id;

  if not found then
    raise exception 'Course could not be deleted'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'success', true,
    'course_id', p_course_id,
    'title', v_course_title
  );
end;
$function$;

revoke all on function public.delete_course_with_content(uuid) from public;
revoke all on function public.delete_course_with_content(uuid) from anon;
grant execute on function public.delete_course_with_content(uuid) to authenticated;

comment on function public.delete_course_with_content(uuid) is
  'Deletes a course and its cascading content for assigned faculty or super administrators.';

notify pgrst, 'reload schema';

commit;
