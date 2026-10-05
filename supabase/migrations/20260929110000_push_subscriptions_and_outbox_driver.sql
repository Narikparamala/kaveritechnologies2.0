-- ============ STEP 1: FCM push foundation + outbox driver (ops run) ============
-- Idempotent. Safe to re-run. Secrets handled via vault (values generated at run time).

-- ---------- 1. push_subscriptions ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;

create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_own_update on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id) where revoked_at is null;

-- ---------- 2. allow 'push' channel on the outbox ----------
alter table public.notification_outbox
  drop constraint if exists notification_outbox_channel_check;
alter table public.notification_outbox
  add constraint notification_outbox_channel_check
  check (channel in ('email', 'push', 'webhook'));

-- ---------- 3. kaveri_queue_push (mirrors kaveri_queue_email) ----------
create or replace function public.kaveri_queue_push(
  p_recipient_user_id uuid,
  p_title text,
  p_body text,
  p_url text default null,
  p_dedupe_key text default null,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outbox_id uuid;
begin
  insert into public.notification_outbox (
    event_id, channel, template_key, recipient_user_id, recipient_email,
    recipient_name, payload, dedupe_key
  )
  values (
    p_event_id, 'push', 'push.generic', p_recipient_user_id, null,
    null, jsonb_build_object(
      'title', coalesce(p_title, 'Kaveri Academy'),
      'body', coalesce(p_body, ''),
      'url', coalesce(p_url, '/')
    ), p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null
    do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null and p_dedupe_key is not null then
    select id into v_outbox_id
    from public.notification_outbox
    where dedupe_key = p_dedupe_key
    limit 1;
  end if;

  return v_outbox_id;
end;
$$;

revoke all on function public.kaveri_queue_push(uuid, text, text, text, text, uuid) from public;
revoke all on function public.kaveri_queue_push(uuid, text, text, text, text, uuid) from anon;
revoke all on function public.kaveri_queue_push(uuid, text, text, text, text, uuid) from authenticated;

-- ---------- 4. auto-enqueue a push row per new notification ----------
create or replace function public.kaveri_notifications_auto_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null then
    return new;
  end if;
  perform public.kaveri_queue_push(
    new.user_id,
    new.title,
    new.message,
    coalesce(new.action_url, '/'),
    'push:notif:' || new.id::text,
    null
  );
  return new;
end;
$$;

drop trigger if exists notifications_auto_push on public.notifications;
create trigger notifications_auto_push
  after insert on public.notifications
  for each row execute function public.kaveri_notifications_auto_push();

-- ---------- 5. delivery settings rows ----------
insert into public.kaveri_app_settings (key, value, description)
values
  ('email_delivery',
   '{"mode":"pg_net","mailer_url":"https://atcncxckuokjarsxckwy.supabase.co/functions/v1/notification-mailer"}',
   'Central email outbox worker: pg_net mode POSTs outbox_id to the notification-mailer edge function'),
  ('push_delivery',
   '{"mode":"pg_net","push_url":"https://atcncxckuokjarsxckwy.supabase.co/functions/v1/notification-push"}',
   'Central push outbox worker: pg_net mode POSTs outbox_id to the notification-push edge function')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();

-- ---------- 6. cron: drive the outbox every minute ----------
select cron.unschedule('process-notification-outbox')
where exists (select 1 from cron.job where jobname = 'process-notification-outbox');

select cron.schedule(
  'process-notification-outbox',
  '* * * * *',
  $$select public.process_notification_outbox(50)$$
);

-- ---------- 7. vault secrets for the worker side ----------
-- notification_mailer_token + supabase_anon_key (gateway JWT pg_net must send).
-- secrets are NOT stored in git; values applied via vault at ops time
delete from vault.secrets where name in ('notification_mailer_token', 'supabase_anon_key');
-- token generated at ops time: select vault.create_secret('<64-hex-random>', 'notification_mailer_token');
-- gateway jwt: select vault.create_secret('<VITE_SUPABASE_ANON_KEY>', 'supabase_anon_key');

-- ---------- 8. verification ----------
select jobname, schedule, command from cron.job;
select key, value->>'mode' as mode from public.kaveri_app_settings where key in ('email_delivery','push_delivery');
select name from vault.decrypted_secrets where name in ('notification_mailer_token','supabase_anon_key');
