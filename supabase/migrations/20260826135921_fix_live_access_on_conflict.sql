create or replace function public.start_coding_live_class(
  p_batch_id uuid,
  p_assignment_ids uuid[],
  p_minutes integer default 90
)
returns table(assignment_id uuid, batch_id uuid, live_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_assignment uuid;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;
  if coalesce(array_length(p_assignment_ids, 1), 0) = 0 then raise exception 'Select at least one question'; end if;
  if p_minutes < 5 or p_minutes > 480 then raise exception 'Live class duration must be between 5 and 480 minutes'; end if;
  if not exists (select 1 from public.batches b where b.id = p_batch_id and b.status = 'active') then
    raise exception 'Active batch not found';
  end if;

  v_until := now() + make_interval(mins => p_minutes);

  foreach v_assignment in array p_assignment_ids loop
    if not exists (
      select 1 from public.coding_vscode_assignments a
      where a.id = v_assignment and a.is_published = true and a.language = 'python'
    ) then raise exception 'Published Python question not found'; end if;

    insert into public.coding_vscode_assignment_batches (
      assignment_id, batch_id, is_unlocked, unlocked_at, locked_at, live_until,
      is_permanently_released, updated_at, updated_by
    ) values (
      v_assignment, p_batch_id, true, now(), null, v_until,
      false, now(), auth.uid()
    )
    on conflict on constraint coding_vscode_assignment_batches_assignment_id_batch_id_key
    do update set
      is_unlocked = true,
      unlocked_at = now(),
      locked_at = null,
      live_until = v_until,
      updated_at = now(),
      updated_by = auth.uid();
  end loop;

  return query
  select ab.assignment_id, ab.batch_id, ab.live_until
  from public.coding_vscode_assignment_batches ab
  where ab.batch_id = p_batch_id
    and ab.assignment_id = any(p_assignment_ids);
end;
$$;

create or replace function public.release_coding_assignments_permanently(
  p_batch_id uuid,
  p_assignment_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment uuid;
  v_count integer := 0;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;
  if coalesce(array_length(p_assignment_ids, 1), 0) = 0 then raise exception 'Select at least one question'; end if;
  if not exists (select 1 from public.batches b where b.id = p_batch_id and b.status = 'active') then
    raise exception 'Active batch not found';
  end if;

  foreach v_assignment in array p_assignment_ids loop
    if not exists (
      select 1 from public.coding_vscode_assignments a
      where a.id = v_assignment and a.is_published = true and a.language = 'python'
    ) then raise exception 'Published Python question not found'; end if;

    insert into public.coding_vscode_assignment_batches (
      assignment_id, batch_id, is_unlocked, unlocked_at, locked_at, live_until,
      is_permanently_released, updated_at, updated_by
    ) values (
      v_assignment, p_batch_id, false, null, null, null,
      true, now(), auth.uid()
    )
    on conflict on constraint coding_vscode_assignment_batches_assignment_id_batch_id_key
    do update set
      is_permanently_released = true,
      updated_at = now(),
      updated_by = auth.uid();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;;
