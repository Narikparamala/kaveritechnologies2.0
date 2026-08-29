drop policy if exists qp_question_assets_update on public.qp_question_assets;
drop policy if exists qp_question_assets_delete on public.qp_question_assets;

create policy qp_question_assets_update on public.qp_question_assets
for update to authenticated
using (
  (paper_question_id is not null and exists (
    select 1 from public.qp_paper_questions pq
    join public.qp_sets s on s.id=pq.set_id
    join public.qp_papers p on p.id=s.paper_id
    where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())
  ))
  or
  (question_bank_id is not null and exists (
    select 1 from public.qp_question_bank qb
    where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))
  ))
)
with check (
  (paper_question_id is not null and exists (
    select 1 from public.qp_paper_questions pq
    join public.qp_sets s on s.id=pq.set_id
    join public.qp_papers p on p.id=s.paper_id
    where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())
  ))
  or
  (question_bank_id is not null and exists (
    select 1 from public.qp_question_bank qb
    where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))
  ))
);

create policy qp_question_assets_delete on public.qp_question_assets
for delete to authenticated
using (
  (paper_question_id is not null and exists (
    select 1 from public.qp_paper_questions pq
    join public.qp_sets s on s.id=pq.set_id
    join public.qp_papers p on p.id=s.paper_id
    where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())
  ))
  or
  (question_bank_id is not null and exists (
    select 1 from public.qp_question_bank qb
    where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))
  ))
);;
