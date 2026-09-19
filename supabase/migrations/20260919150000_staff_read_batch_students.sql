-- Staff need SELECT on batch_students to match their write power:
-- - PostgREST INSERT ... Prefer:return=representation re-reads the new row
--   and requires it to pass a SELECT policy, else the insert surfaces as 403.
-- - The "Add to Batch" UI checks existing memberships (joinedBatchIds) via
--   batch_students?student_id=eq.X — faculty need read for that too.

CREATE POLICY staff_read_batch_students
  ON public.batch_students
  FOR SELECT
  TO authenticated
  USING (public.staff_can_manage_batch_students());
