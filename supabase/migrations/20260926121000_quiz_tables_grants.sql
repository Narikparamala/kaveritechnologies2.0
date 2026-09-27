-- Follow-up to 20260926120000_quiz_content_rls_lockdown.sql
--
-- Faculty code paths (contentImport, faculty service, admin pages) read
-- quiz_questions / quiz_options directly. Row level security now restricts
-- those tables to staff, so granting SELECT to authenticated is safe: students
-- still see zero rows, staff see everything, anon cannot connect at all.

grant select on public.quiz_questions to authenticated;
grant select on public.quiz_options to authenticated;
