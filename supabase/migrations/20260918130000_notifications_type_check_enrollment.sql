-- Fix enrollment-request creation: notification type check rejected 'enrollment'
--
-- Found by E2E: inserting an enrollment_request fires
-- on_enrollment_request_created -> process_enrollment_event -> kaveri_notify
-- with type='enrollment' (staff alert). notifications_type_check did not
-- include that value, so the trigger raised and the REQUEST ITSELF was rolled
-- back — students could not file paid-course access requests at all (HTTP 400).
--
-- The app's NotificationType union (src/types/database.ts) also uses
-- 'workshop' | 'exam' | 'ecosystem' | 'system'; widen the check to match so
-- every caller that compiles against the TS type can actually insert.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'info'::text, 'success'::text, 'warning'::text, 'error'::text,
    'assignment'::text, 'announcement'::text, 'grade'::text, 'submission'::text,
    'quiz'::text, 'project'::text, 'live_class'::text, 'student'::text,
    'support'::text, 'enrollment'::text, 'workshop'::text, 'exam'::text,
    'ecosystem'::text, 'system'::text
  ]));
