create policy qp_sets_update on public.qp_sets for update to authenticated using (
  exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_sets_delete on public.qp_sets for delete to authenticated using (
  exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);

alter table public.qp_paper_questions enable row level security;
create policy qp_paper_questions_select on public.qp_paper_questions for select to authenticated using (
  exists (select 1 from public.qp_sets s join public.qp_papers p on p.id = s.paper_id where s.id = set_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_paper_questions_insert on public.qp_paper_questions for insert to authenticated with check (
  exists (select 1 from public.qp_sets s join public.qp_papers p on p.id = s.paper_id where s.id = set_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_paper_questions_update on public.qp_paper_questions for update to authenticated using (
  exists (select 1 from public.qp_sets s join public.qp_papers p on p.id = s.paper_id where s.id = set_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_paper_questions_delete on public.qp_paper_questions for delete to authenticated using (
  exists (select 1 from public.qp_sets s join public.qp_papers p on p.id = s.paper_id where s.id = set_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);

alter table public.qp_question_assets enable row level security;
create policy qp_question_assets_select on public.qp_question_assets for select to authenticated using (
  public.qp_is_super_admin()
  or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id = question_bank_id and (qb.approval_status = 'approved' or qb.created_by = auth.uid())))
  or (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id = pq.set_id join public.qp_papers p on p.id = s.paper_id where pq.id = paper_question_id and p.created_by = auth.uid()))
);
create policy qp_question_assets_insert on public.qp_question_assets for insert to authenticated with check (
  created_by = auth.uid() and (
    public.qp_is_super_admin()
    or (question_bank_id is not null and exists (select 1 from public.qp_question_bank qb where qb.id = question_bank_id and qb.created_by = auth.uid()))
    or (paper_question_id is not null and exists (select 1 from public.qp_paper_questions pq join public.qp_sets s on s.id = pq.set_id join public.qp_papers p on p.id = s.paper_id where pq.id = paper_question_id and p.created_by = auth.uid()))
  )
);
create policy qp_question_assets_update on public.qp_question_assets for update to authenticated using (public.qp_is_super_admin() or created_by = auth.uid());
create policy qp_question_assets_delete on public.qp_question_assets for delete to authenticated using (public.qp_is_super_admin() or created_by = auth.uid());

alter table public.qp_paper_versions enable row level security;
create policy qp_paper_versions_select on public.qp_paper_versions for select to authenticated using (
  exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_paper_versions_insert on public.qp_paper_versions for insert to authenticated with check (
  finalized_by = auth.uid() and exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);

alter table public.qp_print_history enable row level security;
create policy qp_print_history_select on public.qp_print_history for select to authenticated using (
  public.qp_is_super_admin() or exists (select 1 from public.qp_papers p where p.id = paper_id and p.created_by = auth.uid())
);
create policy qp_print_history_insert on public.qp_print_history for insert to authenticated with check (
  performed_by = auth.uid() and exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);

alter table public.qp_ai_settings enable row level security;
create policy qp_ai_settings_select on public.qp_ai_settings for select to authenticated using (public.qp_is_super_admin());
create policy qp_ai_settings_insert on public.qp_ai_settings for insert to authenticated with check (public.qp_is_super_admin());
create policy qp_ai_settings_update on public.qp_ai_settings for update to authenticated using (public.qp_is_super_admin()) with check (public.qp_is_super_admin());
create policy qp_ai_settings_delete on public.qp_ai_settings for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_ai_generations enable row level security;
create policy qp_ai_generations_select on public.qp_ai_generations for select to authenticated using (public.qp_is_super_admin() or requested_by = auth.uid());
create policy qp_ai_generations_insert on public.qp_ai_generations for insert to authenticated with check (requested_by = auth.uid() and public.qp_is_active_faculty_or_admin());
create policy qp_ai_generations_update on public.qp_ai_generations for update to authenticated using (public.qp_is_super_admin() or requested_by = auth.uid());
create policy qp_ai_generations_delete on public.qp_ai_generations for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_ai_feedback enable row level security;
create policy qp_ai_feedback_select on public.qp_ai_feedback for select to authenticated using (public.qp_is_super_admin() or created_by = auth.uid());
create policy qp_ai_feedback_insert on public.qp_ai_feedback for insert to authenticated with check (
  created_by = auth.uid() and exists (select 1 from public.qp_ai_generations g where g.id = generation_id and g.requested_by = auth.uid())
);

alter table public.qp_ai_evaluations enable row level security;
create policy qp_ai_evaluations_all on public.qp_ai_evaluations for all to authenticated using (public.qp_is_super_admin()) with check (public.qp_is_super_admin());

alter table public.qp_audit_log enable row level security;
create policy qp_audit_log_select on public.qp_audit_log for select to authenticated using (public.qp_is_super_admin());
create policy qp_audit_log_insert on public.qp_audit_log for insert to authenticated with check (performed_by = auth.uid() and public.qp_is_active_faculty_or_admin());;
