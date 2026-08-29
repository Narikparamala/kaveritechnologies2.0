drop policy if exists qp_question_bank_select on public.qp_question_bank;
create policy qp_question_bank_select on public.qp_question_bank for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or approval_status='approved' or created_by=auth.uid())
);
drop policy if exists qp_question_bank_update on public.qp_question_bank;
create policy qp_question_bank_update on public.qp_question_bank for update to authenticated using (
  public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or (created_by=auth.uid() and approval_status='draft'))
) with check (
  public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or created_by=auth.uid())
);
drop policy if exists qp_question_bank_delete on public.qp_question_bank;
create policy qp_question_bank_delete on public.qp_question_bank for delete to authenticated using (
  public.qp_is_active_faculty_or_admin() and public.qp_is_super_admin() and approval_status='draft'
);

drop policy if exists qp_question_embeddings_select on public.qp_question_embeddings;
create policy qp_question_embeddings_select on public.qp_question_embeddings for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (
    select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (public.qp_is_super_admin() or qb.approval_status='approved' or qb.created_by=auth.uid())
  )
);
drop policy if exists qp_question_embeddings_insert on public.qp_question_embeddings;
create policy qp_question_embeddings_insert on public.qp_question_embeddings for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and (
    public.qp_is_super_admin() or exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and qb.created_by=auth.uid() and qb.approval_status='draft')
  )
);
drop policy if exists qp_question_embeddings_update on public.qp_question_embeddings;
create policy qp_question_embeddings_update on public.qp_question_embeddings for update to authenticated using (
  public.qp_is_active_faculty_or_admin() and (
    public.qp_is_super_admin() or exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and qb.created_by=auth.uid() and qb.approval_status='draft')
  )
) with check (
  public.qp_is_active_faculty_or_admin() and (
    public.qp_is_super_admin() or exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and qb.created_by=auth.uid() and qb.approval_status='draft')
  )
);
drop policy if exists qp_question_embeddings_delete on public.qp_question_embeddings;
create policy qp_question_embeddings_delete on public.qp_question_embeddings for delete to authenticated using (public.qp_is_active_faculty_or_admin() and public.qp_is_super_admin());

drop policy if exists qp_papers_select on public.qp_papers;
create policy qp_papers_select on public.qp_papers for select to authenticated using (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or created_by=auth.uid()));
drop policy if exists qp_papers_update on public.qp_papers;
create policy qp_papers_update on public.qp_papers for update to authenticated using (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or created_by=auth.uid())) with check (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or created_by=auth.uid()));
drop policy if exists qp_papers_delete on public.qp_papers;
create policy qp_papers_delete on public.qp_papers for delete to authenticated using (public.qp_is_active_faculty_or_admin() and public.qp_is_super_admin());

drop policy if exists qp_sets_select on public.qp_sets;
create policy qp_sets_select on public.qp_sets for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_sets_insert on public.qp_sets;
create policy qp_sets_insert on public.qp_sets for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_sets_update on public.qp_sets;
create policy qp_sets_update on public.qp_sets for update to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
) with check (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_sets_delete on public.qp_sets;
create policy qp_sets_delete on public.qp_sets for delete to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);

drop policy if exists qp_paper_questions_select on public.qp_paper_questions;
create policy qp_paper_questions_select on public.qp_paper_questions for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=set_id and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_paper_questions_insert on public.qp_paper_questions;
create policy qp_paper_questions_insert on public.qp_paper_questions for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=set_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_paper_questions_update on public.qp_paper_questions;
create policy qp_paper_questions_update on public.qp_paper_questions for update to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=set_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
) with check (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=set_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_paper_questions_delete on public.qp_paper_questions;
create policy qp_paper_questions_delete on public.qp_paper_questions for delete to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_sets s join public.qp_papers p on p.id=s.paper_id where s.id=set_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);

drop policy if exists qp_question_assets_select on public.qp_question_assets;
create policy qp_question_assets_select on public.qp_question_assets for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and (
    public.qp_is_super_admin()
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (qb.approval_status='approved' or qb.created_by=auth.uid())))
    or (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id=pq.set_id join public.qp_papers p on p.id=s.paper_id where pq.id=paper_question_id and p.created_by=auth.uid()))
  )
);
drop policy if exists qp_question_assets_insert on public.qp_question_assets;
create policy qp_question_assets_insert on public.qp_question_assets for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and created_by=auth.uid() and (
    (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id=pq.set_id join public.qp_papers p on p.id=s.paper_id where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
  )
);
drop policy if exists qp_question_assets_update on public.qp_question_assets;
create policy qp_question_assets_update on public.qp_question_assets for update to authenticated using (
  public.qp_is_active_faculty_or_admin() and (
    (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id=pq.set_id join public.qp_papers p on p.id=s.paper_id where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
  )
) with check (
  public.qp_is_active_faculty_or_admin() and (
    (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id=pq.set_id join public.qp_papers p on p.id=s.paper_id where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
  )
);
drop policy if exists qp_question_assets_delete on public.qp_question_assets;
create policy qp_question_assets_delete on public.qp_question_assets for delete to authenticated using (
  public.qp_is_active_faculty_or_admin() and (
    (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id=pq.set_id join public.qp_papers p on p.id=s.paper_id where pq.id=paper_question_id and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id=question_bank_id and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
  )
);

drop policy if exists qp_paper_versions_select on public.qp_paper_versions;
create policy qp_paper_versions_select on public.qp_paper_versions for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and exists (select 1 from public.qp_papers p where p.id=paper_id and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);
drop policy if exists qp_paper_versions_insert on public.qp_paper_versions;

drop policy if exists qp_print_history_select on public.qp_print_history;
create policy qp_print_history_select on public.qp_print_history for select to authenticated using (
  public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or exists (select 1 from public.qp_papers p where p.id=paper_id and p.created_by=auth.uid()))
);
drop policy if exists qp_print_history_insert on public.qp_print_history;
create policy qp_print_history_insert on public.qp_print_history for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and performed_by=auth.uid() and exists (select 1 from public.qp_papers p where p.id=paper_id and (public.qp_is_super_admin() or p.created_by=auth.uid()))
);

drop policy if exists qp_ai_settings_select on public.qp_ai_settings;
create policy qp_ai_settings_select on public.qp_ai_settings for select to authenticated using (public.qp_is_active_faculty_or_admin());

drop policy if exists qp_ai_generations_select on public.qp_ai_generations;
create policy qp_ai_generations_select on public.qp_ai_generations for select to authenticated using (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or requested_by=auth.uid()));
drop policy if exists qp_ai_generations_update on public.qp_ai_generations;
create policy qp_ai_generations_update on public.qp_ai_generations for update to authenticated using (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or requested_by=auth.uid())) with check (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or requested_by=auth.uid()));
drop policy if exists qp_ai_generations_delete on public.qp_ai_generations;
create policy qp_ai_generations_delete on public.qp_ai_generations for delete to authenticated using (public.qp_is_active_faculty_or_admin() and public.qp_is_super_admin());

drop policy if exists qp_ai_feedback_select on public.qp_ai_feedback;
create policy qp_ai_feedback_select on public.qp_ai_feedback for select to authenticated using (public.qp_is_active_faculty_or_admin() and (public.qp_is_super_admin() or created_by=auth.uid()));
drop policy if exists qp_ai_feedback_insert on public.qp_ai_feedback;
create policy qp_ai_feedback_insert on public.qp_ai_feedback for insert to authenticated with check (
  public.qp_is_active_faculty_or_admin() and created_by=auth.uid() and exists (select 1 from public.qp_ai_generations g where g.id=generation_id and g.requested_by=auth.uid())
);;
