drop policy if exists qp_papers_delete on public.qp_papers;

create policy qp_papers_delete
on public.qp_papers
for delete
to authenticated
using (
  public.qp_is_active_faculty_or_admin()
  and status = 'draft'
  and (
    public.qp_is_super_admin()
    or created_by = auth.uid()
  )
);;
