-- ============================================================================
-- KAVERI LMS — FINAL AUTHORITY PARITY
-- ----------------------------------------------------------------------------
-- Tightens the lesson-bound activity gate exemption in
-- student_activity_unlocked().  Previously, a child activity of a LOCKED
-- lesson stayed reachable whenever ANY published lesson in the same course
-- required it.  That let a future lesson's gate open a child activity whose
-- own parent lesson was still locked.
--
-- Required contract:
--   * course-level activity (lesson_id NULL) -> enrollment/gate rules as today
--   * parent lesson available/completed        -> activity usable
--   * parent lesson locked                     -> activity locked, EXCEPT when
--     the LOCKED PARENT LESSON ITSELF requires this exact activity (the
--     circular gate: the activity is the key that unlocks its own lesson).
--
-- This mirrors RoadmapPage.isGateActivity(), which already treats only the
-- current lesson's required activity as the gate exception.
-- ============================================================================
create or replace function public.student_activity_unlocked(
  p_lesson_id uuid,
  p_activity_type text,
  p_activity_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_access text;
begin
  if v_uid is null then
    return false;
  end if;

  -- Course-level activity: not bound to a lesson, so enrollment/gates govern.
  if p_lesson_id is null then
    return true;
  end if;

  v_access := public.student_lesson_access(p_lesson_id);
  if v_access in ('available', 'completed') then
    return true;
  end if;

  -- Parent lesson is locked.  The ONLY exception is the circular gate: this
  -- exact activity is the required gate of the SAME parent lesson, so the
  -- student can satisfy it and unlock that lesson.  A future lesson in the
  -- course referencing the activity grants nothing.
  return exists (
    select 1
    from public.lessons l
    where l.id = p_lesson_id
      and l.requires_activity_type = p_activity_type
      and l.requires_activity_id = p_activity_id
  );
end;
$$;
