-- Kaveri LMS — Coding Workspace final authority hardening (forward, LOCAL only)
--
-- 1. verification_started_at: supports an atomic claim state so concurrent
--    kind=vscode requests cannot both launch runner work.
-- 2. Guard rewrite:
--      * on INSERT, canonicalize assignment_title / language / file_name /
--        max_marks from the real coding_vscode_assignments row (never trust a
--        client-supplied snapshot such as max_marks = 1000000);
--      * verified_* + verification_started_at are SERVICE-RUNNER-ONLY: any
--        non-service client (including faculty/admin) is blocked from setting
--        them on INSERT and must preserve the old server values on UPDATE;
--      * staff keep full authority over teacher review fields.
-- 3. claim_vscode_submission_verification(p_submission_id, p_student_id):
--    SECURITY DEFINER, service_role-only, serializes claims with FOR UPDATE.

alter table public.coding_vscode_submissions
  add column if not exists verification_started_at timestamp with time zone;

-- ---------------------------------------------------------------------------
-- Guard (replaces 20260905230000_coding_vscode_secure_grading.sql version)
-- ---------------------------------------------------------------------------
create or replace function public.coding_vscode_submissions_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_title text;
  v_language text;
  v_file_name text;
  v_marks numeric(8,2);
begin
  -- 1) Canonicalize the authoritative assignment snapshot on INSERT. The real
  --    assignment identified by assignment_key is the only trusted source for
  --    title / language / file_name / max_marks.
  if (tg_op = 'INSERT') then
    select a.title, a.language, a.file_name, a.marks
      into v_title, v_language, v_file_name, v_marks
      from public.coding_vscode_assignments a
     where a.assignment_key = new.assignment_key
     order by a.created_at asc
     limit 1;
    if (found) then
      new.assignment_title := v_title;
      new.language := coalesce(v_language, new.language);
      new.file_name := coalesce(v_file_name, new.file_name);
      new.max_marks := v_marks;
    end if;
  end if;

  -- 2) Verified_* fields belong to the secure runner (service_role) only.
  if (auth.role() is distinct from 'service_role') then
    if (tg_op = 'UPDATE') then
      -- Non-service writers (including staff) must preserve server values.
      new.verification_status := old.verification_status;
      new.verified_passed := old.verified_passed;
      new.verified_total := old.verified_total;
      new.verified_score := old.verified_score;
      new.verified_at := old.verified_at;
      new.verified_summary := old.verified_summary;
      new.verification_error := old.verification_error;
      new.verified_result := old.verified_result;
      new.verification_started_at := old.verification_started_at;
    else
      new.verification_status := null;
      new.verified_passed := null;
      new.verified_total := null;
      new.verified_score := null;
      new.verified_at := null;
      new.verified_summary := null;
      new.verification_error := null;
      new.verified_result := null;
      new.verification_started_at := null;
    end if;

    -- 3) Teacher-owned review fields: staff only (students never reach UPDATE
    --    thanks to RLS; the guard is defense in depth).
    if (not public.is_kaveri_staff()) then
      new.teacher_score := null;
      new.teacher_feedback := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_status := 'unreviewed';
      if (tg_op = 'INSERT') then
        new.status := 'submitted';
        new.submitted_at := now();
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists coding_vscode_submissions_guard_trigger
  on public.coding_vscode_submissions;

create trigger coding_vscode_submissions_guard_trigger
  before insert or update on public.coding_vscode_submissions
  for each row execute function public.coding_vscode_submissions_guard();

-- ---------------------------------------------------------------------------
-- Atomic verification claim (service_role only)
-- ---------------------------------------------------------------------------
-- State machine: null/error -> pending -> verified | error
-- A crashed runner leaves a stale 'pending'; a claim older than 5 minutes is
-- reclaimable so a submission is never permanently locked.
create or replace function public.claim_vscode_submission_verification(
  p_submission_id uuid,
  p_student_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.coding_vscode_submissions%rowtype;
  v_out jsonb;
begin
  select *
    into v_submission
    from public.coding_vscode_submissions
   where id = p_submission_id
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_submission.student_id is distinct from p_student_id then
    return jsonb_build_object('result', 'forbidden');
  end if;

  if v_submission.verification_status = 'verified' then
    return jsonb_build_object(
      'result', 'verified',
      'verified_passed', v_submission.verified_passed,
      'verified_total', v_submission.verified_total,
      'verified_score', v_submission.verified_score,
      'verified_summary', v_submission.verified_summary
    );
  end if;

  if v_submission.verification_status = 'pending' then
    -- Stale claim from a crashed invocation may be reclaimed.
    if v_submission.verification_started_at is null
       or v_submission.verification_started_at < now() - interval '5 minutes' then
      update public.coding_vscode_submissions
         set verification_started_at = now()
       where id = p_submission_id;
      return jsonb_build_object('result', 'claimed');
    end if;
    return jsonb_build_object('result', 'in_progress');
  end if;

  -- null or 'error' -> claim for this invocation.
  update public.coding_vscode_submissions
     set verification_status = 'pending',
         verification_started_at = now(),
         verification_error = null
   where id = p_submission_id;
  return jsonb_build_object('result', 'claimed');
end;
$$;

revoke execute on function public.claim_vscode_submission_verification(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.claim_vscode_submission_verification(uuid, uuid)
  to service_role;
