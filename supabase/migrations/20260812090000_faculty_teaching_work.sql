-- Faculty teaching work: faculty and super admins share scheduling power.
-- Delivery mode is a direct faculty choice; only real overlaps and daily workload are blocked.

-- This project can be migrated from an older database whose migration history says
-- batch management was applied even when the physical batch tables are absent.
-- Keep the teaching-work migration self-contained by restoring that foundation first.

CREATE TABLE IF NOT EXISTS public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  max_students integer NOT NULL DEFAULT 30 CHECK (max_students > 0),
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_valid_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.batch_faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  faculty_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'lead' CHECK (role IN ('lead', 'assistant', 'guest')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS public.batch_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'removed', 'completed', 'transferred')),
  UNIQUE (batch_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.batch_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  topic text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batch_schedules_valid_time CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.batch_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  content text,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batches_course ON public.batches(course_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_batch_faculty_batch ON public.batch_faculty(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_faculty_faculty ON public.batch_faculty(faculty_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_batch ON public.batch_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_student ON public.batch_students(student_id);
CREATE INDEX IF NOT EXISTS idx_batch_schedules_batch ON public.batch_schedules(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_announcements_batch ON public.batch_announcements(batch_id);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_announcements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_faculty TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_announcements TO authenticated;

DROP POLICY IF EXISTS "admin_all_batches" ON public.batches;
CREATE POLICY "admin_all_batches" ON public.batches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "faculty_read_assigned_batches" ON public.batches;
CREATE POLICY "faculty_read_assigned_batches" ON public.batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batches.id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "student_read_own_batch" ON public.batches;
CREATE POLICY "student_read_own_batch" ON public.batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_students bs
    WHERE bs.batch_id = batches.id AND bs.student_id = (SELECT auth.uid()) AND bs.status = 'active'));

DROP POLICY IF EXISTS "admin_all_batch_faculty" ON public.batch_faculty;
CREATE POLICY "admin_all_batch_faculty" ON public.batch_faculty FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "faculty_read_batch_faculty" ON public.batch_faculty;
CREATE POLICY "faculty_read_batch_faculty" ON public.batch_faculty FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'faculty'));

DROP POLICY IF EXISTS "admin_all_batch_students" ON public.batch_students;
CREATE POLICY "admin_all_batch_students" ON public.batch_students FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "faculty_read_batch_students" ON public.batch_students;
CREATE POLICY "faculty_read_batch_students" ON public.batch_students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_students.batch_id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "faculty_manage_batch_students" ON public.batch_students;
CREATE POLICY "faculty_manage_batch_students" ON public.batch_students FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_students.batch_id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "faculty_update_batch_students" ON public.batch_students;
CREATE POLICY "faculty_update_batch_students" ON public.batch_students FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_students.batch_id AND bf.faculty_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_students.batch_id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "student_read_own_batch_students" ON public.batch_students;
CREATE POLICY "student_read_own_batch_students" ON public.batch_students FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "admin_all_batch_schedules" ON public.batch_schedules;
CREATE POLICY "admin_all_batch_schedules" ON public.batch_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "faculty_manage_batch_schedules" ON public.batch_schedules;
CREATE POLICY "faculty_manage_batch_schedules" ON public.batch_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_schedules.batch_id AND bf.faculty_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_schedules.batch_id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "student_read_batch_schedules" ON public.batch_schedules;
CREATE POLICY "student_read_batch_schedules" ON public.batch_schedules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_students bs
    WHERE bs.batch_id = batch_schedules.batch_id AND bs.student_id = (SELECT auth.uid()) AND bs.status = 'active'));

DROP POLICY IF EXISTS "admin_all_batch_announcements" ON public.batch_announcements;
CREATE POLICY "admin_all_batch_announcements" ON public.batch_announcements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));
DROP POLICY IF EXISTS "faculty_manage_batch_announcements" ON public.batch_announcements;
CREATE POLICY "faculty_manage_batch_announcements" ON public.batch_announcements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_announcements.batch_id AND bf.faculty_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.batch_faculty bf
    WHERE bf.batch_id = batch_announcements.batch_id AND bf.faculty_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "student_read_batch_announcements" ON public.batch_announcements;
CREATE POLICY "student_read_batch_announcements" ON public.batch_announcements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.batch_students bs
    WHERE bs.batch_id = batch_announcements.batch_id AND bs.student_id = (SELECT auth.uid()) AND bs.status = 'active'));

CREATE TABLE IF NOT EXISTS public.faculty_teaching_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  live_session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  delivery_mode text NOT NULL DEFAULT 'live_class'
    CHECK (delivery_mode IN ('live_class', 'recorded_video', 'hybrid')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  source text NOT NULL DEFAULT 'faculty'
    CHECK (source IN ('faculty', 'admin')),
  recording_url text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_teaching_work_valid_time CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.faculty_work_preferences (
  faculty_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_workload_limit_minutes integer NOT NULL DEFAULT 480
    CHECK (daily_workload_limit_minutes BETWEEN 60 AND 960),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faculty_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  request_type text NOT NULL
    CHECK (request_type IN ('new_assignment', 'schedule_swap', 'availability', 'assistant', 'capacity')),
  details text NOT NULL CHECK (length(trim(details)) > 0),
  requested_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  response_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faculty_teaching_work_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faculty_teaching_work_faculty_date
  ON public.faculty_teaching_work(faculty_id, scheduled_date, start_time);
CREATE INDEX IF NOT EXISTS idx_faculty_teaching_work_batch
  ON public.faculty_teaching_work(batch_id);
CREATE INDEX IF NOT EXISTS idx_faculty_work_requests_faculty_status
  ON public.faculty_work_requests(faculty_id, status);
CREATE INDEX IF NOT EXISTS idx_faculty_teaching_work_audit_item
  ON public.faculty_teaching_work_audit(work_item_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_faculty_teaching_work()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_minutes numeric;
  work_limit integer;
  new_minutes numeric;
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.faculty_teaching_work w
    WHERE w.faculty_id = NEW.faculty_id
      AND w.scheduled_date = NEW.scheduled_date
      AND w.status <> 'cancelled'
      AND w.id <> NEW.id
      AND NEW.start_time < w.end_time
      AND NEW.end_time > w.start_time
  ) THEN
    RAISE EXCEPTION 'Schedule conflict: this teaching work overlaps another active item.';
  END IF;

  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (w.end_time - w.start_time)) / 60), 0)
  INTO existing_minutes
  FROM public.faculty_teaching_work w
  WHERE w.faculty_id = NEW.faculty_id
    AND w.scheduled_date = NEW.scheduled_date
    AND w.status <> 'cancelled'
    AND w.id <> NEW.id;

  SELECT COALESCE(p.daily_workload_limit_minutes, 480)
  INTO work_limit
  FROM public.faculty_work_preferences p
  WHERE p.faculty_id = NEW.faculty_id;
  work_limit := COALESCE(work_limit, 480);
  new_minutes := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;

  IF existing_minutes + new_minutes > work_limit THEN
    RAISE EXCEPTION 'Daily workload limit exceeded (% minutes).', work_limit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_faculty_teaching_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.faculty_teaching_work_audit
    (work_item_id, actor_id, action, previous_values, new_values)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    (SELECT auth.uid()),
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_faculty_teaching_work() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_faculty_teaching_work_trigger ON public.faculty_teaching_work;
CREATE TRIGGER validate_faculty_teaching_work_trigger
  BEFORE INSERT OR UPDATE ON public.faculty_teaching_work
  FOR EACH ROW EXECUTE FUNCTION public.validate_faculty_teaching_work();

DROP TRIGGER IF EXISTS audit_faculty_teaching_work_trigger ON public.faculty_teaching_work;
CREATE TRIGGER audit_faculty_teaching_work_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.faculty_teaching_work
  FOR EACH ROW EXECUTE FUNCTION public.audit_faculty_teaching_work();

ALTER TABLE public.faculty_teaching_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_work_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_work_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_teaching_work_audit ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_teaching_work TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.faculty_work_preferences TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.faculty_work_requests TO authenticated;
GRANT SELECT ON public.faculty_teaching_work_audit TO authenticated;

CREATE POLICY "Faculty view own teaching work" ON public.faculty_teaching_work
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Faculty create own teaching work" ON public.faculty_teaching_work
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = faculty_id
    AND (
      (batch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.batch_faculty bf
        WHERE bf.batch_id = faculty_teaching_work.batch_id AND bf.faculty_id = (SELECT auth.uid())
      ))
      OR
      (batch_id IS NULL AND (course_id IS NULL OR EXISTS (
        SELECT 1 FROM public.course_faculty cf
        WHERE cf.course_id = faculty_teaching_work.course_id AND cf.faculty_id = (SELECT auth.uid())
      )))
    )
  );
CREATE POLICY "Faculty update own teaching work" ON public.faculty_teaching_work
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = faculty_id)
  WITH CHECK (
    (SELECT auth.uid()) = faculty_id
    AND (
      (batch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.batch_faculty bf
        WHERE bf.batch_id = faculty_teaching_work.batch_id AND bf.faculty_id = (SELECT auth.uid())
      ))
      OR
      (batch_id IS NULL AND (course_id IS NULL OR EXISTS (
        SELECT 1 FROM public.course_faculty cf
        WHERE cf.course_id = faculty_teaching_work.course_id AND cf.faculty_id = (SELECT auth.uid())
      )))
    )
  );
CREATE POLICY "Faculty delete own teaching work" ON public.faculty_teaching_work
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Admins manage all teaching work" ON public.faculty_teaching_work
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

CREATE POLICY "Faculty view own work preferences" ON public.faculty_work_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Faculty create own work preferences" ON public.faculty_work_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Faculty update own work preferences" ON public.faculty_work_preferences
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = faculty_id)
  WITH CHECK ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Admins manage all work preferences" ON public.faculty_work_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

CREATE POLICY "Faculty view own work requests" ON public.faculty_work_requests
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Faculty create own work requests" ON public.faculty_work_requests
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = faculty_id);
CREATE POLICY "Faculty delete own pending requests" ON public.faculty_work_requests
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = faculty_id AND status = 'pending');
CREATE POLICY "Admins manage all work requests" ON public.faculty_work_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

CREATE POLICY "Faculty view own teaching audit" ON public.faculty_teaching_work_audit
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.faculty_teaching_work w
      WHERE w.id = faculty_teaching_work_audit.work_item_id AND w.faculty_id = (SELECT auth.uid()))
  );
CREATE POLICY "Admins view all teaching audit" ON public.faculty_teaching_work_audit
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin')
  );

NOTIFY pgrst, 'reload schema';
