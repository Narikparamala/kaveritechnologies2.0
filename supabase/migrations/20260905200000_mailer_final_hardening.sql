-- =====================================================================
-- Final mailer hardening — message authority + resend generation
--
-- Forward-only. Complements 20260905190000_email_delivery_hardening.sql.
--
-- 1. delivery_generation: a monotonically increasing per-row counter that
--    is bumped by force_resend_notification_outbox(). The mailer derives
--    the provider Idempotency-Key from it
--    (dedupe_key:delivery:<generation>), so an explicit forced resend is
--    a NEW delivery in the provider's eyes while ordinary retries keep
--    the same generation and stay deduplicated.
-- 2. The outbox worker now POSTs only { outbox_id } to the mailer. The
--    mailer loads the row from notification_outbox and treats the DB row
--    as the single authority for template/recipient/payload/dedupe — a
--    tampered HTTP body can never change the actual destination/content.
-- =====================================================================

-- ---------- 1. delivery generation ----------
alter table public.notification_outbox
  add column if not exists delivery_generation integer not null default 0;

comment on column public.notification_outbox.delivery_generation is
  'Delivery attempt generation for provider idempotency. Incremented only by '
  'force_resend_notification_outbox(); ordinary retries reuse the same '
  'generation so the provider deduplicates them.';

-- ---------- 2. force resend bumps the generation ----------
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
    raise exception 'ROW_NOT_RESENDABLE';
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
      delivery_generation = delivery_generation + 1,
      payload = payload || jsonb_build_object(
        'force_resend_audit', coalesce(payload -> 'force_resend_audit', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
               'at', now(),
               'actor', auth.uid(),
               'actor_role', auth.role(),
               'from_status', v_prev_status,
               'delivery_generation', v_row.delivery_generation + 1
             ))
      ),
      updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'outbox_id', p_id,
    'previous_status', v_prev_status,
    'delivery_generation', v_row.delivery_generation + 1,
    'status', 'queued'
  );
end;
$$;

-- ---------- 3. worker posts ONLY the outbox id ----------
-- The mailer loads the authoritative message from notification_outbox, so
-- the worker no longer echoes recipient/template/payload fields (nothing a
-- tampered body could change).
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

  -- Claim due rows (row locks: concurrent workers never claim twice).
  -- Stale 'delivering' rows (mailer crashed after claim) are reclaimed.
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

      -- Gateway pass: the functions gateway requires a valid Supabase JWT
      -- in Authorization. The anon key is public; the real authorization
      -- is the X-Kaveri-Mailer-Token header verified by the function.
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

      -- Claim for delivery (self-heals after 10 min if the mailer never
      -- answers).
      update public.notification_outbox
      set status = 'sending',
          attempts = attempts + 1,
          next_attempt_at = now() + interval '10 minutes',
          last_error = null,
          updated_at = now()
      where id = v_item;

      begin
        -- net.http_post(url, body, params, headers, timeout_ms)
        -- Body is ONLY the outbox id: the mailer treats the DB row as the
        -- single authority for message content.
        select net.http_post(
          v_mailer_url,
          jsonb_build_object('outbox_id', v_row.id),
          '{}'::jsonb,
          jsonb_build_object(
            'authorization', 'Bearer ' || v_gateway_jwt,
            'x-kaveri-mailer-token', v_token,
            'content-type', 'application/json'
          ),
          10000
        ) into v_job_id;
      exception when others then
        update public.notification_outbox
        set status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'PG_NET_ENQUEUE_FAILED',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end;

      update public.notification_outbox
      set payload = payload || jsonb_build_object(
            'pg_net_jobs', coalesce(payload -> 'pg_net_jobs', '[]'::jsonb)
              || jsonb_build_array(v_job_id)
          ),
          updated_at = now()
      where id = v_item;
      v_enqueued := v_enqueued + 1;

    else
      -- mode = 'disabled' (local default): durable queue, honestly skipped.
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

-- ---------- execution scoping (unchanged contract) ----------
revoke all on function public.process_notification_outbox(int)
  from public, anon, authenticated;
revoke all on function public.force_resend_notification_outbox(uuid)
  from public, anon, authenticated;
grant execute on function public.process_notification_outbox(int) to service_role;
grant execute on function public.force_resend_notification_outbox(uuid) to service_role;