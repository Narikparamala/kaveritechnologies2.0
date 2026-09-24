-- Seed core platform settings.
-- The settings page reads every row of platform_settings; without these the
-- page renders an empty card and the content auto-update feature has no switch.
insert into public.platform_settings (key, value, description)
values
  ('content_auto_update', 'true', 'Show students the latest technology trends feed on their dashboard'),
  ('maintenance_mode', 'false', 'When enabled, show a maintenance notice and block student access')
on conflict (key) do nothing;
