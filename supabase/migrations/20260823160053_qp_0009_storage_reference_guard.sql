create or replace function public.qp_storage_path_is_unreferenced(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.qp_question_assets a
    where a.storage_path = p_path
  );
$$;

revoke all on function public.qp_storage_path_is_unreferenced(text) from public;
grant execute on function public.qp_storage_path_is_unreferenced(text) to authenticated;

drop policy if exists qp_assets_delete on storage.objects;

create policy qp_assets_delete
on storage.objects for delete
to authenticated
using (
  public.qp_is_active_faculty_or_admin()
  and bucket_id = 'question-paper-assets'
  and (
    (
      (storage.foldername(name))[1] = 'papers'
      and exists (
        select 1 from public.qp_papers p
        where p.id::text = (storage.foldername(name))[2]
          and p.status = 'draft'
          and (public.qp_is_super_admin() or p.created_by = auth.uid())
      )
      and public.qp_storage_path_is_unreferenced(name)
    )
    or (
      (storage.foldername(name))[1] = 'question-bank'
      and exists (
        select 1 from public.qp_question_bank qb
        where qb.id::text = (storage.foldername(name))[2]
          and (
            public.qp_is_super_admin()
            or (qb.created_by = auth.uid() and qb.approval_status = 'draft')
          )
      )
      and public.qp_storage_path_is_unreferenced(name)
    )
    or (
      (storage.foldername(name))[1] = 'temporary'
      and (
        public.qp_is_super_admin()
        or (storage.foldername(name))[2] = auth.uid()::text
      )
    )
  )
);;
