-- Faculty announcements and communication workflow.
-- Extends the original announcements table without removing existing records.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  content text not null,
  author_id uuid references public.profiles(id) on delete set null,
  is_global boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements
  add column if not exists batch_id uuid references public.batches(id) on delete cascade,
  add column if not exists audience_type text not null default 'course',
  add column if not exists status text not null default 'published',
  add column if not exists priority text not null default 'normal',
  add column if not exists publish_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists is_pinned boolean not null default false;

update public.announcements
set audience_type = case
      when is_global then 'platform'
      when course_id is not null then 'course'
      else 'all_students'
    end,
    status = coalesce(nullif(status, ''), 'published'),
    priority = coalesce(nullif(priority, ''), 'normal'),
    publish_at = coalesce(publish_at, created_at),
    published_at = coalesce(published_at, created_at)
where audience_type = 'course'
   or publish_at is null
   or published_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_audience_type_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements add constraint announcements_audience_type_check
      check (audience_type in ('platform', 'all_students', 'course', 'batch'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_status_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements add constraint announcements_status_check
      check (status in ('draft', 'published', 'scheduled', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_priority_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements add constraint announcements_priority_check
      check (priority in ('normal', 'important', 'urgent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_target_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements add constraint announcements_target_check check (
      (audience_type = 'platform' and is_global and course_id is null and batch_id is null)
      or (audience_type = 'all_students' and not is_global and course_id is null and batch_id is null)
      or (audience_type = 'course' and not is_global and course_id is not null and batch_id is null)
      or (audience_type = 'batch' and not is_global and batch_id is not null)
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'announcements_valid_expiry_check'
      and conrelid = 'public.announcements'::regclass
  ) then
    alter table public.announcements add constraint announcements_valid_expiry_check
      check (expires_at is null or publish_at is null or expires_at > publish_at);
  end if;
end
$$;

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists idx_announcements_author_status
  on public.announcements(author_id, status);
create index if not exists idx_announcements_publish_at
  on public.announcements(publish_at desc);
create index if not exists idx_announcements_batch
  on public.announcements(batch_id) where batch_id is not null;
create index if not exists idx_announcement_reads_user
  on public.announcement_reads(user_id, read_at desc);

drop trigger if exists update_announcements_updated_at on public.announcements;
create trigger update_announcements_updated_at
  before update on public.announcements
  for each row execute function public.update_updated_at_column();

create or replace function public.can_manage_announcement_target(
  p_audience_type text,
  p_course_id uuid,
  p_batch_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin()
    or (
      public.is_faculty()
      and p_audience_type <> 'platform'
      and case
        when p_audience_type = 'all_students' then true
        when p_audience_type = 'course' then public.faculty_can_access_course(p_course_id)
        when p_audience_type = 'batch' then exists (
          select 1
          from public.batch_faculty bf
          where bf.batch_id = p_batch_id
            and bf.faculty_id = (select auth.uid())
        )
        else false
      end
    );
$$;

create or replace function public.can_view_announcement(
  p_author_id uuid,
  p_audience_type text,
  p_course_id uuid,
  p_batch_id uuid,
  p_status text,
  p_publish_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_admin()
    or p_author_id = (select auth.uid())
    or (
      p_status in ('published', 'scheduled')
      and coalesce(p_publish_at, '-infinity'::timestamptz) <= now()
      and (p_expires_at is null or p_expires_at > now())
      and case
        when p_audience_type = 'platform' then true
        when p_audience_type = 'course' then exists (
          select 1
          from public.course_enrollments ce
          where ce.course_id = p_course_id
            and ce.student_id = (select auth.uid())
            and coalesce(ce.access_status, 'active') = 'active'
        )
        when p_audience_type = 'batch' then exists (
          select 1
          from public.batch_students bs
          where bs.batch_id = p_batch_id
            and bs.student_id = (select auth.uid())
            and bs.status = 'active'
        )
        when p_audience_type = 'all_students' then exists (
          select 1
          from public.course_enrollments ce
          join public.course_faculty cf on cf.course_id = ce.course_id
          where ce.student_id = (select auth.uid())
            and cf.faculty_id = p_author_id
            and coalesce(ce.access_status, 'active') = 'active'
        ) or exists (
          select 1
          from public.batch_students bs
          join public.batch_faculty bf on bf.batch_id = bs.batch_id
          where bs.student_id = (select auth.uid())
            and bf.faculty_id = p_author_id
            and bs.status = 'active'
        )
        else false
      end
    );
$$;

revoke all on function public.can_manage_announcement_target(text, uuid, uuid) from public, anon;
revoke all on function public.can_view_announcement(uuid, text, uuid, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.can_manage_announcement_target(text, uuid, uuid) to authenticated;
grant execute on function public.can_view_announcement(uuid, text, uuid, uuid, text, timestamptz, timestamptz) to authenticated;

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

drop policy if exists announcements_select on public.announcements;
drop policy if exists announcements_select_anon on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_update on public.announcements;
drop policy if exists announcements_delete on public.announcements;
drop policy if exists announcements_read on public.announcements;
drop policy if exists announcements_create on public.announcements;
drop policy if exists announcements_edit on public.announcements;
drop policy if exists announcements_remove on public.announcements;

create policy announcements_read on public.announcements
  for select to authenticated
  using (public.can_view_announcement(
    author_id, audience_type, course_id, batch_id, status, publish_at, expires_at
  ));

create policy announcements_create on public.announcements
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_manage_announcement_target(audience_type, course_id, batch_id)
  );

create policy announcements_edit on public.announcements
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_admin())
  with check (
    (author_id = (select auth.uid()) or public.is_admin())
    and public.can_manage_announcement_target(audience_type, course_id, batch_id)
  );

create policy announcements_remove on public.announcements
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

drop policy if exists announcement_reads_self_read on public.announcement_reads;
drop policy if exists announcement_reads_self_create on public.announcement_reads;
drop policy if exists announcement_reads_self_remove on public.announcement_reads;
drop policy if exists announcement_reads_author_read on public.announcement_reads;

create policy announcement_reads_self_read on public.announcement_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy announcement_reads_author_read on public.announcement_reads
  for select to authenticated
  using (public.is_admin() or exists (
    select 1
    from public.announcements a
    where a.id = announcement_id
      and a.author_id = (select auth.uid())
  ));

create policy announcement_reads_self_create on public.announcement_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.announcements a where a.id = announcement_id
    )
  );

create policy announcement_reads_self_remove on public.announcement_reads
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, delete on public.announcement_reads to authenticated;

notify pgrst, 'reload schema';
