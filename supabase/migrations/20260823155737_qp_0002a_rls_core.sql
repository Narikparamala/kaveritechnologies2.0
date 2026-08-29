alter table public.qp_settings enable row level security;
create policy qp_settings_select on public.qp_settings for select to authenticated using (public.qp_is_active_faculty_or_admin());
create policy qp_settings_insert on public.qp_settings for insert to authenticated with check (public.qp_is_super_admin());
create policy qp_settings_update on public.qp_settings for update to authenticated using (public.qp_is_super_admin()) with check (public.qp_is_super_admin());
create policy qp_settings_delete on public.qp_settings for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_templates enable row level security;
create policy qp_templates_select on public.qp_templates for select to authenticated using (public.qp_is_active_faculty_or_admin());
create policy qp_templates_insert on public.qp_templates for insert to authenticated with check (public.qp_is_super_admin());
create policy qp_templates_update on public.qp_templates for update to authenticated using (public.qp_is_super_admin()) with check (public.qp_is_super_admin());
create policy qp_templates_delete on public.qp_templates for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_question_bank enable row level security;
create policy qp_question_bank_select on public.qp_question_bank for select to authenticated using (public.qp_is_super_admin() or approval_status = 'approved' or created_by = auth.uid());
create policy qp_question_bank_insert on public.qp_question_bank for insert to authenticated with check (public.qp_is_active_faculty_or_admin() and created_by = auth.uid());
create policy qp_question_bank_update on public.qp_question_bank for update to authenticated using (public.qp_is_super_admin() or (created_by = auth.uid() and approval_status = 'draft')) with check (public.qp_is_super_admin() or created_by = auth.uid());
create policy qp_question_bank_delete on public.qp_question_bank for delete to authenticated using (public.qp_is_super_admin() and approval_status = 'draft');

alter table public.qp_question_embeddings enable row level security;
create policy qp_question_embeddings_select on public.qp_question_embeddings for select to authenticated using (
  exists (select 1 from public.qp_question_bank qb where qb.id = question_bank_id and (public.qp_is_super_admin() or qb.approval_status = 'approved' or qb.created_by = auth.uid()))
);
create policy qp_question_embeddings_insert on public.qp_question_embeddings for insert to authenticated with check (
  public.qp_is_super_admin() or exists (select 1 from public.qp_question_bank qb where qb.id = question_bank_id and qb.created_by = auth.uid())
);
create policy qp_question_embeddings_update on public.qp_question_embeddings for update to authenticated using (
  public.qp_is_super_admin() or exists (select 1 from public.qp_question_bank qb where qb.id = question_bank_id and qb.created_by = auth.uid())
);
create policy qp_question_embeddings_delete on public.qp_question_embeddings for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_papers enable row level security;
create policy qp_papers_select on public.qp_papers for select to authenticated using (public.qp_is_super_admin() or created_by = auth.uid());
create policy qp_papers_insert on public.qp_papers for insert to authenticated with check (public.qp_is_active_faculty_or_admin() and created_by = auth.uid());
create policy qp_papers_update on public.qp_papers for update to authenticated using (public.qp_is_super_admin() or created_by = auth.uid()) with check (public.qp_is_super_admin() or created_by = auth.uid());
create policy qp_papers_delete on public.qp_papers for delete to authenticated using (public.qp_is_super_admin());

alter table public.qp_sets enable row level security;
create policy qp_sets_select on public.qp_sets for select to authenticated using (
  exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);
create policy qp_sets_insert on public.qp_sets for insert to authenticated with check (
  exists (select 1 from public.qp_papers p where p.id = paper_id and (public.qp_is_super_admin() or p.created_by = auth.uid()))
);;
