begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  is_read boolean not null default false,
  read_at timestamptz,
  reference_id uuid,
  reference_type text,
  action_url text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists action_url text,
  add column if not exists archived_at timestamptz;

update public.notifications
set is_read = false
where is_read is null;

alter table public.notifications
  alter column is_read set default false,
  alter column is_read set not null;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'info',
      'success',
      'warning',
      'error',
      'assignment',
      'announcement',
      'grade',
      'submission',
      'quiz',
      'project',
      'live_class',
      'student',
      'support'
    )
  );

alter table public.notifications
  drop constraint if exists notifications_action_url_internal_check;

alter table public.notifications
  add constraint notifications_action_url_internal_check
  check (action_url is null or action_url like '/%');

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false and archived_at is null;

create or replace function public.set_notification_read_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at := coalesce(new.read_at, now());
  elsif new.is_read = false then
    new.read_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_notification_read_at_trigger
  on public.notifications;

create trigger set_notification_read_at_trigger
before update of is_read on public.notifications
for each row
execute function public.set_notification_read_at();

update public.notifications
set read_at = coalesce(read_at, created_at)
where is_read = true and read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own
  on public.notifications;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_update_own
  on public.notifications;

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists notifications_delete_own
  on public.notifications;

create policy notifications_delete_own
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_insert_authorized
  on public.notifications;

create policy notifications_insert_authorized
on public.notifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role in ('faculty', 'admin', 'super_admin')
  )
);

grant select, insert, update, delete
on public.notifications
to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime
      add table public.notifications;
  end if;
end;
$$;

comment on table public.notifications is
  'Persistent in-app notifications for students, faculty and administrators.';

commit;
