-- Append-only project review history for Super Admin oversight.

create table if not exists public.project_submission_review_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_submissions(id) on delete cascade,
  status text not null check (status in ('reviewed', 'approved', 'rejected')),
  score integer,
  feedback text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

create index if not exists project_submission_review_history_submission_idx
  on public.project_submission_review_history (submission_id, reviewed_at desc);

alter table public.project_submission_review_history enable row level security;
grant select on public.project_submission_review_history to authenticated;

drop policy if exists project_submission_review_history_admin_select
  on public.project_submission_review_history;
create policy project_submission_review_history_admin_select
  on public.project_submission_review_history
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.capture_project_submission_review_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('reviewed', 'approved', 'rejected')
     and (
       new.status is distinct from old.status
       or new.score is distinct from old.score
       or new.feedback is distinct from old.feedback
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
     )
  then
    insert into public.project_submission_review_history (
      submission_id, status, score, feedback, reviewed_by, reviewed_at
    ) values (
      new.id, new.status, new.score, new.feedback, new.reviewed_by,
      coalesce(new.reviewed_at, now())
    );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_project_submission_review_history()
  from public, anon, authenticated;

drop trigger if exists capture_project_submission_review_history
  on public.project_submissions;
create trigger capture_project_submission_review_history
  after update on public.project_submissions
  for each row execute function public.capture_project_submission_review_history();

-- Preserve the latest existing review as the first history event. This is
-- idempotent when the migration is reapplied during development.
insert into public.project_submission_review_history (
  submission_id, status, score, feedback, reviewed_by, reviewed_at
)
select ps.id, ps.status, ps.score, ps.feedback, ps.reviewed_by,
       coalesce(ps.reviewed_at, ps.updated_at, now())
from public.project_submissions ps
where ps.status in ('reviewed', 'approved', 'rejected')
  and not exists (
    select 1 from public.project_submission_review_history history
    where history.submission_id = ps.id
  );
