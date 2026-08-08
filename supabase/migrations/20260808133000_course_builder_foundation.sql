/*
  Kaveri Technologies Academy - Course Builder Foundation

  This migration is intentionally idempotent and scoped to the current MVP.
  It adds the course-content tables required by the faculty Course Builder
  without replacing courses, enrollments, assignments, submissions, or the
  coding question bank.

  Authentication is intentionally not required in the current MVP. The RLS
  policies below allow the anon and authenticated API roles to use these
  tables. Replace these policies with role-based policies before production.
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.course_builder_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Chapters and lessons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapters_course_order
  ON public.chapters(course_id, order_index);

DROP TRIGGER IF EXISTS course_builder_chapters_updated_at ON public.chapters;
CREATE TRIGGER course_builder_chapters_updated_at
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.course_builder_set_updated_at();

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  video_url text,
  notes_markdown text,
  code_example text,
  explanation text,
  order_index integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 10,
  is_published boolean NOT NULL DEFAULT false,
  is_free_preview boolean NOT NULL DEFAULT false,
  xp_reward integer NOT NULL DEFAULT 10,
  teaching_mode text NOT NULL DEFAULT 'live_class'
    CHECK (teaching_mode IN ('live_class', 'recorded_video')),
  enable_coding_playground boolean NOT NULL DEFAULT false,
  slides_url text,
  notes_url text,
  requires_previous_lesson_completion boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_chapter_order
  ON public.lessons(chapter_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lessons_course
  ON public.lessons(course_id);

DROP TRIGGER IF EXISTS course_builder_lessons_updated_at ON public.lessons;
CREATE TRIGGER course_builder_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.course_builder_set_updated_at();

-- Defensive additions when lessons already existed with an older shape.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS notes_markdown text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS code_example text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS explanation text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 10;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 10;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS teaching_mode text NOT NULL DEFAULT 'live_class';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS enable_coding_playground boolean NOT NULL DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS slides_url text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS notes_url text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS requires_previous_lesson_completion boolean NOT NULL DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Allow assignments created from a lesson tab to reference that lesson.
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS lesson_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignments_lesson_id_fkey'
      AND conrelid = 'public.assignments'::regclass
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Topics, subtopics, practice, and materials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lesson_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_topics_lesson_order
  ON public.lesson_topics(lesson_id, order_index);

CREATE TABLE IF NOT EXISTS public.lesson_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.lesson_topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_subtopics_topic_order
  ON public.lesson_subtopics(topic_id, order_index);

CREATE TABLE IF NOT EXISTS public.lesson_practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  hint text,
  expected_output text,
  sample_solution text,
  show_solution boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_practice_lesson_order
  ON public.lesson_practice_questions(lesson_id, order_index);

CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  content_text text,
  external_url text,
  file_url text,
  file_type text,
  resource_type text NOT NULL DEFAULT 'notes',
  is_published boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  unlock_after_session boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS content_text text;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'notes';
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS unlock_after_session boolean NOT NULL DEFAULT false;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.lesson_resources ALTER COLUMN file_url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson_order
  ON public.lesson_resources(lesson_id, order_index);

CREATE TABLE IF NOT EXISTS public.lesson_file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  file_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_file_uploads_lesson
  ON public.lesson_file_uploads(lesson_id);

-- ---------------------------------------------------------------------------
-- Lesson quizzes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  pass_percentage integer NOT NULL DEFAULT 70,
  time_limit_minutes integer,
  xp_reward integer NOT NULL DEFAULT 50,
  is_published boolean NOT NULL DEFAULT false,
  show_answers boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS lesson_id uuid;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS pass_percentage integer NOT NULL DEFAULT 70;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS time_limit_minutes integer;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 50;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS show_answers boolean NOT NULL DEFAULT true;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quizzes_lesson_id_fkey'
      AND conrelid = 'public.quizzes'::regclass
  ) THEN
    ALTER TABLE public.quizzes
      ADD CONSTRAINT quizzes_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON public.quizzes(lesson_id);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq',
  explanation text,
  order_index integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_order
  ON public.quiz_questions(quiz_id, order_index);

CREATE TABLE IF NOT EXISTS public.quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question_order
  ON public.quiz_options(question_id, order_index);

-- ---------------------------------------------------------------------------
-- Lesson live-session references
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  session_date timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  google_meet_url text,
  status text NOT NULL DEFAULT 'scheduled',
  slides_unlocked boolean NOT NULL DEFAULT false,
  materials_unlocked boolean NOT NULL DEFAULT false,
  attendance_required boolean NOT NULL DEFAULT true,
  preparation_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS chapter_id uuid;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS lesson_id uuid;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS google_meet_url text;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS slides_unlocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS materials_unlocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS attendance_required boolean NOT NULL DEFAULT true;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS preparation_notes text;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_live_sessions_lesson_date
  ON public.live_sessions(lesson_id, session_date);

-- ---------------------------------------------------------------------------
-- MVP API access
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'chapters',
    'lessons',
    'lesson_topics',
    'lesson_subtopics',
    'lesson_practice_questions',
    'lesson_resources',
    'lesson_file_uploads',
    'quizzes',
    'quiz_questions',
    'quiz_options',
    'live_sessions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    policy_name := table_name || '_mvp_access';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      policy_name,
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated',
      table_name
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
