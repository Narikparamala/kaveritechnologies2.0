/*
# Add lesson_id to assignments table

Allows assignments to be tied directly to a specific lesson within a chapter,
supporting the course builder's lesson-level assignment tab.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assignments' AND column_name = 'lesson_id') THEN
    ALTER TABLE assignments ADD COLUMN lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;
  END IF;
END $$;
