/*
# Enhance quiz questions for advanced question types

1. Modified Tables
  - `quiz_questions`
    - `difficulty` (text, default 'medium') - question difficulty: easy, medium, hard
    - `code_snippet` (text, nullable) - code snippet displayed with the question
    - `image_url` (text, nullable) - image URL for visual questions
    - `enable_playground` (boolean, default false) - whether to show Python playground for coding questions
    - `correct_answer_text` (text, nullable) - correct answer for fill_in_blank and code_output types
    - `time_limit_seconds` (integer, nullable) - per-question time limit

2. Notes
  - Extends question_type to support: mcq, multiple_select, true_false, fill_in_blank, code_output, coding
  - fill_in_blank and code_output use correct_answer_text instead of options
  - coding questions use enable_playground to show integrated Python editor
  - No data loss - all additions are nullable or have defaults
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'difficulty') THEN
    ALTER TABLE quiz_questions ADD COLUMN difficulty text NOT NULL DEFAULT 'medium';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'code_snippet') THEN
    ALTER TABLE quiz_questions ADD COLUMN code_snippet text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'image_url') THEN
    ALTER TABLE quiz_questions ADD COLUMN image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'enable_playground') THEN
    ALTER TABLE quiz_questions ADD COLUMN enable_playground boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'correct_answer_text') THEN
    ALTER TABLE quiz_questions ADD COLUMN correct_answer_text text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quiz_questions' AND column_name = 'time_limit_seconds') THEN
    ALTER TABLE quiz_questions ADD COLUMN time_limit_seconds integer;
  END IF;
END $$;
