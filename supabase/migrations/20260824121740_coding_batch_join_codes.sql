alter table public.batches
  add column if not exists join_code text;

create unique index if not exists batches_join_code_unique
  on public.batches (upper(join_code))
  where join_code is not null;

create or replace function public.join_batch_by_code(p_code text)
returns table (
  batch_id uuid,
  batch_name text,
  membership_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_batch public.batches%rowtype;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_batch
  from public.batches
  where upper(join_code) = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if v_batch.id is null then
    raise exception 'Invalid or inactive batch code.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user
      and p.role = 'student'
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'Only active student accounts can join a batch.';
  end if;

  insert into public.batch_students (batch_id, student_id, status)
  values (v_batch.id, v_user, 'active')
  on conflict (batch_id, student_id)
  do update set status = 'active';

  return query
  select v_batch.id, v_batch.name, 'active'::text;
end;
$$;

grant execute on function public.join_batch_by_code(text) to authenticated;;
