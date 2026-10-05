-- ============================================================================
-- Public shareable student profiles
-- 1. profiles: linkedin_url, github_url, resume_url, profile_public, profile_slug
-- 2. Anon can read ONLY public profiles and ONLY safe columns (never email/phone).
-- 3. SECURITY DEFINER RPC get_public_profile(slug) aggregates performance stats
--    (coding questions, mini-projects, quizzes, courses, batches) for the
--    shareable /u/:slug page used to send profiles to CEOs/HRs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_slug text;

-- Backfill a unique random slug for every existing profile.
UPDATE public.profiles
   SET profile_slug = substr(md5(random()::text || clock_timestamp()::text), 1, 10)
 WHERE profile_slug IS NULL;

-- Ensure every row always has one (covers rows inserted around the ALTER).
UPDATE public.profiles
   SET profile_slug = substr(md5(random()::text || clock_timestamp()::text), 1, 10)
 WHERE profile_slug IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN profile_slug SET DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 10);

-- Unique index (not a plain UNIQUE constraint) so it can be created safely even
-- if a transient duplicate ever existed; it also keeps the index name stable.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_profile_slug_key ON public.profiles (profile_slug);

-- ---------------------------------------------------------------------------
-- 2. RLS: anon may read public profiles; anon grant is column-restricted so
--    email / phone can never leak through the public profile page.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (profile_public = true AND is_active = true);

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT (
  id, full_name, avatar_url, bio, role, xp_points, level, streak_days,
  linkedin_url, github_url, resume_url, profile_public, profile_slug,
  is_active, created_at
) ON public.profiles TO anon;

-- ---------------------------------------------------------------------------
-- 3. Public profile aggregation RPC (SECURITY DEFINER, hardened search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_profile(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH target AS (
    SELECT id
    FROM public.profiles
    WHERE profile_slug = NULLIF(p_slug, '')
      AND profile_public = true
      AND is_active = true
      AND role = 'student'
    LIMIT 1
  ),
  coding AS (
    SELECT
      count(*) FILTER (WHERE a.status = 'solved')::int AS solved,
      count(*) FILTER (WHERE a.status = 'attempted')::int AS attempted,
      count(*)::int AS total_questions_tried
    FROM public.coding_question_attempts a, target
    WHERE a.student_id = (SELECT id FROM target)
  ),
  solved_questions AS (
    SELECT DISTINCT ON (a.question_id)
      q.title,
      q.difficulty,
      a.first_solved_at
    FROM public.coding_question_attempts a
    JOIN public.coding_questions q ON q.id = a.question_id
    JOIN target ON true
    WHERE a.student_id = (SELECT id FROM target)
      AND a.status = 'solved'
    ORDER BY a.question_id, a.first_solved_at DESC NULLS LAST
  ),
  vscode AS (
    SELECT DISTINCT ON (s.assignment_key)
      s.assignment_title,
      s.verified_score,
      s.max_marks,
      s.verified_passed,
      s.verified_total,
      s.verified_at
    FROM public.coding_vscode_submissions s
    JOIN target ON true
    WHERE s.student_id = (SELECT id FROM target)
      AND s.status = 'submitted'
      AND s.verification_status = 'verified'
    ORDER BY s.assignment_key, s.verified_at DESC
  ),
  quiz_stats AS (
    -- score may be stored as raw points (<= max_score) or already as a
    -- percentage (some flows store 80 with max_score 10); normalize to 0-100.
    SELECT
      count(*)::int AS attempts,
      count(*) FILTER (WHERE qa.passed)::int AS passed,
      round(avg(
        CASE
          WHEN qa.max_score > 0 AND qa.score <= qa.max_score
            THEN 100.0 * qa.score / qa.max_score
          WHEN qa.max_score > 0 AND qa.score > qa.max_score
            THEN LEAST(qa.score, 100.0)
          ELSE qa.score
        END
      ))::int AS avg_score_pct
    FROM public.quiz_attempts qa
    JOIN target ON true
    WHERE qa.student_id = (SELECT id FROM target)
  ),
  lessons AS (
    SELECT count(*)::int AS completed
    FROM public.lesson_progress lp
    JOIN target ON true
    WHERE lp.student_id = (SELECT id FROM target) AND lp.completed = true
  ),
  enrollment_rows AS (
    SELECT
      c.title,
      ce.progress_percentage,
      ce.enrolled_at
    FROM public.course_enrollments ce
    JOIN public.courses c ON c.id = ce.course_id
    JOIN target ON true
    WHERE ce.student_id = (SELECT id FROM target)
      AND ce.access_status = 'active'
    ORDER BY ce.enrolled_at DESC
  ),
  batch_rows AS (
    SELECT DISTINCT b.name
    FROM public.batch_students bs
    JOIN public.batches b ON b.id = bs.batch_id
    JOIN target ON true
    WHERE bs.student_id = (SELECT id FROM target)
      AND bs.status = 'active'
  ),
  project_rows AS (
    SELECT
      p.title,
      ps.github_url,
      ps.live_url,
      ps.score,
      ps.status,
      ps.submitted_at
    FROM public.project_submissions ps
    JOIN public.projects p ON p.id = ps.project_id
    JOIN target ON true
    WHERE ps.student_id = (SELECT id FROM target)
      AND ps.status <> 'draft'
    ORDER BY ps.submitted_at DESC
  )
  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'xp_points', p.xp_points,
        'level', p.level,
        'streak_days', p.streak_days,
        'linkedin_url', p.linkedin_url,
        'github_url', p.github_url,
        'resume_url', p.resume_url,
        'profile_slug', p.profile_slug
      )
      FROM public.profiles p
      WHERE p.id = (SELECT id FROM target)
    ),
    'coding', (SELECT to_jsonb(coding) FROM coding),
    'solved_questions', COALESCE((
      SELECT jsonb_agg(to_jsonb(sq) ORDER BY sq.first_solved_at DESC)
      FROM (SELECT * FROM solved_questions LIMIT 50) sq
    ), '[]'::jsonb),
    'mini_projects', COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM vscode v), '[]'::jsonb),
    'quizzes', (SELECT to_jsonb(quiz_stats) FROM quiz_stats),
    'lessons_completed', (SELECT completed FROM lessons),
    'courses', COALESCE((SELECT jsonb_agg(to_jsonb(er)) FROM enrollment_rows er), '[]'::jsonb),
    'batches', COALESCE((SELECT jsonb_agg(batch_rows.name) FROM batch_rows), '[]'::jsonb),
    'projects', COALESCE((SELECT jsonb_agg(to_jsonb(pr)) FROM project_rows pr), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;
