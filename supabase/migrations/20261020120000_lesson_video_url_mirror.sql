-- =============================================================================
-- 20261020120000 — lessons.video_url derived from the lesson's recording resource
-- =============================================================================
-- BUG the 20261018120000 banner fix exposed: faculty add recordings through the
-- Lesson Editor "Recording" tab, which creates a lesson_resources row with
-- resource_type='recorded_video' — but NEVER writes lessons.video_url (the only
-- writer is createLesson, which sets null). Result: get_student_course_plan's
-- lesson.video_url stays null while LessonContent happily renders the player
-- from the resource fallback — so the new honest banner said "Recording coming
-- soon" DIRECTLY ABOVE a working video player.
--
-- FIX (one source of truth): lessons.video_url is now DERIVED server-side.
--   primary resource = published recorded_video resource of the lesson,
--   preferring unlocked ones (is_locked asc), then lowest order_index.
--   its external_url, else file_url, is mirrored into lessons.video_url.
-- No client write path is added; a trigger keeps the mirror live for
-- faculty adds / deletes / lock toggles / publish flips.
-- Idempotent: CREATE OR REPLACE + backfill UPDATE (convergent).
-- =============================================================================

create or replace function public.sync_lesson_video_url()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id uuid := coalesce(new.lesson_id, old.lesson_id);
  v_url text;
begin
  select coalesce(r.external_url, r.file_url) into v_url
  from public.lesson_resources r
  where r.lesson_id = v_lesson_id
    and r.resource_type = 'recorded_video'
    and r.is_published
  order by r.is_locked asc, r.order_index asc, r.created_at asc
  limit 1;

  if v_url is not null then
    update public.lessons
    set video_url = v_url
    where id = v_lesson_id and video_url is distinct from v_url;
  else
    -- No UNLOCKED published recording left. But wait: LessonContent also plays
    -- locked recordings only through SecureResourceCard gating... it does not —
    -- recorded_video resources render through the raw video pipeline, so a
    -- locked recording must NOT leak into video_url. Clear it.
    update public.lessons
    set video_url = null
    where id = v_lesson_id and video_url is not null;
  end if;

  return null;
end;
$$;

-- Re-sync on any change to a recorded_video resource (urls, publish, lock),
-- or on rows changing lesson (move lesson etc.). Cheap guard: only fires the
-- recompute when recorded_video rows are involved; non-video material edits
-- hit the trigger but select nothing.
drop trigger if exists trg_sync_lesson_video_url_ins on public.lesson_resources;
create trigger trg_sync_lesson_video_url_ins
after insert on public.lesson_resources
for each row
when (new.resource_type = 'recorded_video')
execute function public.sync_lesson_video_url();

drop trigger if exists trg_sync_lesson_video_url_upd on public.lesson_resources;
create trigger trg_sync_lesson_video_url_upd
after update on public.lesson_resources
for each row
when (new.resource_type = 'recorded_video'
      or old.resource_type = 'recorded_video')
execute function public.sync_lesson_video_url();

drop trigger if exists trg_sync_lesson_video_url_del on public.lesson_resources;
create trigger trg_sync_lesson_video_url_del
after delete on public.lesson_resources
for each row
when (old.resource_type = 'recorded_video')
execute function public.sync_lesson_video_url();

-- Backfill: derive video_url for every lesson that already has recordings
-- (this is what makes the Python Programming course courses correct the
-- moment this migration lands, without any faculty action).
update public.lessons l
set video_url = coalesce(p.external_url, p.file_url)
from (
  select distinct on (r.lesson_id)
    r.lesson_id, r.external_url, r.file_url
  from public.lesson_resources r
  where r.resource_type = 'recorded_video'
    and r.is_published
  order by r.lesson_id, r.is_locked asc, r.order_index asc, r.created_at asc
) p
where p.lesson_id = l.id
  and l.video_url is distinct from coalesce(p.external_url, p.file_url);

-- And clear video_url for lessons whose only recordings are locked or gone.
update public.lessons l
set video_url = null
where l.video_url is not null
  and not exists (
    select 1 from public.lesson_resources r
    where r.lesson_id = l.id
      and r.resource_type = 'recorded_video'
      and r.is_published
      and r.is_locked is not true
  );
