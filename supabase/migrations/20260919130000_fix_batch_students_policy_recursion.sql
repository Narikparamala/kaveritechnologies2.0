-- Fix: infinite recursion (42P17) when inserting batch_students.
--
-- 20260919120000 added batch_students policies that query `batches` — but
-- the batches SELECT policy `student_read_own_batch` queries `batch_students`
-- back, so Postgres detects a policy cycle and every INSERT/UPDATE/DELETE
-- by faculty fails with "infinite recursion detected in policy".
--
-- Fix: move the batch→course scope check into a SECURITY DEFINER helper.
-- Running as the function owner bypasses RLS on the inner `batches` read,
-- breaking the cycle. Policies below call the helper instead of joining
-- batches directly.

CREATE OR REPLACE FUNCTION public.faculty_can_manage_batch(target_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('faculty', 'super_admin')
      AND p.is_active = true
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.batches b
      JOIN public.course_faculty cf ON cf.course_id = b.course_id
      WHERE b.id = target_batch_id
        AND cf.faculty_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.batch_faculty bf
      WHERE bf.batch_id = target_batch_id
        AND bf.faculty_id = (SELECT auth.uid())
    )
  );
$function$;

-- Revoke from anon; authenticated callers just need EXECUTE to use it in policies.
REVOKE ALL ON FUNCTION public.faculty_can_manage_batch(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.faculty_can_manage_batch(uuid) TO authenticated;

-- Rewrite the three faculty policies to use the helper (no direct batches join).
DROP POLICY IF EXISTS faculty_manage_batch_students ON public.batch_students;
CREATE POLICY faculty_manage_batch_students
  ON public.batch_students
  FOR INSERT
  TO authenticated
  WITH CHECK (public.faculty_can_manage_batch(batch_students.batch_id));

DROP POLICY IF EXISTS faculty_update_batch_students ON public.batch_students;
CREATE POLICY faculty_update_batch_students
  ON public.batch_students
  FOR UPDATE
  TO authenticated
  USING (public.faculty_can_manage_batch(batch_students.batch_id))
  WITH CHECK (public.faculty_can_manage_batch(batch_students.batch_id));

DROP POLICY IF EXISTS faculty_delete_batch_students ON public.batch_students;
CREATE POLICY faculty_delete_batch_students
  ON public.batch_students
  FOR DELETE
  TO authenticated
  USING (public.faculty_can_manage_batch(batch_students.batch_id));
