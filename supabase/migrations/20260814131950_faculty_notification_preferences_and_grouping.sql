begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assignment_submission_notifications_enabled boolean not null default true,
  assignment_submission_threshold integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_submission_threshold_check
    check (assignment_submission_threshold between 1 and 10000)
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own
  on public.notification_preferences;

create policy notification_preferences_select_own
on public.notification_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_own
  on public.notification_preferences;

create policy notification_preferences_insert_own
on public.notification_preferences
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_update_own
  on public.notification_preferences;

create policy notification_preferences_update_own
on public.notification_preferences
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update
on public.notification_preferences
to authenticated;

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_notification_preferences_updated_at_trigger
  on public.notification_preferences;

create trigger set_notification_preferences_updated_at_trigger
before update on public.notification_preferences
for each row
execute function public.set_notification_preferences_updated_at();

alter table public.notifications
  add column if not exists aggregation_key text,
  add column if not exists event_count integer not null default 1,
  add column if not exists last_event_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notifications
  drop constraint if exists notifications_event_count_check;

alter table public.notifications
  add constraint notifications_event_count_check
  check (event_count >= 1);

create unique index if not exists notifications_user_aggregation_key_unique
  on public.notifications (user_id, aggregation_key)
  where aggregation_key is not null;

create index if not exists notifications_user_last_event_idx
  on public.notifications (user_id, last_event_at desc);

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.group_assignment_submission_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  assignment_title text;
  assignment_course_id uuid;
  notifications_enabled boolean;
  notification_threshold integer;
  aggregation_key_value text;
begin
  if new.status::text is distinct from 'submitted' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status::text is not distinct from 'submitted' then
      return new;
    end if;
  end if;

  select assignment.title, assignment.course_id
  into assignment_title, assignment_course_id
  from public.assignments as assignment
  where assignment.id = new.assignment_id;

  if assignment_course_id is null then
    return new;
  end if;

  aggregation_key_value := 'assignment-submissions:' || new.assignment_id::text;

  for recipient in
    select distinct recipients.user_id
    from (
      select course_faculty.faculty_id as user_id
      from public.course_faculty
      where course_faculty.course_id = assignment_course_id

      union

      select assignment.created_by as user_id
      from public.assignments as assignment
      where assignment.id = new.assignment_id
    ) as recipients
    where recipients.user_id is not null
  loop
    select
      coalesce(
        (
          select preference.assignment_submission_notifications_enabled
          from public.notification_preferences as preference
          where preference.user_id = recipient.user_id
        ),
        true
      ),
      coalesce(
        (
          select preference.assignment_submission_threshold
          from public.notification_preferences as preference
          where preference.user_id = recipient.user_id
        ),
        50
      )
    into notifications_enabled, notification_threshold;

    if notifications_enabled then
      insert into public.notifications (
        user_id,
        title,
        message,
        type,
        is_read,
        read_at,
        reference_id,
        reference_type,
        action_url,
        archived_at,
        aggregation_key,
        event_count,
        last_event_at,
        metadata,
        created_at
      )
      values (
        recipient.user_id,
        format('1 submission · %s', coalesce(assignment_title, 'Assignment')),
        case
          when notification_threshold = 1 then
            format('1 student submitted “%s”. Your 1-submission alert milestone was reached.', coalesce(assignment_title, 'Assignment'))
          else
            format('1 student submitted “%s”. The next unread alert is at %s submissions.', coalesce(assignment_title, 'Assignment'), notification_threshold)
        end,
        'submission',
        false,
        null,
        new.assignment_id,
        'assignment',
        '/faculty/submissions?assignment=' || new.assignment_id::text,
        null,
        aggregation_key_value,
        1,
        now(),
        jsonb_build_object(
          'assignment_id', new.assignment_id,
          'assignment_title', coalesce(assignment_title, 'Assignment'),
          'course_id', assignment_course_id
        ),
        now()
      )
      on conflict (user_id, aggregation_key)
        where aggregation_key is not null
      do update
      set
        event_count = public.notifications.event_count + 1,
        last_event_at = now(),
        created_at = now(),
        title = format(
          '%s submissions · %s',
          public.notifications.event_count + 1,
          coalesce(assignment_title, 'Assignment')
        ),
        message = case
          when mod(public.notifications.event_count + 1, notification_threshold) = 0 then
            format(
              '%s students submitted “%s”. Your %s-submission alert milestone was reached.',
              public.notifications.event_count + 1,
              coalesce(assignment_title, 'Assignment'),
              public.notifications.event_count + 1
            )
          else
            format(
              '%s students submitted “%s”. The next unread alert is at %s submissions.',
              public.notifications.event_count + 1,
              coalesce(assignment_title, 'Assignment'),
              ((public.notifications.event_count + 1) / notification_threshold + 1) * notification_threshold
            )
        end,
        is_read = case
          when mod(public.notifications.event_count + 1, notification_threshold) = 0 then false
          else public.notifications.is_read
        end,
        read_at = case
          when mod(public.notifications.event_count + 1, notification_threshold) = 0 then null
          else public.notifications.read_at
        end,
        archived_at = case
          when mod(public.notifications.event_count + 1, notification_threshold) = 0 then null
          else public.notifications.archived_at
        end,
        metadata = excluded.metadata;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.group_assignment_submission_notification()
from public, anon, authenticated;

drop trigger if exists group_assignment_submission_notification_trigger
  on public.assignment_submissions;

create trigger group_assignment_submission_notification_trigger
after insert or update of status
on public.assignment_submissions
for each row
execute function private.group_assignment_submission_notification();

comment on table public.notification_preferences is
  'Per-user controls for grouped high-volume notification streams.';

comment on column public.notifications.aggregation_key is
  'Stable key used to update one grouped notification instead of inserting one row per event.';

commit;
