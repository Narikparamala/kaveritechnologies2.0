begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
      and p.is_active = true
  );
$$;

create or replace function public.is_faculty()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('faculty', 'super_admin')
      and p.is_active = true
  );
$$;

create or replace function public.faculty_can_access_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or (
      public.is_faculty()
      and exists (
        select 1
        from public.course_faculty cf
        where cf.course_id = p_course_id
          and cf.faculty_id = (select auth.uid())
      )
    );
$$;

create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed.';
  end if;

  if new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active then
    if not public.is_admin() then
      raise exception 'Only an active Super Admin may change profile authorization fields.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_authorization_fields on public.profiles;
create trigger trg_protect_profile_authorization_fields
  before update on public.profiles
  for each row execute function public.protect_profile_authorization_fields();

alter table public.profiles enable row level security;

drop policy if exists preview_profiles on public.profiles;
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

create policy profiles_select_authenticated
on public.profiles for select
to authenticated
using (true);

create policy profiles_update_self
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_update_admin
on public.profiles for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy profiles_delete_admin
on public.profiles for delete
to authenticated
using ((select public.is_admin()));

revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;

alter table public.courses enable row level security;

drop policy if exists preview_courses on public.courses;
drop policy if exists courses_public_select on public.courses;
drop policy if exists courses_authenticated_select on public.courses;
drop policy if exists courses_insert_hardened on public.courses;
drop policy if exists courses_update_hardened on public.courses;
drop policy if exists courses_delete_hardened on public.courses;

create policy courses_public_select
on public.courses for select
to anon
using (is_published = true);

create policy courses_authenticated_select
on public.courses for select
to authenticated
using (true);

create policy courses_insert_hardened
on public.courses for insert
to authenticated
with check ((select public.is_admin()));

create policy courses_update_hardened
on public.courses for update
to authenticated
using ((select public.is_admin()) or public.faculty_can_access_course(id))
with check ((select public.is_admin()) or public.faculty_can_access_course(id));

create policy courses_delete_hardened
on public.courses for delete
to authenticated
using ((select public.is_admin()) or public.faculty_can_access_course(id));

revoke insert, update, delete, truncate on table public.courses from anon;
grant select on table public.courses to anon;
grant select, insert, update, delete on table public.courses to authenticated;

alter table public.course_faculty enable row level security;

drop policy if exists preview_course_faculty on public.course_faculty;
drop policy if exists course_faculty_select_authenticated on public.course_faculty;
drop policy if exists course_faculty_insert_admin on public.course_faculty;
drop policy if exists course_faculty_update_admin on public.course_faculty;
drop policy if exists course_faculty_delete_admin on public.course_faculty;

create policy course_faculty_select_authenticated
on public.course_faculty for select
to authenticated
using (true);

create policy course_faculty_insert_admin
on public.course_faculty for insert
to authenticated
with check ((select public.is_admin()));

create policy course_faculty_update_admin
on public.course_faculty for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy course_faculty_delete_admin
on public.course_faculty for delete
to authenticated
using ((select public.is_admin()));

revoke all on table public.course_faculty from anon;
grant select, insert, update, delete on table public.course_faculty to authenticated;

revoke all on function public.protect_profile_authorization_fields() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_faculty() from public;
revoke all on function public.faculty_can_access_course(uuid) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_faculty() to authenticated;
grant execute on function public.faculty_can_access_course(uuid) to authenticated;

commit;;
