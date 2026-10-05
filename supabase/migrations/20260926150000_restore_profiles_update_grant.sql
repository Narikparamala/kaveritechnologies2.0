-- ============================================================================
-- Fix: authenticated users could not UPDATE their own profile row.
--
-- Symptoms: PATCH /rest/v1/profiles?id=eq.<own-id> → 403 "permission denied
-- for table profiles" (Postgres privilege error 42501, hit before RLS even
-- runs). This silently broke the student Profile page (name/phone/bio) and
-- the new public-profile settings (LinkedIn/GitHub/resume links + the
-- profile_public toggle).
--
-- Root cause: `authenticated` only had SELECT on public.profiles — the UPDATE
-- grant was never present in any migration (schema drift from day one; the
-- RLS policy profiles_update_self_active existed but the table grant did not).
--
-- Safety: RLS remains authoritative — profiles_update_self_active restricts
-- UPDATE to id = auth.uid() AND is_active = true, so users can still only
-- change their own row. No other table is touched.
-- ============================================================================

GRANT UPDATE ON public.profiles TO authenticated;
