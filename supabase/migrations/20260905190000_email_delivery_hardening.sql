-- =====================================================================
-- Email delivery hardening — real mailer path + integration contracts
--
-- Forward-only hardening of 20260905180000_central_notifications_outbox.sql.
--
-- 1. Event immutability: record_notification_event() no longer rewrites
--    the payload of an already-recorded event (append-only log).  A
--    duplicate dedupe_key returns the ORIGINAL event id untouched.
-- 2. Safe requeue: requeue_notification_outbox() may only move
--    skipped/failed rows back to queued.  A separate explicit
--    force_resend_notification_outbox() exists for ops-forced resends
--    with audit semantics; sent rows are never silently resent.
-- 3. Real delivery: process_notification_outbox() in pg_net mode now
--    marks rows sending and POSTs them to the notification-mailer Edge
--    Function (token from supabase_vault, endpoint from
--    kaveri_app_settings.email_delivery.mailer_url).  The mailer atomically
--    claims delivery, renders the approved template, calls the provider,
--    and resolves the row (sent / failed / queued+backoff).  Worker-side
--    enqueue failures revert to queued with exponential backoff.
-- 4. Delivery state machine extended with 'delivering' (mailer claim) and
--    self-healing: stale 'delivering' rows are reclaimed.
-- 5. Ops health: notification_delivery_health() returns aggregate queue
--    counts and oldest-queued age — never recipient data.
--
-- Provider credentials live in supabase_vault / function env ONLY
-- (never VITE_*, never browser code, never committed).
-- Auth emails (confirm/forgot/reset) remain Supabase Auth + SMTP — this
-- outbox never touches them.
-- =====================================================================

-- ---------- 1. true event immutability ----------
create or replace function public.record_notification_event(
  p_event_type text,
  p_actor_user_id uuid,
  p_subject_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into public.notification_events (
    event_type, actor_user_id, subject_user_id, entity_type, entity_id,
    payload, dedupe_key
  )
  values (
    p_event_type, p_actor_user_id, p_subject_user_id, p_entity_type,
    p_entity_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null
    do nothing
  returning id into v_event_id;

  -- Duplicate dedupe_key → return the ORIGINAL event id; the payload of
  -- an already-recorded event is immutable and is never rewritten.
  if v_event_id is null and p_dedupe_key is not null then
    select id into v_event_id
    from public.notification_events
    where dedupe_key = p_dedupe_key;
  end if;

  return v_event_id;
end;
$$;

-- ---------- 2. outbox schema: delivering claim + provider id ----------
alter table public.notification_outbox
  drop constraint notification_outbox_status_check;

alter table public.notification_outbox
  add constraint notification_outbox_status_check
  check (status in ('queued', 'sending', 'delivering', 'sent', 'failed', 'skipped'));

alter table public.notification_outbox
  add column if not exists delivery_claimed_at timestamptz,
  add column if not exists provider_message_id text;

comment on column public.notification_outbox.delivery_claimed_at is
  'Set when the mailer atomically claims a row for delivery; stale claims are reclaimed.';
comment on column public.notification_outbox.provider_message_id is
  'Safe provider-side message id returned on successful delivery (no provider secret).';

drop index if exists notification_outbox_due_idx;
create index notification_outbox_due_idx
  on public.notification_outbox (status, next_attempt_at)
  where status in ('queued', 'sending');

create index notification_outbox_stale_delivering_idx
  on public.notification_outbox (delivery_claimed_at)
  where status = 'delivering';

-- ---------- 3. safe requeue (skipped/failed only) ----------
create or replace function public.requeue_notification_outbox(
  p_id uuid default null,
  p_reset_attempts boolean default true
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated int;
begin
  if p_id is not null then
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where id = p_id
      and status in ('skipped', 'failed');
    get diagnostics v_updated = row_count;
  else
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where status in ('skipped', 'failed')
      and (payload ->> 'simulated_failure_applied') is null;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;

-- Explicit ops-only resend with audit.  sent rows are ONLY ever resent
-- through this function; nothing in the default worker path resends them.
create or replace function public.force_resend_notification_outbox(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.notification_outbox%rowtype;
  v_prev_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_row
  from public.notification_outbox
  where id = p_id
  for update;

  if not found then
    raise exception 'OUTBOX_ROW_NOT_FOUND';
  end if;
  if v_row.status not in ('sent', 'failed', 'skipped') then
    raise exception 'ROW_NOT_RESENDABLE';  -- queued/sending/delivering are already in flight
  end if;

  v_prev_status := v_row.status;

  update public.notification_outbox
  set status = 'queued',
      attempts = 0,
      next_attempt_at = now(),
      last_error = null,
      sent_at = null,
      provider_message_id = null,
      delivery_claimed_at = null,
      payload = payload || jsonb_build_object(
        'force_resend_audit', coalesce(payload -> 'force_resend_audit', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
               'at', now(),
               'actor', auth.uid(),
               'actor_role', auth.role(),
               'from_status', v_prev_status
             ))
      ),
      updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'outbox_id', p_id,
    'previous_status', v_prev_status,
    'status', 'queued'
  );
end;
$$;

-- ---------- 4. worker with real pg_net → mailer delivery ----------
create or replace function public.process_notification_outbox(
  p_batch_size int default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_mailer_url text;
  v_token text;
  v_gateway_jwt text;
  v_claimed uuid[];
  v_item uuid;
  v_row public.notification_outbox%rowtype;
  v_delivered int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_transient int := 0;
  v_enqueued int := 0;
  v_job_id bigint;
  v_backoff interval;
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  select coalesce(value ->> 'mode', 'disabled')
  into v_mode
  from public.kaveri_app_settings
  where key = 'email_delivery';

  -- Claim due rows.  Row locks (FOR UPDATE SKIP LOCKED) mean two
  -- concurrent workers can never claim the same row.  Stale 'delivering'
  -- rows (mailer crashed after claim) are reclaimed after 10 minutes.
  select array_agg(claimed.id)
  into v_claimed
  from (
    select o.id
    from public.notification_outbox o
    where (
        (o.status in ('queued', 'sending') and o.attempts < o.max_attempts and o.next_attempt_at <= now())
        or (o.status = 'delivering' and o.delivery_claimed_at < now() - interval '10 minutes')
      )
      and o.attempts < o.max_attempts
    order by o.created_at asc
    limit p_batch_size
    for update skip locked
  ) claimed;

  -- Rows that have exhausted retries are permanently failed (never linger).
  update public.notification_outbox
  set status = 'failed',
      last_error = 'MAX_ATTEMPTS_EXCEEDED',
      delivery_claimed_at = null,
      updated_at = now()
  where status in ('queued', 'sending', 'delivering')
    and attempts >= max_attempts;

  foreach v_item in array coalesce(v_claimed, array[]::uuid[]) loop
    select * into v_row from public.notification_outbox where id = v_item;

    v_backoff := (interval '1 minute') * least(power(2, v_row.attempts), 60);

    if v_mode = 'simulate_failure' then
      -- Dev/diagnostic mode: first attempt fails transiently, later succeeds.
      if (v_row.payload ->> 'simulated_failure_applied') is null then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            payload = payload || '{"simulated_failure_applied": true}'::jsonb,
            last_error = 'simulated transient delivery failure',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
      else
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'sent',
            sent_at = now(),
            last_error = null,
            updated_at = now()
        where id = v_item;
        v_delivered := v_delivered + 1;
      end if;

    elsif v_mode = 'pg_net' then
      -- Production adapter: worker marks the row sending, then posts to
      -- the notification-mailer Edge Function via pg_net.  The mailer
      -- atomically claims delivery and resolves the final state.
      if to_regnamespace('net') is null then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'PG_NET_UNAVAILABLE: pg_net extension not enabled',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end if;

      select value ->> 'mailer_url' into v_mailer_url
      from public.kaveri_app_settings
      where key = 'email_delivery';

      select decrypted_secret into v_token
      from vault.decrypted_secrets
      where name = 'notification_mailer_token';

      -- The functions gateway requires a valid Supabase JWT in
      -- Authorization before it routes to the function.  The anon key is
      -- that gateway pass (it is public); the real authorization is the
      -- X-Kaveri-Mailer-Token header verified by the function itself.
      select decrypted_secret into v_gateway_jwt
      from vault.decrypted_secrets
      where name = 'supabase_anon_key';

      if v_mailer_url is null or v_mailer_url = ''
         or v_token is null or v_token = ''
         or v_gateway_jwt is null or v_gateway_jwt = '' then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'MAILER_NOT_CONFIGURED: set email_delivery.mailer_url and vault secrets notification_mailer_token + supabase_anon_key',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end if;

      -- Claim for delivery: self-heals (reclaimed after 10 min) if the
      -- mailer never answers.
      update public.notification_outbox
      set status = 'sending',
          attempts = attempts + 1,
          next_attempt_at = now() + interval '10 minutes',
          last_error = null,
          updated_at = now()
      where id = v_item;

      begin
        -- net.http_post(url, body, params, headers, timeout_ms)
        select net.http_post(
          v_mailer_url,
          jsonb_build_object(
            'outbox_id', v_row.id,
            'channel', v_row.channel,
            'template_key', v_row.template_key,
            'recipient_user_id', v_row.recipient_user_id,
            'recipient_email', v_row.recipient_email,
            'recipient_name', v_row.recipient_name,
            'payload', v_row.payload,
            'dedupe_key', v_row.dedupe_key,
            'event_id', v_row.event_id
          ),
          '{}'::jsonb,
          jsonb_build_object(
            'authorization', 'Bearer ' || v_gateway_jwt,
            'x-kaveri-mailer-token', v_token,
            'content-type', 'application/json'
          ),
          10000
        ) into v_job_id;
      exception when others then
        -- pg_net rejected the enqueue: revert to queued with backoff.
        update public.notification_outbox
        set status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'PG_NET_ENQUEUE_FAILED',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end;

      -- Enqueued: keep the pg_net job id for ops audit only.
      update public.notification_outbox
      set payload = payload || jsonb_build_object(
            'pg_net_jobs', coalesce(payload -> 'pg_net_jobs', '[]'::jsonb)
              || jsonb_build_array(v_job_id)
          ),
          updated_at = now()
      where id = v_item;
      v_enqueued := v_enqueued + 1;

    else
      -- mode = 'disabled' (local default): queue stays durable but no
      -- mailer is configured.  Mark skipped honestly; ops requeues after
      -- configuring a provider.
      update public.notification_outbox
      set attempts = attempts + 1,
          status = 'skipped',
          last_error = 'email delivery disabled (kaveri_app_settings email_delivery); requeue when a provider is configured',
          updated_at = now()
      where id = v_item;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'claimed', coalesce(array_length(v_claimed, 1), 0),
    'mode', v_mode,
    'delivered', v_delivered,
    'enqueued_to_mailer', v_enqueued,
    'transient_retry', v_transient,
    'skipped_no_provider', v_skipped,
    'failed', v_failed
  );
end;
$$;

-- ---------- 5. ops health (aggregates only — no recipient data) ----------
create or replace function public.notification_delivery_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_mailer_configured boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select coalesce(value ->> 'mode', 'disabled') into v_mode
  from public.kaveri_app_settings
  where key = 'email_delivery';

  select coalesce(nullif(value ->> 'mailer_url', ''), '') <> '' into v_mailer_configured
  from public.kaveri_app_settings
  where key = 'email_delivery';

  return jsonb_build_object(
    'ok', true,
    'as_of', now(),
    'email', jsonb_build_object(
      'mode', v_mode,
      'mailer_configured', coalesce(v_mailer_configured, false),
      'queued', (select count(*) from public.notification_outbox where status = 'queued'),
      'sending', (select count(*) from public.notification_outbox where status = 'sending'),
      'delivering', (select count(*) from public.notification_outbox where status = 'delivering'),
      'failed', (select count(*) from public.notification_outbox where status = 'failed'),
      'skipped', (select count(*) from public.notification_outbox where status = 'skipped'),
      'sent_last_1h', (select count(*) from public.notification_outbox
                        where status = 'sent' and sent_at > now() - interval '1 hour'),
      'sent_last_24h', (select count(*) from public.notification_outbox
                         where status = 'sent' and sent_at > now() - interval '24 hours'),
      'oldest_queued_age_seconds',
        (select extract(epoch from now() - min(next_attempt_at))::int
         from public.notification_outbox
         where status in ('queued', 'sending') and attempts < max_attempts)
    ),
    'events_total', (select count(*) from public.notification_events)
  );
end;
$$;

-- ---------- 6. server secret access for the mailer (vault only) ----------
-- Single server-side source of truth for the mailer auth token.  The
-- notification-mailer Edge Function (running with the service-role client)
-- reads it through this RPC; the outbox worker reads vault directly.  No
-- secret is ever exposed to clients or committed.
create or replace function public.get_server_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_name;

  return v_secret;
end;
$$;

-- ---------- execution scoping ----------
-- Replaced helpers keep their revoked status; new ops functions are
-- service-role only.  The mailer talks to the DB with the service-role
-- client (bypasses RLS); no client path exists for queue/event/settings.
revoke all on function public.get_server_secret(text)
  from public, anon, authenticated;
grant execute on function public.get_server_secret(text) to service_role;
revoke all on function public.record_notification_event(text, uuid, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.requeue_notification_outbox(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.process_notification_outbox(int)
  from public, anon, authenticated;
revoke all on function public.force_resend_notification_outbox(uuid)
  from public, anon, authenticated;
revoke all on function public.notification_delivery_health()
  from public, anon, authenticated;

grant execute on function public.process_notification_outbox(int) to service_role;
grant execute on function public.requeue_notification_outbox(uuid, boolean) to service_role;
grant execute on function public.force_resend_notification_outbox(uuid) to service_role;
grant execute on function public.notification_delivery_health() to service_role;

-- ---------- settings documentation ----------
update public.kaveri_app_settings
set description = 'mode: disabled (queue only) | simulate_failure (dev, proves retries) | pg_net (production: outbox posts to the notification-mailer Edge Function via pg_net). production fields: mailer_url = https://<project>.functions.supabase.co/notification-mailer; the mailer auth token lives ONLY in supabase_vault as notification_mailer_token.'
where key = 'email_delivery';