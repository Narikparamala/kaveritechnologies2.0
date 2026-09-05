-- Kaveri LMS — baseline schema drift repair (forward, LOCAL + production safe)
--
-- Production Supabase has applied migrations through 20260901102000 but is
-- missing baseline objects that the original initial schema (20260708072337)
-- should have created. The next migration (20260902120000) fails because
-- public.lesson_progress does not exist.
--
-- Root cause: the initial schema migration was not fully applied to
-- production, or one or more baseline tables were dropped outside the
-- migration chain.
--
-- This repair uses IF NOT EXISTS / IF EXISTS throughout so it is safe for:
--   - Production (objects missing → created)
--   - Local dev (objects present → no-op)
--
-- No existing data is touched. No tables are dropped. No migrations are
-- marked as applied.

-- ====================================================================
-- 1. lesson_progress — required by 20260902120000 (complete_lesson) and
--    every subsequent lesson-progression migration
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  watch_time_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON public.lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_course ON public.lesson_progress(course_id);

DROP TRIGGER IF EXISTS update_lesson_progress_updated_at ON public.lesson_progress;
CREATE TRIGGER update_lesson_progress_updated_at
  BEFORE UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_progress_select ON public.lesson_progress;
CREATE POLICY lesson_progress_select ON public.lesson_progress FOR SELECT
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM course_faculty
      WHERE course_id = public.lesson_progress.course_id AND faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lesson_progress_insert ON public.lesson_progress;
CREATE POLICY lesson_progress_insert ON public.lesson_progress FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_progress_update ON public.lesson_progress;
CREATE POLICY lesson_progress_update ON public.lesson_progress FOR UPDATE
  TO authenticated USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS lesson_progress_delete ON public.lesson_progress;
CREATE POLICY lesson_progress_delete ON public.lesson_progress FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ====================================================================
-- 2. xp_transactions — required by 20260902120000 (complete_lesson) and
--    later XP/level migrations
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_student ON public.xp_transactions(student_id);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xp_transactions_select ON public.xp_transactions;
CREATE POLICY xp_transactions_select ON public.xp_transactions FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS xp_transactions_insert ON public.xp_transactions;
CREATE POLICY xp_transactions_insert ON public.xp_transactions FOR INSERT
  TO authenticated WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS xp_transactions_update ON public.xp_transactions;
CREATE POLICY xp_transactions_update ON public.xp_transactions FOR UPDATE
  TO authenticated USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS xp_transactions_delete ON public.xp_transactions;
CREATE POLICY xp_transactions_delete ON public.xp_transactions FOR DELETE
  TO authenticated USING (student_id = auth.uid() OR is_admin());

-- ====================================================================
-- 3. certificates — required by 20260902120000 (complete_lesson inserts)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  certificate_uid text UNIQUE NOT NULL DEFAULT 'KTA-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_student ON public.certificates(student_id);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certificates_select ON public.certificates;
CREATE POLICY certificates_select ON public.certificates FOR SELECT
  TO authenticated USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS certificates_insert ON public.certificates;
CREATE POLICY certificates_insert ON public.certificates FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS certificates_update ON public.certificates;
CREATE POLICY certificates_update ON public.certificates FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS certificates_delete ON public.certificates;
CREATE POLICY certificates_delete ON public.certificates FOR DELETE
  TO authenticated USING (is_admin());