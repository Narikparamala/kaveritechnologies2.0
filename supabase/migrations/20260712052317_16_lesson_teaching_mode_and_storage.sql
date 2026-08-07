/*
# Lesson Teaching Mode & Coding Playground

## Summary
Adds teaching mode support to lessons and enables the coding playground toggle.

## Changes

### Modified Tables

#### lessons
- `teaching_mode` (text, default 'live_class') — how this lesson is delivered: 'live_class' or 'recorded_video'
- `enable_coding_playground` (boolean, default false) — whether the embedded Python Playground is shown in this lesson
- `slides_url` (text, nullable) — direct URL to uploaded slides (PDF/PPT/PPTX)
- `notes_url` (text, nullable) — direct URL to uploaded notes file

## Notes
- teaching_mode = 'live_class': Faculty uploads slides + notes and conducts class through Google Meet
- teaching_mode = 'recorded_video': Faculty uploads slides + notes + recorded video
- enable_coding_playground: When true, students see embedded Python Playground in the lesson view
- Existing lessons default to 'live_class' and playground disabled
*/

-- Add teaching_mode to lessons
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'teaching_mode'
  ) THEN
    ALTER TABLE lessons ADD COLUMN teaching_mode text NOT NULL DEFAULT 'live_class'
      CHECK (teaching_mode IN ('live_class', 'recorded_video'));
  END IF;
END $$;

-- Add enable_coding_playground to lessons
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'enable_coding_playground'
  ) THEN
    ALTER TABLE lessons ADD COLUMN enable_coding_playground boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add slides_url to lessons (for direct uploads)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'slides_url'
  ) THEN
    ALTER TABLE lessons ADD COLUMN slides_url text;
  END IF;
END $$;

-- Add notes_url to lessons (for direct file uploads of notes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'notes_url'
  ) THEN
    ALTER TABLE lessons ADD COLUMN notes_url text;
  END IF;
END $$;

-- Ensure assignment_submissions has allow_resubmit support via assignments table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignments' AND column_name = 'allow_resubmit'
  ) THEN
    ALTER TABLE assignments ADD COLUMN allow_resubmit boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Ensure assignments has lesson_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignments' AND column_name = 'lesson_id'
  ) THEN
    ALTER TABLE assignments ADD COLUMN lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure quizzes has lesson_id column (should already exist per migration 1)
-- This is defensive, no-op if exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'lesson_id'
  ) THEN
    ALTER TABLE quizzes ADD COLUMN lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create lesson_files storage bucket if not exists
-- Note: Storage buckets are managed via Supabase Dashboard or API, not SQL
-- We add a lesson_file_uploads tracking table for uploaded files

CREATE TABLE IF NOT EXISTS lesson_file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('slides', 'notes', 'resource', 'video')),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lesson_file_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faculty_insert_lesson_files" ON lesson_file_uploads;
CREATE POLICY "faculty_insert_lesson_files" ON lesson_file_uploads FOR INSERT
  TO authenticated WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "faculty_select_lesson_files" ON lesson_file_uploads;
CREATE POLICY "faculty_select_lesson_files" ON lesson_file_uploads FOR SELECT
  TO authenticated USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_id AND cf.faculty_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_enrollments ce ON ce.course_id = l.course_id
      WHERE l.id = lesson_id AND ce.student_id = auth.uid() AND ce.access_status = 'active'
    )
  );

DROP POLICY IF EXISTS "faculty_delete_lesson_files" ON lesson_file_uploads;
CREATE POLICY "faculty_delete_lesson_files" ON lesson_file_uploads FOR DELETE
  TO authenticated USING (uploaded_by = auth.uid());
