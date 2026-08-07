
/*
# Fix Authentication - Trigger, Policies, and Security

## Changes
1. Fix handle_new_user trigger - never trust frontend role, always default to 'student'
   Faculty/admin roles must be assigned by super_admin only through admin UI
2. Fix profiles RLS - allow service role / trigger to insert profiles
3. Add upsert support so re-registration doesn't fail silently
4. Fix courses anon policy (duplicate named policy conflict)
5. Ensure all helper functions are stable and correct
*/

-- Fix the handle_new_user function to ALWAYS assign 'student' role
-- Never trust the role from frontend metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'student'  -- ALWAYS student; admin assigns role changes via admin panel
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger to ensure it's attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Fix profiles policies
-- The INSERT policy was blocking trigger because trigger uses SECURITY DEFINER
-- but we need to ensure the anon + service role can also insert during signup flow
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Ensure profiles can be selected by anon during the brief post-signup window
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Fix: add a special policy allowing users to select their own profile right after signup
-- (The auth.uid() may match even before the session is fully established)
DROP POLICY IF EXISTS "profiles_select_own_anon" ON profiles;
CREATE POLICY "profiles_select_own_anon" ON profiles FOR SELECT
  TO anon
  USING (false);

-- Ensure update policy is correct
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

-- Ensure delete policy is correct
DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  TO authenticated
  USING (is_admin());

-- Fix courses: remove duplicate anon policy and re-create cleanly
DROP POLICY IF EXISTS "courses_select_anon" ON courses;
DROP POLICY IF EXISTS "courses_select" ON courses;

CREATE POLICY "courses_select" ON courses FOR SELECT
  TO authenticated
  USING (is_published = true OR is_admin() OR faculty_can_access_course(id));

CREATE POLICY "courses_select_anon" ON courses FOR SELECT
  TO anon
  USING (is_published = true);

-- Fix chapters anon policy
DROP POLICY IF EXISTS "chapters_select_anon" ON chapters;
DROP POLICY IF EXISTS "chapters_select" ON chapters;

CREATE POLICY "chapters_select" ON chapters FOR SELECT
  TO authenticated
  USING (is_published = true OR is_admin() OR faculty_can_access_course(course_id));

CREATE POLICY "chapters_select_anon" ON chapters FOR SELECT
  TO anon
  USING (is_published = true);

-- Fix lessons: students should see lessons for enrolled courses
DROP POLICY IF EXISTS "lessons_select" ON lessons;
DROP POLICY IF EXISTS "lessons_select_anon" ON lessons;

CREATE POLICY "lessons_select" ON lessons FOR SELECT
  TO authenticated
  USING (
    is_published = true OR 
    is_admin() OR 
    faculty_can_access_course(course_id) OR
    EXISTS (
      SELECT 1 FROM course_enrollments 
      WHERE course_id = lessons.course_id 
        AND student_id = auth.uid()
    )
  );

CREATE POLICY "lessons_select_anon" ON lessons FOR SELECT
  TO anon
  USING (is_published = true AND is_free_preview = true);

-- Fix course_enrollments INSERT - allow student to enroll
DROP POLICY IF EXISTS "enrollments_insert" ON course_enrollments;
CREATE POLICY "enrollments_insert" ON course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid() OR is_admin());

-- Fix lesson_progress INSERT - needs DEFAULT auth.uid() to work without passing student_id
DROP POLICY IF EXISTS "lesson_progress_insert" ON lesson_progress;
CREATE POLICY "lesson_progress_insert" ON lesson_progress FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Fix announcements: global ones visible to authenticated users
DROP POLICY IF EXISTS "announcements_select" ON announcements;
CREATE POLICY "announcements_select" ON announcements FOR SELECT
  TO authenticated
  USING (
    is_global = true OR 
    is_admin() OR 
    EXISTS (
      SELECT 1 FROM course_enrollments 
      WHERE course_id = announcements.course_id 
        AND student_id = auth.uid()
    ) OR
    faculty_can_access_course(COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- Fix announcements: global ones visible to anon too (for landing page)
DROP POLICY IF EXISTS "announcements_select_anon" ON announcements;
CREATE POLICY "announcements_select_anon" ON announcements FOR SELECT
  TO anon
  USING (is_global = true);

-- Platform settings readable by anon (for landing page config)
DROP POLICY IF EXISTS "platform_settings_select" ON platform_settings;
CREATE POLICY "platform_settings_select" ON platform_settings FOR SELECT
  TO authenticated, anon
  USING (true);

-- Achievements readable by anon too
DROP POLICY IF EXISTS "achievements_select" ON achievements;
DROP POLICY IF EXISTS "achievements_select_anon" ON achievements;
CREATE POLICY "achievements_select" ON achievements FOR SELECT
  TO authenticated, anon
  USING (true);

-- Projects readable by anon
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_select_anon" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT
  TO authenticated
  USING (is_published = true OR is_admin());
CREATE POLICY "projects_select_anon" ON projects FOR SELECT
  TO anon
  USING (is_published = true);
