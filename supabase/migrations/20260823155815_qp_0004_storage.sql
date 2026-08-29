insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-paper-assets','question-paper-assets',false,5242880,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists qp_assets_read on storage.objects;
drop policy if exists qp_assets_insert on storage.objects;
drop policy if exists qp_assets_update on storage.objects;
drop policy if exists qp_assets_delete on storage.objects;

create policy qp_assets_read on storage.objects for select to authenticated using (
  bucket_id='question-paper-assets' and (
    public.qp_is_super_admin()
    or ((storage.foldername(name))[1]='papers' and exists (select 1 from public.qp_papers p where p.id::text=(storage.foldername(name))[2] and p.created_by=auth.uid()))
    or ((storage.foldername(name))[1]='question-bank' and exists (select 1 from public.qp_question_bank qb where qb.id::text=(storage.foldername(name))[2] and (qb.approval_status='approved' or qb.created_by=auth.uid())))
    or ((storage.foldername(name))[1]='temporary' and (storage.foldername(name))[2]=auth.uid()::text)
  )
);

create policy qp_assets_insert on storage.objects for insert to authenticated with check (
  bucket_id='question-paper-assets' and (
    ((storage.foldername(name))[1]='papers' and exists (select 1 from public.qp_papers p where p.id::text=(storage.foldername(name))[2] and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or ((storage.foldername(name))[1]='question-bank' and exists (select 1 from public.qp_question_bank qb where qb.id::text=(storage.foldername(name))[2] and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
    or ((storage.foldername(name))[1]='temporary' and (public.qp_is_super_admin() or (storage.foldername(name))[2]=auth.uid()::text))
  )
);

create policy qp_assets_update on storage.objects for update to authenticated using (
  bucket_id='question-paper-assets' and (
    ((storage.foldername(name))[1]='papers' and exists (select 1 from public.qp_papers p where p.id::text=(storage.foldername(name))[2] and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or ((storage.foldername(name))[1]='question-bank' and exists (select 1 from public.qp_question_bank qb where qb.id::text=(storage.foldername(name))[2] and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
    or ((storage.foldername(name))[1]='temporary' and (public.qp_is_super_admin() or (storage.foldername(name))[2]=auth.uid()::text))
  )
) with check (
  bucket_id='question-paper-assets' and (
    ((storage.foldername(name))[1]='papers' and exists (select 1 from public.qp_papers p where p.id::text=(storage.foldername(name))[2] and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or ((storage.foldername(name))[1]='question-bank' and exists (select 1 from public.qp_question_bank qb where qb.id::text=(storage.foldername(name))[2] and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
    or ((storage.foldername(name))[1]='temporary' and (public.qp_is_super_admin() or (storage.foldername(name))[2]=auth.uid()::text))
  )
);

create policy qp_assets_delete on storage.objects for delete to authenticated using (
  bucket_id='question-paper-assets' and (
    ((storage.foldername(name))[1]='papers' and exists (select 1 from public.qp_papers p where p.id::text=(storage.foldername(name))[2] and p.status='draft' and (public.qp_is_super_admin() or p.created_by=auth.uid())))
    or ((storage.foldername(name))[1]='question-bank' and exists (select 1 from public.qp_question_bank qb where qb.id::text=(storage.foldername(name))[2] and (public.qp_is_super_admin() or (qb.created_by=auth.uid() and qb.approval_status='draft'))))
    or ((storage.foldername(name))[1]='temporary' and (public.qp_is_super_admin() or (storage.foldername(name))[2]=auth.uid()::text))
  )
);;
