-- BUG-8 data fix (orphan profile purge)
--
-- Bug hunt (2026-10-21): profiles = 17 but auth.users = 16. The Users &
-- Permissions page counts profiles, so it shows "17 platform accounts" while
-- only 16 real accounts exist. handle_new_user() provisions profiles out of
-- auth users, so a profile whose auth.users row is gone is not a real user -
-- it is dead weight left behind by an auth-level deletion that skipped
-- storage cleanup.
--
-- Safe by construction:
--   * never touches rows whose auth user still exists;
--   * never touches QA accounts (they are auth users too);
--   * refuses to run inside the same statement as anything else
--     (single-purpose migration).

-- ---- Review (run first in a read-only session; SELECT included for psql) ----
-- SELECT p.id, p.email, p.full_name, p.role, p.is_active, p.created_at
-- FROM public.profiles p
-- LEFT JOIN auth.users u ON u.id = p.id
-- WHERE u.id IS NULL;

do $$
declare
  orphan_count  int;
begin
  select count(*)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
    into orphan_count;

  raise notice 'orphan-profile purge: % profile row(s) have no matching auth user', orphan_count;

  if orphan_count > 0 then
    delete from public.profiles p
    where not exists (select 1 from auth.users u where u.id = p.id);
    -- foreign keys on profiles reference cascade/set null, so dependents of the
    -- orphan (lesson_progress, enrollments, attempts) are cleaned up too.
  end if;
end $$;

-- Post-check: must be zero.
do $$
declare
  remaining int;
begin
  select count(*)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
    into remaining;

  if remaining <> 0 then
    raise exception 'orphan-profile purge post-check failed: % orphan profile(s) remain', remaining;
  end if;
end $$;
