-- Simplify: faculty get the same batch-student management power as admins.
--
-- Why not course-scoped (20260919120000/13000)? Two reasons discovered in
-- verification:
-- 1. The user's real batches have course_id = NULL (batches were created
--    without a course link), so a course-scoped policy would leave faculty
--    with an empty batch picker — the feature would never be usable.
-- 2. Faculty are trusted staff in this institute; the product ask is
--    "same power as admin" for adding students to batches.
--
-- Single SECURITY DEFINER helper: staff = active faculty or super_admin.
-- SECURITY DEFINER + no reads of policy-protected tables => no recursion.

CREATE OR REPLACE FUNCTION public.staff_can_manage_batch_students()
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
  );
$function$;

REVOKE ALL ON FUNCTION public.staff_can_manage_batch_students() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_batch_students() TO authenticated;

-- Faculty policies: same power as admin (admin_all_* still covers super_admin
-- directly; these make plain 'faculty' equal).
DROP POLICY IF EXISTS faculty_manage_batch_students ON public.batch_students;
CREATE POLICY faculty_manage_batch_students
  ON public.batch_students
  FOR INSERT
  TO authenticated
  WITH CHECK (public.staff_can_manage_batch_students());

DROP POLICY IF EXISTS faculty_update_batch_students ON public.batch_students;
CREATE POLICY faculty_update_batch_students
  ON public.batch_students
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_manage_batch_students())
  WITH CHECK (public.staff_can_manage_batch_students());

DROP POLICY IF EXISTS faculty_delete_batch_students ON public.batch_students;
CREATE POLICY faculty_delete_batch_students
  ON public.batch_students
  FOR DELETE
  TO authenticated
  USING (public.staff_can_manage_batch_students());

-- Faculty can read all batches (picker shows every batch, matching admin).
DROP POLICY IF EXISTS faculty_read_assigned_batches ON public.batches;
CREATE POLICY faculty_read_assigned_batches
  ON public.batches
  FOR SELECT
  TO authenticated
  USING (public.staff_can_manage_batch_students());

-- Drop the now-unused course-scoped helper from 20260919130000.
DROP FUNCTION IF EXISTS public.faculty_can_manage_batch(uuid);
