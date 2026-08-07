-- ============================================================
-- RLS TIGHTENING: Scope student reads to enrolled courses
-- and faculty writes to assigned courses
-- ============================================================

-- Projects: students should only see published projects for enrolled courses
-- (or projects with no course_id that are published)
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  TO authenticated USING (
    is_admin()
    OR (is_published = true AND (
      course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM course_enrollments ce
        WHERE ce.course_id = projects.course_id AND ce.student_id = auth.uid()
      )
    ))
    OR faculty_can_access_course(course_id)
  );

-- Projects: only faculty assigned to the project's course can insert/update
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR (is_faculty() AND (course_id IS NULL OR faculty_can_access_course(course_id)))
  );

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR (is_faculty() AND (course_id IS NULL OR faculty_can_access_course(course_id)))
  ) WITH CHECK (
    is_admin()
    OR (is_faculty() AND (course_id IS NULL OR faculty_can_access_course(course_id)))
  );

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects FOR DELETE
  TO authenticated USING (
    is_admin()
    OR (is_faculty() AND faculty_can_access_course(course_id))
  );

-- Project submissions: faculty can only see submissions for their courses' projects
DROP POLICY IF EXISTS "project_submissions_select" ON project_submissions;
CREATE POLICY "project_submissions_select" ON project_submissions FOR SELECT
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN course_faculty cf ON cf.course_id = p.course_id
      WHERE p.id = project_submissions.project_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "project_submissions_update" ON project_submissions;
CREATE POLICY "project_submissions_update" ON project_submissions FOR UPDATE
  TO authenticated USING (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN course_faculty cf ON cf.course_id = p.course_id
      WHERE p.id = project_submissions.project_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    student_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN course_faculty cf ON cf.course_id = p.course_id
      WHERE p.id = project_submissions.project_id AND cf.faculty_id = auth.uid()
    )
  );

-- Quiz questions: faculty can only manage questions for their courses' quizzes
DROP POLICY IF EXISTS "quiz_questions_insert" ON quiz_questions;
CREATE POLICY "quiz_questions_insert" ON quiz_questions FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quizzes q
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quiz_questions_update" ON quiz_questions;
CREATE POLICY "quiz_questions_update" ON quiz_questions FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quizzes q
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quizzes q
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quiz_questions_delete" ON quiz_questions;
CREATE POLICY "quiz_questions_delete" ON quiz_questions FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quizzes q
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND cf.faculty_id = auth.uid()
    )
  );

-- Quiz options: same scoping via question -> quiz -> course_faculty
DROP POLICY IF EXISTS "quiz_options_insert" ON quiz_options;
CREATE POLICY "quiz_options_insert" ON quiz_options FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quiz_questions qq
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE qq.id = quiz_options.question_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quiz_options_update" ON quiz_options;
CREATE POLICY "quiz_options_update" ON quiz_options FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quiz_questions qq
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE qq.id = quiz_options.question_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quiz_questions qq
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE qq.id = quiz_options.question_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quiz_options_delete" ON quiz_options;
CREATE POLICY "quiz_options_delete" ON quiz_options FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM quiz_questions qq
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN course_faculty cf ON cf.course_id = q.course_id
      WHERE qq.id = quiz_options.question_id AND cf.faculty_id = auth.uid()
    )
  );

-- Lesson resources: tighten to faculty assigned to the lesson's course
DROP POLICY IF EXISTS "lesson_resources_insert" ON lesson_resources;
CREATE POLICY "lesson_resources_insert" ON lesson_resources FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_resources_update" ON lesson_resources;
CREATE POLICY "lesson_resources_update" ON lesson_resources FOR UPDATE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id AND cf.faculty_id = auth.uid()
    )
  ) WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id AND cf.faculty_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_resources_delete" ON lesson_resources;
CREATE POLICY "lesson_resources_delete" ON lesson_resources FOR DELETE
  TO authenticated USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      JOIN course_faculty cf ON cf.course_id = l.course_id
      WHERE l.id = lesson_resources.lesson_id AND cf.faculty_id = auth.uid()
    )
  );
