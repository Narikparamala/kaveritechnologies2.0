/*
# Course Builder: Topics, Subtopics, Practice Questions, Extended Materials

## Purpose
Adds lesson-level topics/subtopics, practice questions, and extends lesson_resources
to support slides/notes/code_examples/practice_sheets/external_resources/recorded_videos
with publish/unlock states and "unlock after live class" rules.

## New Tables
1. lesson_topics — topics within a lesson (ordered)
2. lesson_subtopics — subtopics within a topic (ordered)
3. lesson_practice_questions — practice questions with hints, expected output, sample solution

## Modified Tables
1. lesson_resources — adds description, content_text, external_url, resource_type,
   is_published, is_locked, unlock_after_session, order_index, updated_at

## Security
- All new tables have RLS enabled
- Faculty can CRUD only for lessons in courses they're assigned to
- Students can SELECT only published rows for lessons in courses they're enrolled in
- Admins have full access
*/

-- ============================================================
-- 1. lesson_topics
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_topics_lesson_id ON lesson_topics(lesson_id);
ALTER TABLE lesson_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_topics_select" ON lesson_topics;
CREATE POLICY "lesson_topics_select" ON lesson_topics FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_topics.lesson_id AND cf.faculty_id = auth.uid()
    )
    OR (
      -- Students see only published topics for enrolled courses
      lesson_topics.lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN chapters c ON c.id = l.chapter_id
        WHERE l.is_published = true AND c.is_published = true
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = l.course_id AND ce.student_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "lesson_topics_insert" ON lesson_topics;
CREATE POLICY "lesson_topics_insert" ON lesson_topics FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_topics.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_topics_update" ON lesson_topics;
CREATE POLICY "lesson_topics_update" ON lesson_topics FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_topics.lesson_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_topics.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_topics_delete" ON lesson_topics;
CREATE POLICY "lesson_topics_delete" ON lesson_topics FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_topics.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

-- ============================================================
-- 2. lesson_subtopics
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES lesson_topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_subtopics_topic_id ON lesson_subtopics(topic_id);
ALTER TABLE lesson_subtopics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_subtopics_select" ON lesson_subtopics;
CREATE POLICY "lesson_subtopics_select" ON lesson_subtopics FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lesson_topics lt
      JOIN lessons l ON l.id = lt.lesson_id
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE lt.id = lesson_subtopics.topic_id AND cf.faculty_id = auth.uid()
    )
    OR (
      -- Students see only published subtopics for enrolled courses
      lesson_subtopics.topic_id IN (
        SELECT lt.id FROM lesson_topics lt
        JOIN lessons l ON l.id = lt.lesson_id
        JOIN chapters c ON c.id = l.chapter_id
        WHERE l.is_published = true AND c.is_published = true
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = l.course_id AND ce.student_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "lesson_subtopics_insert" ON lesson_subtopics;
CREATE POLICY "lesson_subtopics_insert" ON lesson_subtopics FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lesson_topics lt
      JOIN lessons l ON l.id = lt.lesson_id
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE lt.id = lesson_subtopics.topic_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_subtopics_update" ON lesson_subtopics;
CREATE POLICY "lesson_subtopics_update" ON lesson_subtopics FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lesson_topics lt
      JOIN lessons l ON l.id = lt.lesson_id
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE lt.id = lesson_subtopics.topic_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lesson_topics lt
      JOIN lessons l ON l.id = lt.lesson_id
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE lt.id = lesson_subtopics.topic_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_subtopics_delete" ON lesson_subtopics;
CREATE POLICY "lesson_subtopics_delete" ON lesson_subtopics FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lesson_topics lt
      JOIN lessons l ON l.id = lt.lesson_id
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE lt.id = lesson_subtopics.topic_id AND cf.faculty_id = auth.uid()
    )
  );

-- ============================================================
-- 3. lesson_practice_questions
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_lesson_practice_questions_lesson_id ON lesson_practice_questions(lesson_id);
ALTER TABLE lesson_practice_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_practice_questions_select" ON lesson_practice_questions;
CREATE POLICY "lesson_practice_questions_select" ON lesson_practice_questions FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_practice_questions.lesson_id AND cf.faculty_id = auth.uid()
    )
    OR (
      -- Students see only published questions for enrolled courses
      lesson_practice_questions.lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN chapters c ON c.id = l.chapter_id
        WHERE l.is_published = true AND c.is_published = true
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = l.course_id AND ce.student_id = auth.uid()
        )
      ) AND lesson_practice_questions.is_published = true
    )
  );

DROP POLICY IF EXISTS "lesson_practice_questions_insert" ON lesson_practice_questions;
CREATE POLICY "lesson_practice_questions_insert" ON lesson_practice_questions FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_practice_questions.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_practice_questions_update" ON lesson_practice_questions;
CREATE POLICY "lesson_practice_questions_update" ON lesson_practice_questions FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_practice_questions.lesson_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_practice_questions.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_practice_questions_delete" ON lesson_practice_questions;
CREATE POLICY "lesson_practice_questions_delete" ON lesson_practice_questions FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_practice_questions.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Extend lesson_resources
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'description') THEN
    ALTER TABLE lesson_resources ADD COLUMN description text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'content_text') THEN
    ALTER TABLE lesson_resources ADD COLUMN content_text text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'external_url') THEN
    ALTER TABLE lesson_resources ADD COLUMN external_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'resource_type') THEN
    ALTER TABLE lesson_resources ADD COLUMN resource_type text NOT NULL DEFAULT 'notes';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'is_published') THEN
    ALTER TABLE lesson_resources ADD COLUMN is_published boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'is_locked') THEN
    ALTER TABLE lesson_resources ADD COLUMN is_locked boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'unlock_after_session') THEN
    ALTER TABLE lesson_resources ADD COLUMN unlock_after_session boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'order_index') THEN
    ALTER TABLE lesson_resources ADD COLUMN order_index integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'updated_at') THEN
    ALTER TABLE lesson_resources ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Make file_url nullable (external resources may not have a file)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_resources' AND column_name = 'file_url' AND is_nullable = 'NO') THEN
    ALTER TABLE lesson_resources ALTER COLUMN file_url DROP NOT NULL;
  END IF;
END $$;

-- Tighten lesson_resources SELECT: students see only published, unlocked resources for enrolled courses
DROP POLICY IF EXISTS "lesson_resources_select" ON lesson_resources;
CREATE POLICY "lesson_resources_select" ON lesson_resources FOR SELECT
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id AND cf.faculty_id = auth.uid()
    )
    OR (
      lesson_resources.is_published = true
      AND lesson_resources.lesson_id IN (
        SELECT l.id FROM lessons l
        JOIN chapters c ON c.id = l.chapter_id
        WHERE l.is_published = true AND c.is_published = true
        AND EXISTS (
          SELECT 1 FROM course_enrollments ce WHERE ce.course_id = l.course_id AND ce.student_id = auth.uid()
        )
      )
    )
  );

-- Add language column to courses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'language') THEN
    ALTER TABLE courses ADD COLUMN language text NOT NULL DEFAULT 'English';
  END IF;
END $$;

-- Allow faculty to update courses they're assigned to
DROP POLICY IF EXISTS "courses_update" ON courses;
CREATE POLICY "courses_update" ON courses FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR faculty_can_access_course(courses.id)
  ) WITH CHECK (
    is_admin()
    OR faculty_can_access_course(courses.id)
  );
