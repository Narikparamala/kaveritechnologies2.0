begin;

-- New OAuth and password accounts are provisioned only by handle_new_user().
-- Browsers must never insert profile identities themselves.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_active on public.profiles;
drop policy if exists profiles_update_self_active on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_own_anon on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
drop policy if exists preview_profiles on public.profiles;

-- An inactive account may read only its own profile so the application can
-- display the disabled-account state. Active accounts retain current LMS
-- profile visibility required by faculty lists, leaderboards and admin pages.
-- Check the current account without recursively invoking profiles RLS.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (
            select profile.is_active
            from public.profiles profile
            where profile.id = (select auth.uid())
        ),
        false
    );
$$;

revoke all on function public.is_active_user() from public;

grant execute on function public.is_active_user()
to authenticated;

-- All privileged LMS helpers must also reject suspended staff accounts.
create or replace function public.is_kaveri_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('faculty', 'super_admin')
      and profile.is_active = true
  );
$$;

revoke all on function public.is_kaveri_staff() from public;
grant execute on function public.is_kaveri_staff() to authenticated;

create policy profiles_select_active
on public.profiles
for select
to authenticated
using (
    id = (select auth.uid())
    or public.is_active_user()
);
-- Normal users may update only their own row while active.
-- The authorization-field trigger below protects sensitive columns.
create policy profiles_update_self_active
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  and is_active = true
)
with check (
  id = (select auth.uid())
  and is_active = true
);

-- Keep the trigger as the final database boundary even if policies change.
create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot be changed.'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active then
    if not public.is_admin() then
      raise exception 'Only an active Super Admin may change profile authorization fields.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_authorization_fields
  on public.profiles;

create trigger trg_protect_profile_authorization_fields
before update on public.profiles
for each row
execute function public.protect_profile_authorization_fields();

-- Centralized, auditable role assignment.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may assign roles.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Target user is required.'
      using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'A Super Admin cannot change their own role.'
      using errcode = '42501';
  end if;

  if p_role not in ('student', 'faculty', 'super_admin') then
    raise exception 'Invalid user role.'
      using errcode = '22023';
  end if;

  select role
  into previous_role
  from public.profiles
  where id = p_user_id
  for update;

  if previous_role is null then
    raise exception 'Profile not found.'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if p_role = 'faculty' then
    insert into public.faculty_employment (
      faculty_id,
      employment_status
    )
    values (
      p_user_id,
      'active'
    )
    on conflict (faculty_id) do update
    set employment_status = 'active',
        updated_at = now();
  elsif previous_role = 'faculty' then
    update public.faculty_employment
    set employment_status = 'inactive',
        updated_at = now()
    where faculty_id = p_user_id;
  end if;

  return updated_profile;
end;
$$;

-- Centralized activation and suspension.
create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may change account status.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_is_active is null then
    raise exception 'Target user and account status are required.'
      using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) and not p_is_active then
    raise exception 'A Super Admin cannot deactivate their own account.'
      using errcode = '42501';
  end if;

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found.'
      using errcode = 'P0002';
  end if;

  return updated_profile;
end;
$$;

-- Remove unnecessary browser privileges.
revoke all on table public.profiles from anon;
revoke insert, delete, truncate, references, trigger
  on table public.profiles from authenticated;

grant select, update
  on table public.profiles to authenticated;

revoke all on function public.admin_set_user_role(uuid, text) from public;
revoke all on function public.admin_set_user_active(uuid, boolean) from public;

grant execute on function public.admin_set_user_role(uuid, text)
  to authenticated;

grant execute on function public.admin_set_user_active(uuid, boolean)
  to authenticated;

commit;
