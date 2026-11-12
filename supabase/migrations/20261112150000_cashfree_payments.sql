-- =====================================================================
-- Cashfree sandbox payments (v1) — single academy account
-- =====================================================================
-- ADDITIVE ONLY. No existing table, column, policy, or RPC is dropped,
-- renamed, or weakened by this migration.
--
-- What this adds:
--   1. payment_orders / payment_transactions — gateway-agnostic tables
--      (gateway defaults to 'cashfree'; PhonePe/Stripe reuse the same
--      tables later by setting gateway + their own order id).
--   2. grant_paid_enrollment(uuid) — server-only RPC that grants a
--      course enrolment for a PAID order. Called only by the
--      cashfree-payments edge function (service_role) after a verified
--      Cashfree webhook. Idempotent: replays do not double-enrol.
--   3. create_faculty_course(jsonb) — redefined ONLY to accept `price`
--      in the jsonb payload. Signature is unchanged ((jsonb)); every
--      other line is identical to
--      20260908000000_repair_missing_baseline_objects.sql.
--   4. courses.price >= 0 guard (existing prices are all 0, so this
--      cannot fail on existing rows).
--
-- Deliberate v1 limits (do not "fix" silently — they are product
-- decisions, see the handover pack):
--   * Single academy merchant account. All payments settle to the one
--     Cashfree account. Faculty revenue split is a future configurable
--     setting, NOT auto-split in v1 (Cashfree Easy Split / Payouts).
--   * Currency is INR by default. Provider/currency are config, not
--     hardcoded: src/lib/payments.ts (PAYMENT_CONFIG) on the client,
--     CASHFREE_* env vars on the edge function.
--   * A price only has effect on approval_required courses. The free
--     self-enrol path (enrollments_insert_hardened) is untouched, so
--     an `open` course with price > 0 would still be freely
--     enrolable — faculty/admin UI therefore steers paid courses to
--     approval_required. Do not weaken that policy to "fix" pricing.
--   * Secrets (CASHFREE_TEST_APP_ID / CASHFREE_TEST_SECRET_KEY) live
--     in Supabase function secrets only. Never in this repo, never in
--     the browser bundle. Sandbox/test keys only in v1.
--   * Webhook payloads are stored raw (jsonb) for reconciliation.
--     They can contain customer contact details: RLS allows admin
--     SELECT only, and the rows are never exposed through any API.
--
-- Verification after applying (staging first, with a backup):
--   1. Create a paid approval_required course (price >= 1) as faculty.
--   2. As a student, Pay now -> Cashfree sandbox checkout (test UPI).
--   3. Webhook PAYMENT_SUCCESS -> order status 'paid', enrolment
--      granted with enrollment_source 'paid_gateway'.
--   4. Replay the same webhook -> 200 duplicate, no second enrolment.
-- =====================================================================

-- ---------- payment_orders ----------
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 1),
  currency text not null default 'INR',
  gateway text not null default 'cashfree',
  gateway_order_id text not null,
  cf_order_id text,
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_orders is
  'One row per checkout attempt. amount/currency are copied from courses.price at order time — the gateway is never trusted for the price. gateway_order_id is the merchant order id sent to the gateway; cf_order_id is the gateway-assigned id.';

create unique index if not exists payment_orders_gateway_order_id_unique
  on public.payment_orders (gateway, gateway_order_id);

create index if not exists payment_orders_student_idx
  on public.payment_orders (student_id, created_at desc);

create index if not exists payment_orders_course_idx
  on public.payment_orders (course_id);

create index if not exists payment_orders_status_idx
  on public.payment_orders (status);

drop trigger if exists update_payment_orders_updated_at on public.payment_orders;
create trigger update_payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function update_updated_at_column();

alter table public.payment_orders enable row level security;

-- Students see only their own orders; admins see all. The edge
-- function uses the service role and bypasses RLS; these policies
-- only govern direct client access (deny-by-default otherwise).
drop policy if exists payment_orders_select_own_or_admin on public.payment_orders;
create policy payment_orders_select_own_or_admin
  on public.payment_orders
  for select
  to authenticated
  using (student_id = (select auth.uid()) or is_admin());

drop policy if exists payment_orders_insert_own on public.payment_orders;
create policy payment_orders_insert_own
  on public.payment_orders
  for insert
  to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'created'
  );

-- No update/delete policies: order state changes only through the
-- edge function (service role) after gateway verification.

-- ---------- payment_transactions ----------
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid not null references public.payment_orders(id) on delete cascade,
  gateway text not null default 'cashfree',
  cf_payment_id text,
  event_type text not null,
  gateway_status text,
  amount numeric(10,2),
  currency text,
  signature_valid boolean not null default false,
  raw_payload jsonb not null,
  received_at timestamptz not null default now()
);

comment on table public.payment_transactions is
  'One row per verified gateway webhook event. raw_payload is the exact JSON Cashfree sent (kept for reconciliation). cf_payment_id is the idempotency key: a replayed webhook is recognised and skipped.';

create unique index if not exists payment_transactions_cf_payment_unique
  on public.payment_transactions (gateway, cf_payment_id)
  where cf_payment_id is not null;

create index if not exists payment_transactions_order_idx
  on public.payment_transactions (payment_order_id, received_at desc);

alter table public.payment_transactions enable row level security;

-- Payloads can contain customer contact details: admin SELECT only.
-- No insert/update/delete policies: only the edge function
-- (service role) writes here, after signature verification.
drop policy if exists payment_transactions_select_admin on public.payment_transactions;
create policy payment_transactions_select_admin
  on public.payment_transactions
  for select
  to authenticated
  using (is_admin());

-- ---------- courses.price guard ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_price_non_negative'
  ) then
    alter table public.courses
      add constraint courses_price_non_negative check (price >= 0);
  end if;
end $$;

-- ---------- grant_paid_enrollment ----------
-- Server-only grant for a PAID order. Called by the cashfree-payments
-- edge function (service_role) after a verified PAYMENT_SUCCESS
-- webhook + a server-side order-status check against Cashfree.
-- Idempotent: an already-active enrolment is returned, not duplicated;
-- a revoked enrolment is reactivated. A pending manual approval
-- request for the same student+course is marked approved so the admin
-- queue stays consistent. The paid status of the order IS the
-- authorisation — the function must never be callable by students
-- for unpaid orders (execute is service_role only).
create or replace function public.grant_paid_enrollment(p_payment_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order public.payment_orders%rowtype;
  v_enrollment_id uuid;
  v_already boolean := false;
begin
  select * into v_order
  from public.payment_orders
  where id = p_payment_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID';
  end if;

  select id into v_enrollment_id
  from public.course_enrollments
  where course_id = v_order.course_id
    and student_id = v_order.student_id
    and access_status = 'active';

  if found then
    v_already := true;
  else
    insert into public.course_enrollments (
      course_id, student_id, access_status, enrollment_source,
      granted_at, progress_percentage, notes
    ) values (
      v_order.course_id, v_order.student_id, 'active', 'paid_gateway',
      now(), 0,
      'Paid via ' || v_order.gateway || ' order ' || v_order.gateway_order_id
    )
    on conflict (course_id, student_id) do update
      set access_status = 'active',
          enrollment_source = 'paid_gateway',
          granted_at = now(),
          revoked_by = null,
          revoked_at = null,
          notes = 'Paid via ' || v_order.gateway || ' order ' || v_order.gateway_order_id
    returning id into v_enrollment_id;
  end if;

  update public.enrollment_requests
  set status = 'approved',
      reviewed_at = now(),
      updated_at = now(),
      review_note = coalesce(review_note, 'Paid via ' || v_order.gateway)
  where course_id = v_order.course_id
    and student_id = v_order.student_id
    and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'course_id', v_order.course_id,
    'student_id', v_order.student_id,
    'enrollment_id', v_enrollment_id,
    'already_enrolled', v_already
  );
end;
$function$;

revoke execute on function public.grant_paid_enrollment(uuid) from public;
revoke execute on function public.grant_paid_enrollment(uuid) from anon;
grant execute on function public.grant_paid_enrollment(uuid) to service_role;

-- ---------- create_faculty_course: accept `price` ----------
-- Signature unchanged: (jsonb). Every line below is identical to
-- 20260908000000_repair_missing_baseline_objects.sql except the
-- v_price declaration, its validation, the `price` INSERT column,
-- and the `price` field in the returned object.
create or replace function public.create_faculty_course(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_course_id uuid;
  v_title text := nullif(trim(p_payload->>'title'), '');
  v_slug text := nullif(trim(p_payload->>'slug'), '');
  v_short_desc text := nullif(trim(p_payload->>'short_description'), '');
  v_desc text := nullif(trim(p_payload->>'description'), '');
  v_thumb text := nullif(trim(p_payload->>'thumbnail_url'), '');
  v_difficulty text := coalesce(nullif(trim(p_payload->>'difficulty'), ''), 'beginner');
  v_category text := coalesce(nullif(trim(p_payload->>'category'), ''), 'python');
  v_language text := coalesce(nullif(trim(p_payload->>'language'), ''), 'English');
  v_duration integer := coalesce(nullif(p_payload->>'duration_hours', '')::integer, 0);
  v_is_published boolean := coalesce(nullif(p_payload->>'is_published', '')::boolean, false);
  v_price numeric(10,2) := coalesce(nullif(p_payload->>'price', '')::numeric, 0);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
    into v_role
  from public.profiles as p
  where p.id = v_user_id;

  if v_role is null then
    raise exception 'Profile not found';
  end if;

  if v_role not in ('faculty', 'super_admin') then
    raise exception 'Only faculty or admin can create courses';
  end if;

  -- Faculty-created courses always begin as drafts.
  if v_role = 'faculty' then
    v_is_published := false;
  end if;

  if v_title is null then
    raise exception 'Title is required';
  end if;

  if v_slug is null then
    raise exception 'Slug is required';
  end if;

  if v_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  insert into public.courses (
    title,
    slug,
    short_description,
    description,
    thumbnail_url,
    difficulty,
    category,
    language,
    duration_hours,
    price,
    is_published,
    is_featured,
    created_by
  ) values (
    v_title,
    v_slug,
    v_short_desc,
    v_desc,
    v_thumb,
    v_difficulty,
    v_category,
    v_language,
    v_duration,
    v_price,
    v_is_published,
    false,
    v_user_id
  )
  returning id into v_course_id;

  insert into public.course_faculty (course_id, faculty_id)
  values (v_course_id, v_user_id)
  on conflict (course_id, faculty_id) do nothing;

  return jsonb_build_object(
    'id', v_course_id,
    'title', v_title,
    'slug', v_slug,
    'created_by', v_user_id,
    'is_published', v_is_published,
    'price', v_price
  );
end;
$function$;

revoke execute on function public.create_faculty_course(jsonb) from public;
revoke execute on function public.create_faculty_course(jsonb) from anon;
grant execute on function public.create_faculty_course(jsonb) to authenticated;

notify pgrst, 'reload schema';
