-- =====================================================================
-- 20260908000000_repair_missing_baseline_objects
-- Production schema drift repair (forward-only, additive, idempotent).
--
-- Derived mechanically from an object-level diff of a local schema built
-- from ALL committed migrations vs the production pg_dump. Recreates
-- missing columns, tables, functions, constraints, indexes, RLS,
-- policies, triggers, sequences, and grants. No data is modified.
-- Re-running is a no-op.
-- =====================================================================

set search_path = public;

-- 1. Columns on existing tables
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS submission_text text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS github_url text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS project_url text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS submitted_code text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS language text DEFAULT 'python'::text NOT NULL;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS execution_output text;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS visible_tests_passed integer DEFAULT 0 NOT NULL;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS visible_tests_total integer DEFAULT 0 NOT NULL;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS problem_statement text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS input_format text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS output_format text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS constraints_text text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS starter_code text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS hints jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS sample_solution text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS sample_solution_visibility text DEFAULT 'after_submission'::text NOT NULL;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_passed integer;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_total integer;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_score numeric(8,2);
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_summary text;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verification_error text;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verified_result jsonb;
ALTER TABLE public.coding_vscode_submissions ADD COLUMN IF NOT EXISTS verification_started_at timestamp with time zone;
ALTER TABLE public.course_enrollments ADD COLUMN IF NOT EXISTS expiry_date timestamp with time zone;
ALTER TABLE public.course_enrollments ADD COLUMN IF NOT EXISTS enrollment_reason text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS enrollment_mode text DEFAULT 'open'::text NOT NULL;
ALTER TABLE public.faculty_google_connections ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE public.secure_grading_runs ADD COLUMN IF NOT EXISTS coding_vscode_submission_id uuid;

-- 2. Sequences for new tables

-- 3. Tables
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    icon text DEFAULT 'award'::text,
    badge_color text DEFAULT '#2563EB'::text,
    xp_reward integer DEFAULT 100,
    condition_type text,
    condition_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: enrollment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.enrollment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    course_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrollment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


--

-- Name: faculty_compensation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.faculty_compensation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    faculty_id uuid NOT NULL,
    change_type text NOT NULL,
    amount numeric(12,2),
    percentage numeric(5,2),
    effective_date date NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_compensation_history_change_type_check CHECK ((change_type = ANY (ARRAY['salary'::text, 'incentive'::text, 'hike'::text, 'bonus'::text, 'deduction'::text, 'benefit'::text])))
);


--

-- Name: faculty_employment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.faculty_employment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    faculty_id uuid NOT NULL,
    employee_code text,
    employment_status text DEFAULT 'active'::text NOT NULL,
    joining_date date,
    department text,
    designation text,
    manager_id uuid,
    base_salary numeric(12,2),
    salary_currency text DEFAULT 'INR'::text NOT NULL,
    payment_frequency text DEFAULT 'monthly'::text NOT NULL,
    bank_details_masked text,
    benefits jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_employment_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'probation'::text, 'on_leave'::text, 'inactive'::text, 'terminated'::text]))),
    CONSTRAINT faculty_employment_payment_frequency_check CHECK ((payment_frequency = ANY (ARRAY['monthly'::text, 'bi_weekly'::text, 'weekly'::text])))
);


--

-- Name: faculty_performance_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.faculty_performance_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    faculty_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    review_period text NOT NULL,
    rating numeric(3,1),
    strengths text,
    improvements text,
    goals text,
    review_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_performance_reviews_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)))
);


--

-- Name: hiring_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.hiring_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo_url text,
    website text,
    industry text,
    description text,
    location text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--

-- Name: job_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.job_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status text DEFAULT 'applied'::text NOT NULL,
    resume_url text,
    cover_letter text,
    faculty_recommendation text,
    recommended_by uuid,
    interview_date timestamp with time zone,
    interview_notes text,
    offer_ctc numeric,
    applied_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT job_applications_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'shortlisted'::text, 'interview'::text, 'selected'::text, 'rejected'::text, 'withdrawn'::text])))
);


--

-- Name: job_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.job_postings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    job_type text DEFAULT 'full_time'::text NOT NULL,
    ctc_min numeric,
    ctc_max numeric,
    openings integer DEFAULT 1,
    eligibility_criteria text,
    required_skills text[] DEFAULT '{}'::text[],
    apply_by timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT job_postings_job_type_check CHECK ((job_type = ANY (ARRAY['full_time'::text, 'internship'::text, 'contract'::text, 'part_time'::text]))),
    CONSTRAINT job_postings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'on_hold'::text, 'filled'::text])))
);


--

-- Name: kaveri_app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.kaveri_app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: lesson_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lesson_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid DEFAULT auth.uid() NOT NULL,
    lesson_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: lesson_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lesson_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid DEFAULT auth.uid() NOT NULL,
    lesson_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.notification_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    actor_user_id uuid,
    subject_user_id uuid,
    entity_type text,
    entity_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    channel text DEFAULT 'email'::text NOT NULL,
    template_key text NOT NULL,
    recipient_user_id uuid,
    recipient_email text,
    recipient_name text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    dedupe_key text,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_claimed_at timestamp with time zone,
    provider_message_id text,
    delivery_generation integer DEFAULT 0 NOT NULL,
    CONSTRAINT notification_outbox_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'webhook'::text]))),
    CONSTRAINT notification_outbox_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT notification_outbox_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'delivering'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--

-- Name: offline_exam_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.offline_exam_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    marks_obtained numeric(8,2),
    remarks text,
    status text DEFAULT 'evaluated'::text NOT NULL,
    evaluated_by uuid,
    evaluated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_exam_results_status_check CHECK ((status = ANY (ARRAY['evaluated'::text, 'published'::text])))
);


--

-- Name: offline_exam_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.offline_exam_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    marks_obtained numeric,
    scanned_sheet_url text,
    attendance_status text DEFAULT 'registered'::text NOT NULL,
    graded_by uuid,
    graded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT offline_exam_students_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['registered'::text, 'present'::text, 'absent'::text])))
);


--

-- Name: offline_exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.offline_exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    description text,
    exam_date date,
    duration_minutes integer DEFAULT 60,
    max_marks numeric DEFAULT 100,
    venue text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    batch_label text,
    external_source text DEFAULT 'kaveri_question_paper'::text NOT NULL,
    external_paper_id text,
    external_set_id text,
    start_time time without time zone,
    student_instructions text,
    CONSTRAINT offline_exams_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'ongoing'::text, 'conducted'::text, 'completed'::text, 'results_pending'::text, 'results_published'::text, 'cancelled'::text])))
);


--

-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: qp_platform_sync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.qp_platform_sync (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    paper_id uuid NOT NULL,
    action text DEFAULT 'offline_exam.upsert'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_key text,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qp_platform_sync_action_check CHECK ((action = 'offline_exam.upsert'::text)),
    CONSTRAINT qp_platform_sync_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text])))
);


--

-- Name: quiz_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.quiz_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    question_id uuid NOT NULL,
    selected_option_ids uuid[],
    is_correct boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_id uuid NOT NULL,
    student_id uuid DEFAULT auth.uid() NOT NULL,
    score numeric(5,2),
    max_score integer,
    passed boolean,
    time_taken_seconds integer,
    completed_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: saved_code_snippets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.saved_code_snippets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text DEFAULT 'Untitled Snippet'::text NOT NULL,
    code text NOT NULL,
    language text DEFAULT 'python'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: session_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.session_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    title text NOT NULL,
    resource_type text NOT NULL,
    file_url text,
    external_url text,
    content text,
    is_locked boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_resources_resource_type_check CHECK ((resource_type = ANY (ARRAY['slides'::text, 'notes'::text, 'practice_questions'::text, 'code_example'::text, 'quiz'::text, 'assignment'::text, 'downloadable'::text, 'recording'::text])))
);


--

-- Name: student_support_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.student_support_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    faculty_id uuid,
    category text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    notes text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_support_records_category_check CHECK ((category = ANY (ARRAY['academic'::text, 'attendance'::text, 'behavior'::text, 'payment'::text, 'general'::text]))),
    CONSTRAINT student_support_records_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT student_support_records_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])))
);


--

-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: workshop_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workshop_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workshop_id uuid NOT NULL,
    source text DEFAULT 'workshop-app'::text NOT NULL,
    external_registration_id text NOT NULL,
    user_id uuid,
    email text NOT NULL,
    full_name text,
    phone text,
    status text DEFAULT 'registered'::text NOT NULL,
    registered_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workshop_registrations_status_check CHECK ((status = ANY (ARRAY['registered'::text, 'attended'::text, 'cancelled'::text, 'waitlisted'::text])))
);


--

-- Name: workshops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workshops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text DEFAULT 'workshop-app'::text NOT NULL,
    external_workshop_id text NOT NULL,
    name text NOT NULL,
    slug text,
    starts_at timestamp with time zone,
    venue text,
    mode text,
    status text DEFAULT 'published'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workshops_mode_check CHECK ((mode = ANY (ARRAY['online'::text, 'offline'::text, 'hybrid'::text]))),
    CONSTRAINT workshops_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'completed'::text, 'cancelled'::text])))
);


--


-- 4. Functions (after tables so bodies compile)
-- Name: activity_requirement_satisfied(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.activity_requirement_satisfied(p_activity_type text, p_activity_id uuid, p_student_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_activity_type = 'assignment' then
    return exists (
      select 1 from public.assignment_submissions s
      where s.assignment_id = p_activity_id
        and s.student_id = p_student_id
        and s.status in ('submitted', 'graded', 'returned', 'resubmitted')
    );
  elsif p_activity_type = 'quiz' then
    return exists (
      select 1 from public.quiz_attempts a
      where a.quiz_id = p_activity_id
        and a.student_id = p_student_id
        and a.completed_at is not null
    );
  elsif p_activity_type = 'coding' then
    return exists (
      select 1 from public.coding_question_attempts a
      where a.question_id = p_activity_id
        and a.student_id = p_student_id
        and a.status = 'solved'
    );
  end if;
  return false;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--

-- Name: admin_set_enrollment_access(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.admin_set_enrollment_access(p_enrollment_id uuid, p_access_status text, p_notes text DEFAULT NULL::text) RETURNS public.course_enrollments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  updated_enrollment public.course_enrollments;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may change enrollment access.'
      using errcode = '42501';
  end if;
  if p_enrollment_id is null then
    raise exception 'Enrollment is required.' using errcode = '22023';
  end if;
  if p_access_status not in ('active', 'revoked') then
    raise exception 'Invalid enrollment access status.' using errcode = '22023';
  end if;

  update public.course_enrollments
  set access_status = p_access_status,
      enrollment_source = case when p_access_status = 'active' then 'admin_grant' else enrollment_source end,
      granted_by = case when p_access_status = 'active' then (select auth.uid()) else granted_by end,
      granted_at = case when p_access_status = 'active' then now() else granted_at end,
      revoked_by = case when p_access_status = 'revoked' then (select auth.uid()) else null end,
      revoked_at = case when p_access_status = 'revoked' then now() else null end,
      notes = coalesce(p_notes, notes)
  where id = p_enrollment_id
  returning * into updated_enrollment;

  if updated_enrollment.id is null then
    raise exception 'Enrollment not found.' using errcode = 'P0002';
  end if;
  return updated_enrollment;
end;
$$;


--

-- Name: admin_set_user_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user_id uuid, p_is_active boolean) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may change account status.'
      using errcode = '42501';
  end if;

  if p_user_id is null or p_is_active is null then
    raise exception 'Target user and account status are required.'
      using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) and not p_is_active then
    raise exception 'A Super Admin cannot deactivate their own account.'
      using errcode = '42501';
  end if;

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found.'
      using errcode = 'P0002';
  end if;

  return updated_profile;
end;
$$;


--

-- Name: admin_set_user_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text) RETURNS public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  previous_role text;
  updated_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only an active Super Admin may assign roles.'
      using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Target user is required.'
      using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'A Super Admin cannot change their own role.'
      using errcode = '42501';
  end if;

  if p_role not in ('student', 'faculty', 'super_admin') then
    raise exception 'Invalid user role.'
      using errcode = '22023';
  end if;

  select role
  into previous_role
  from public.profiles
  where id = p_user_id
  for update;

  if previous_role is null then
    raise exception 'Profile not found.'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id
  returning * into updated_profile;

  if p_role = 'faculty' then
    insert into public.faculty_employment (
      faculty_id,
      employment_status
    )
    values (
      p_user_id,
      'active'
    )
    on conflict (faculty_id) do update
    set employment_status = 'active',
        updated_at = now();
  elsif previous_role = 'faculty' then
    update public.faculty_employment
    set employment_status = 'inactive',
        updated_at = now()
    where faculty_id = p_user_id;
  end if;

  return updated_profile;
end;
$$;


--

-- Name: approve_enrollment_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.approve_enrollment_request(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests%rowtype;
  v_course_title text;
begin
  if not is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  -- Grant (or reactivate) access in the same transaction.
  insert into public.course_enrollments (
    course_id, student_id, access_status, enrollment_source,
    granted_by, granted_at, progress_percentage
  )
  values (
    v_request.course_id, v_request.student_id, 'active', 'approved_request',
    (select auth.uid()), now(), 0
  )
  on conflict (course_id, student_id) do update
    set access_status = 'active',
        enrollment_source = 'approved_request',
        granted_by = (select auth.uid()),
        granted_at = now(),
        revoked_by = null,
        revoked_at = null,
        notes = coalesce(course_enrollments.notes, 'Approved via enrollment request');

  update public.enrollment_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
  where id = p_request_id;

  -- Emit event + in-app + outbox (same transaction; async delivery).
  perform public.process_enrollment_event('enrollment_approved', p_request_id);

  select title into v_course_title
  from public.courses
  where id = v_request.course_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'student_id', v_request.student_id,
    'course_id', v_request.course_id,
    'course_title', v_course_title
  );
end;
$$;


--

-- Name: can_manage_announcement_target(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.can_manage_announcement_target(p_audience_type text, p_course_id uuid, p_batch_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin()
    or (
      public.is_faculty()
      and p_audience_type <> 'platform'
      and case
        when p_audience_type = 'all_students' then true
        when p_audience_type = 'course' then public.faculty_can_access_course(p_course_id)
        when p_audience_type = 'batch' then exists (
          select 1
          from public.batch_faculty bf
          where bf.batch_id = p_batch_id
            and bf.faculty_id = (select auth.uid())
        )
        else false
      end
    );
$$;


--

-- Name: can_view_announcement(uuid, text, uuid, uuid, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.can_view_announcement(p_author_id uuid, p_audience_type text, p_course_id uuid, p_batch_id uuid, p_status text, p_publish_at timestamp with time zone, p_expires_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin()
    or p_author_id = (select auth.uid())
    or (
      p_status in ('published', 'scheduled')
      and coalesce(p_publish_at, '-infinity'::timestamptz) <= now()
      and (p_expires_at is null or p_expires_at > now())
      and case
        when p_audience_type = 'platform' then true
        when p_audience_type = 'course' then exists (
          select 1
          from public.course_enrollments ce
          where ce.course_id = p_course_id
            and ce.student_id = (select auth.uid())
            and coalesce(ce.access_status, 'active') = 'active'
        )
        when p_audience_type = 'batch' then exists (
          select 1
          from public.batch_students bs
          where bs.batch_id = p_batch_id
            and bs.student_id = (select auth.uid())
            and bs.status = 'active'
        )
        when p_audience_type = 'all_students' then exists (
          select 1
          from public.course_enrollments ce
          join public.course_faculty cf on cf.course_id = ce.course_id
          where ce.student_id = (select auth.uid())
            and cf.faculty_id = p_author_id
            and coalesce(ce.access_status, 'active') = 'active'
        ) or exists (
          select 1
          from public.batch_students bs
          join public.batch_faculty bf on bf.batch_id = bs.batch_id
          where bs.student_id = (select auth.uid())
            and bf.faculty_id = p_author_id
            and bs.status = 'active'
        )
        else false
      end
    );
$$;


--

-- Name: cancel_enrollment_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.cancel_enrollment_request(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests%rowtype;
begin
  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.student_id <> (select auth.uid()) then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.enrollment_requests
  set status = 'cancelled',
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'cancelled');
end;
$$;


--

-- Name: check_in_ws_registration(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.check_in_ws_registration(p_registration_id text, p_checked_in_by text, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r public.ws_registrations%rowtype;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  update public.ws_registrations
    set checked_in_at=coalesce(checked_in_at,now()), checked_in_by=coalesce(nullif(checked_in_by,''),coalesce(nullif(trim(p_checked_in_by),''),'Admin')), updated_at=now()
    where registration_id=trim(p_registration_id)
    returning * into r;
  if not found then raise exception 'Registration not found.'; end if;
  return jsonb_build_object('ok',true,'registrationId',r.registration_id,'checkedInAt',r.checked_in_at,'checkedInBy',r.checked_in_by);
end;
$$;


--

-- Name: claim_vscode_submission_verification(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.claim_vscode_submission_verification(p_submission_id uuid, p_student_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_submission public.coding_vscode_submissions%rowtype;
  v_out jsonb;
begin
  select *
    into v_submission
    from public.coding_vscode_submissions
   where id = p_submission_id
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_submission.student_id is distinct from p_student_id then
    return jsonb_build_object('result', 'forbidden');
  end if;

  if v_submission.verification_status = 'verified' then
    return jsonb_build_object(
      'result', 'verified',
      'verified_passed', v_submission.verified_passed,
      'verified_total', v_submission.verified_total,
      'verified_score', v_submission.verified_score,
      'verified_summary', v_submission.verified_summary
    );
  end if;

  if v_submission.verification_status = 'pending' then
    -- Stale claim from a crashed invocation may be reclaimed.
    if v_submission.verification_started_at is null
       or v_submission.verification_started_at < now() - interval '5 minutes' then
      update public.coding_vscode_submissions
         set verification_started_at = now()
       where id = p_submission_id;
      return jsonb_build_object('result', 'claimed');
    end if;
    return jsonb_build_object('result', 'in_progress');
  end if;

  -- null or 'error' -> claim for this invocation.
  update public.coding_vscode_submissions
     set verification_status = 'pending',
         verification_started_at = now(),
         verification_error = null
   where id = p_submission_id;
  return jsonb_build_object('result', 'claimed');
end;
$$;


--

-- Name: coding_vscode_submissions_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.coding_vscode_submissions_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
  v_language text;
  v_file_name text;
  v_marks numeric(8,2);
begin
  -- 1) Canonicalize the authoritative assignment snapshot on INSERT. The real
  --    assignment identified by assignment_key is the only trusted source for
  --    title / language / file_name / max_marks.
  if (tg_op = 'INSERT') then
    select a.title, a.language, a.file_name, a.marks
      into v_title, v_language, v_file_name, v_marks
      from public.coding_vscode_assignments a
     where a.assignment_key = new.assignment_key
     order by a.created_at asc
     limit 1;
    if (found) then
      new.assignment_title := v_title;
      new.language := coalesce(v_language, new.language);
      new.file_name := coalesce(v_file_name, new.file_name);
      new.max_marks := v_marks;
    end if;
  end if;

  -- 2) Verified_* fields belong to the secure runner (service_role) only.
  if (auth.role() is distinct from 'service_role') then
    if (tg_op = 'UPDATE') then
      -- Non-service writers (including staff) must preserve server values.
      new.verification_status := old.verification_status;
      new.verified_passed := old.verified_passed;
      new.verified_total := old.verified_total;
      new.verified_score := old.verified_score;
      new.verified_at := old.verified_at;
      new.verified_summary := old.verified_summary;
      new.verification_error := old.verification_error;
      new.verified_result := old.verified_result;
      new.verification_started_at := old.verification_started_at;
    else
      new.verification_status := null;
      new.verified_passed := null;
      new.verified_total := null;
      new.verified_score := null;
      new.verified_at := null;
      new.verified_summary := null;
      new.verification_error := null;
      new.verified_result := null;
      new.verification_started_at := null;
    end if;

    -- 3) Teacher-owned review fields: staff only (students never reach UPDATE
    --    thanks to RLS; the guard is defense in depth).
    if (not public.is_kaveri_staff()) then
      new.teacher_score := null;
      new.teacher_feedback := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_status := 'unreviewed';
      if (tg_op = 'INSERT') then
        new.status := 'submitted';
        new.submitted_at := now();
      end if;
    end if;
  end if;

  return new;
end;
$$;


--

-- Name: complete_lesson(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.complete_lesson(p_lesson_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid := (select auth.uid());
  lesson_record public.lessons%rowtype;
  progress_record public.lesson_progress%rowtype;
  was_completed boolean := false;
  total_lessons integer := 0;
  completed_lessons integer := 0;
  awarded_xp integer := 0;
  total_xp integer := 0;
  current_level integer := 1;
  course_progress numeric(5,2) := 0;
  certificate_insert_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'student'
      and profile.is_active = true
  ) then
    raise exception 'Only an active student may complete a lesson.' using errcode = '42501';
  end if;

  select lesson.* into lesson_record
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.id = p_lesson_id
    and lesson.is_published = true
    and course.is_published = true;
  if lesson_record.id is null then
    raise exception 'Published lesson not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.course_enrollments enrollment
    where enrollment.course_id = lesson_record.course_id
      and enrollment.student_id = current_user_id
      and enrollment.access_status = 'active'
  ) then
    raise exception 'An active course enrollment is required.' using errcode = '42501';
  end if;

  -- progression guard: locked lessons cannot be completed out of order
  if public.student_lesson_access(p_lesson_id) = 'locked' then
    raise exception 'This lesson is locked. Complete the required previous work first, or wait for your faculty to release it.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_lesson_id::text, 0));
  select progress.completed into was_completed
  from public.lesson_progress progress
  where progress.student_id = current_user_id and progress.lesson_id = p_lesson_id
  for update;
  was_completed := coalesce(was_completed, false);

  insert into public.lesson_progress (student_id, lesson_id, course_id, completed, completed_at)
  values (current_user_id, lesson_record.id, lesson_record.course_id, true, now())
  on conflict (student_id, lesson_id) do update
  set course_id = excluded.course_id,
      completed = true,
      completed_at = coalesce(public.lesson_progress.completed_at, excluded.completed_at),
      updated_at = now()
  returning * into progress_record;

  if not was_completed then
    awarded_xp := greatest(coalesce(lesson_record.xp_reward, 0), 0);
    if awarded_xp > 0 then
      insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
      values (current_user_id, awarded_xp, 'Completed lesson: ' || lesson_record.title, lesson_record.id, 'lesson');
      update public.profiles
      set xp_points = xp_points + awarded_xp,
          level = floor(sqrt(greatest(xp_points + awarded_xp, 0)::numeric / 100))::integer + 1,
          updated_at = now()
      where id = current_user_id
      returning xp_points, level into total_xp, current_level;
    end if;
  end if;
  if awarded_xp = 0 then
    select profile.xp_points, profile.level into total_xp, current_level
    from public.profiles profile where profile.id = current_user_id;
  end if;

  select count(*) into total_lessons from public.lessons lesson
  where lesson.course_id = lesson_record.course_id and lesson.is_published = true;
  select count(*) into completed_lessons
  from public.lesson_progress progress
  join public.lessons lesson on lesson.id = progress.lesson_id
  where progress.student_id = current_user_id
    and progress.completed = true
    and lesson.course_id = lesson_record.course_id
    and lesson.is_published = true;
  course_progress := case when total_lessons = 0 then 0
    else round((completed_lessons::numeric / total_lessons::numeric) * 100, 2) end;

  update public.course_enrollments
  set progress_percentage = course_progress,
      completed_at = case when course_progress = 100 then coalesce(completed_at, now()) else null end
  where course_id = lesson_record.course_id
    and student_id = current_user_id
    and access_status = 'active';

  if course_progress = 100 and exists (
    select 1 from public.courses course
    where course.id = lesson_record.course_id and course.certificate_eligible = true
  ) then
    insert into public.certificates (student_id, course_id)
    values (current_user_id, lesson_record.course_id)
    on conflict (student_id, course_id) do nothing;
    get diagnostics certificate_insert_count = row_count;
  end if;

  return jsonb_build_object(
    'progress', to_jsonb(progress_record),
    'course_progress', course_progress,
    'xp_awarded', awarded_xp,
    'total_xp', total_xp,
    'level', current_level,
    'certificate_issued', certificate_insert_count > 0
  );
end;
$$;


--

-- Name: configure_ws_admin_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.configure_ws_admin_secret(p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if length(coalesce(p_secret,'')) < 32 then
    raise exception 'Admin secret must be at least 32 characters.';
  end if;
  if exists(select 1 from public.ws_private_settings where setting_key='admin_secret_sha256') then
    return jsonb_build_object('ok', true, 'configured', true, 'alreadyConfigured', true);
  end if;
  insert into public.ws_private_settings(setting_key,value_hash)
  values('admin_secret_sha256', encode(extensions.digest(convert_to(p_secret,'UTF8'),'sha256'),'hex'));
  return jsonb_build_object('ok', true, 'configured', true, 'alreadyConfigured', false);
end;
$$;


--

-- Name: create_faculty_course(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.create_faculty_course(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_course_id uuid;
  v_title text := nullif(trim(p_payload->>'title'), '');
  v_slug text := nullif(trim(p_payload->>'slug'), '');
  v_short_desc text := nullif(trim(p_payload->>'short_description'), '');
  v_desc text := nullif(trim(p_payload->>'description'), '');
  v_thumb text := nullif(trim(p_payload->>'thumbnail_url'), '');
  v_difficulty text := coalesce(nullif(trim(p_payload->>'difficulty'), ''), 'beginner');
  v_category text := coalesce(nullif(trim(p_payload->>'category'), ''), 'python');
  v_language text := coalesce(nullif(trim(p_payload->>'language'), ''), 'English');
  v_duration integer := coalesce(nullif(p_payload->>'duration_hours', '')::integer, 0);
  v_is_published boolean := coalesce(nullif(p_payload->>'is_published', '')::boolean, false);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
    into v_role
  from public.profiles as p
  where p.id = v_user_id;

  if v_role is null then
    raise exception 'Profile not found';
  end if;

  if v_role not in ('faculty', 'super_admin') then
    raise exception 'Only faculty or admin can create courses';
  end if;

  -- Faculty-created courses always begin as drafts.
  if v_role = 'faculty' then
    v_is_published := false;
  end if;

  if v_title is null then
    raise exception 'Title is required';
  end if;

  if v_slug is null then
    raise exception 'Slug is required';
  end if;

  insert into public.courses (
    title,
    slug,
    short_description,
    description,
    thumbnail_url,
    difficulty,
    category,
    language,
    duration_hours,
    is_published,
    is_featured,
    created_by
  ) values (
    v_title,
    v_slug,
    v_short_desc,
    v_desc,
    v_thumb,
    v_difficulty,
    v_category,
    v_language,
    v_duration,
    v_is_published,
    false,
    v_user_id
  )
  returning id into v_course_id;

  insert into public.course_faculty (course_id, faculty_id)
  values (v_course_id, v_user_id)
  on conflict (course_id, faculty_id) do nothing;

  return jsonb_build_object(
    'id', v_course_id,
    'title', v_title,
    'slug', v_slug,
    'created_by', v_user_id,
    'is_published', v_is_published
  );
end;
$$;


--

-- Name: create_offline_exam(text, uuid, text, date, time without time zone, integer, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.create_offline_exam(p_title text, p_course_id uuid DEFAULT NULL::uuid, p_batch_label text DEFAULT NULL::text, p_exam_date date DEFAULT NULL::date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_duration_minutes integer DEFAULT NULL::integer, p_max_marks numeric DEFAULT NULL::numeric, p_student_instructions text DEFAULT NULL::text, p_external_paper_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_exam_id uuid;
  v_title text := nullif(trim(p_title), '');
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if v_title is null then raise exception 'Exam title is required'; end if;
  if p_duration_minutes is not null and (p_duration_minutes <= 0 or p_duration_minutes > 600) then
    raise exception 'Duration must be between 1 and 600 minutes';
  end if;
  if p_max_marks is not null and (p_max_marks < 0 or p_max_marks > 10000) then
    raise exception 'Max marks must be between 0 and 10000';
  end if;

  -- Authorization: course-less exams are admin-only; course exams require
  -- course manageability (admin or the course's assigned faculty).
  if p_course_id is null then
    if not public.is_admin() then
      raise exception 'OFFLINE_EXAM_FORBIDDEN';
    end if;
  else
    if not public.offline_exam_course_writable(p_course_id) then
      raise exception 'OFFLINE_EXAM_FORBIDDEN';
    end if;
  end if;

  -- Linkage guard: one exam per external paper (prevents duplicates from a
  -- later webhook replay or a manual double-entry).
  if p_external_paper_id is not null then
    if exists (
      select 1 from public.offline_exams
      where external_source = 'kaveri_question_paper'
        and external_paper_id = p_external_paper_id
    ) then
      raise exception 'OFFLINE_EXAM_ALREADY_LINKED';
    end if;
  end if;

  insert into public.offline_exams (
    title, course_id, batch_label, exam_date, start_time, duration_minutes,
    max_marks, student_instructions, external_source, external_paper_id,
    status, created_by
  ) values (
    v_title, p_course_id, nullif(trim(coalesce(p_batch_label, '')), ''),
    p_exam_date, p_start_time, p_duration_minutes, p_max_marks,
    nullif(trim(coalesce(p_student_instructions, '')), ''),
    'kaveri_question_paper', p_external_paper_id, 'scheduled', auth.uid()
  ) returning id into v_exam_id;

  select record_notification_event(
    'offline_exam_scheduled',
    auth.uid(),
    null,
    'offline_exam',
    v_exam_id,
    jsonb_build_object(
      'title', v_title,
      'course_id', p_course_id,
      'exam_date', p_exam_date,
      'manual', true
    ),
    'offline_exam_scheduled:manual:' || v_exam_id::text
  ) into v_event_id;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'offline_exam_created',
    'offline_exam',
    v_exam_id,
    jsonb_build_object(
      'title', v_title,
      'course_id', p_course_id,
      'batch_label', p_batch_label,
      'exam_date', p_exam_date,
      'start_time', p_start_time,
      'duration_minutes', p_duration_minutes,
      'max_marks', p_max_marks,
      'external_paper_id', p_external_paper_id
    )
  );

  return jsonb_build_object(
    'exam_id', v_exam_id,
    'status', 'scheduled',
    'event_id', v_event_id
  );
end;
$$;


--

-- Name: decide_coding_access_request(uuid, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.decide_coding_access_request(p_request_id uuid, p_approve boolean, p_minutes integer DEFAULT 60) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_request public.coding_vscode_access_requests%rowtype;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;

  select * into v_request
  from public.coding_vscode_access_requests
  where id = p_request_id;

  if v_request.id is null then raise exception 'Access request not found'; end if;

  if p_approve then
    insert into public.coding_vscode_student_assignment_access (
      student_id, assignment_id, batch_id, source, granted_at, granted_by
    ) values (
      v_request.student_id, v_request.assignment_id, v_request.batch_id,
      'teacher_grant', now(), auth.uid()
    )
    on conflict (student_id, assignment_id, batch_id)
    do update set source = 'teacher_grant', granted_by = auth.uid();
  end if;

  update public.coding_vscode_access_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_at = now(),
      decided_by = auth.uid(),
      access_until = null,
      updated_at = now()
  where id = p_request_id;
end;
$$;


--

-- Name: delete_course_with_content(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.delete_course_with_content(p_course_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_course_title text;
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select p.role, c.title
    into v_user_role, v_course_title
  from public.courses c
  left join public.profiles p on p.id = v_user_id
  where c.id = p_course_id;

  if v_course_title is null then
    raise exception 'Course not found'
      using errcode = 'P0002';
  end if;

  if coalesce(v_user_role, '') <> 'super_admin'
     and not exists (
       select 1
       from public.course_faculty cf
       where cf.course_id = p_course_id
         and cf.faculty_id = v_user_id
     ) then
    raise exception 'You do not have permission to delete this course'
      using errcode = '42501';
  end if;

  delete from public.courses
  where id = p_course_id;

  if not found then
    raise exception 'Course could not be deleted'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'success', true,
    'course_id', p_course_id,
    'title', v_course_title
  );
end;
$$;


--

-- Name: end_coding_live_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.end_coding_live_class(p_batch_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;

  update public.coding_vscode_assignment_batches
  set is_unlocked = false,
      locked_at = now(),
      live_until = now(),
      updated_at = now(),
      updated_by = auth.uid()
  where batch_id = p_batch_id
    and is_unlocked = true
    and (live_until is null or live_until > now());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


--

-- Name: faculty_can_access_course(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.faculty_can_access_course(p_course_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin()
    or (
      public.is_faculty()
      and exists (
        select 1
        from public.course_faculty cf
        where cf.course_id = p_course_id
          and cf.faculty_id = (select auth.uid())
      )
    );
$$;


--

-- Name: faculty_can_access_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.faculty_can_access_student(p_student_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_enrollments ce
    JOIN course_faculty cf ON cf.course_id = ce.course_id
    WHERE ce.student_id = p_student_id AND cf.faculty_id = auth.uid()
  ) OR is_admin();
$$;


--

-- Name: faculty_can_manage_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.faculty_can_manage_session(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT EXISTS (
  SELECT 1 FROM live_sessions ls
  JOIN course_faculty cf ON cf.course_id = ls.course_id
  WHERE ls.id = p_session_id AND cf.faculty_id = auth.uid()
) OR public.is_admin();
$$;


--

-- Name: force_resend_notification_outbox(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.force_resend_notification_outbox(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.notification_outbox%rowtype;
  v_prev_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_row
  from public.notification_outbox
  where id = p_id
  for update;

  if not found then
    raise exception 'OUTBOX_ROW_NOT_FOUND';
  end if;
  if v_row.status not in ('sent', 'failed', 'skipped') then
    raise exception 'ROW_NOT_RESENDABLE';
  end if;

  v_prev_status := v_row.status;

  update public.notification_outbox
  set status = 'queued',
      attempts = 0,
      next_attempt_at = now(),
      last_error = null,
      sent_at = null,
      provider_message_id = null,
      delivery_claimed_at = null,
      delivery_generation = delivery_generation + 1,
      payload = payload || jsonb_build_object(
        'force_resend_audit', coalesce(payload -> 'force_resend_audit', '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
               'at', now(),
               'actor', auth.uid(),
               'actor_role', auth.role(),
               'from_status', v_prev_status,
               'delivery_generation', v_row.delivery_generation + 1
             ))
      ),
      updated_at = now()
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'outbox_id', p_id,
    'previous_status', v_prev_status,
    'delivery_generation', v_row.delivery_generation + 1,
    'status', 'queued'
  );
end;
$$;


--

-- Name: get_quiz_questions_for_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_student(p_quiz_id uuid) RETURNS TABLE(id uuid, quiz_id uuid, question_text text, question_type text, order_index integer, points integer, created_at timestamp with time zone, difficulty text, code_snippet text, image_url text, enable_playground boolean, time_limit_seconds integer, options jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id, q.lesson_id into v_course_id, v_lesson_id
  from public.quizzes q
  where q.id = p_quiz_id and q.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    raise exception 'An active enrollment in this course is required.' using errcode = '42501';
  end if;

  if not public.student_activity_unlocked(v_lesson_id, 'quiz', p_quiz_id) then
    raise exception 'This quiz unlocks with its lesson.' using errcode = '42501';
  end if;

  return query
  select
    qq.id,
    qq.quiz_id,
    qq.question_text,
    qq.question_type,
    qq.order_index,
    qq.points,
    qq.created_at,
    qq.difficulty,
    qq.code_snippet,
    qq.image_url,
    qq.enable_playground,
    qq.time_limit_seconds,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'option_text', o.option_text, 'order_index', o.order_index)
        order by o.order_index
      )
      from public.quiz_options o
      where o.question_id = qq.id
    ), '[]'::jsonb) as options
  from public.quiz_questions qq
  where qq.quiz_id = p_quiz_id
  order by qq.order_index;
end;
$$;


--

-- Name: get_quiz_questions_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_quiz_questions_staff(p_quiz_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select q.course_id into v_course_id
  from public.quizzes q
  where q.id = p_quiz_id;

  if v_course_id is null then
    raise exception 'Quiz not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to view quiz answers.' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', qq.id,
        'quiz_id', qq.quiz_id,
        'question_text', qq.question_text,
        'question_type', qq.question_type,
        'explanation', qq.explanation,
        'order_index', qq.order_index,
        'points', qq.points,
        'created_at', qq.created_at,
        'difficulty', qq.difficulty,
        'code_snippet', qq.code_snippet,
        'image_url', qq.image_url,
        'enable_playground', qq.enable_playground,
        'correct_answer_text', qq.correct_answer_text,
        'time_limit_seconds', qq.time_limit_seconds,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'question_id', o.question_id,
              'option_text', o.option_text,
              'is_correct', o.is_correct,
              'order_index', o.order_index
            ) order by o.order_index
          )
          from public.quiz_options o
          where o.question_id = qq.id
        ), '[]'::jsonb)
      ) order by qq.order_index
    ), '[]'::jsonb)
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
  );
end;
$$;


--

-- Name: get_server_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_server_secret(p_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_secret text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_name;

  return v_secret;
end;
$$;


--

-- Name: get_session_recording_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_session_recording_status(p_session_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_course_id uuid;
  v_total int;
  v_unlocked int;
  v_student uuid := auth.uid();
begin
  if v_student is null then
    return null;
  end if;

  select course_id into v_course_id
  from public.live_sessions
  where id = p_session_id;

  if v_course_id is null then
    return null;
  end if;

  -- Enrolled, active students (and staff/admin) only. Returning null for
  -- anyone else avoids leaking whether the session/recording exists.
  if not (public.is_admin()
          or exists (
            select 1 from public.course_faculty cf
            where cf.course_id = v_course_id and cf.faculty_id = v_student
          )
          or exists (
            select 1 from public.course_enrollments ce
            where ce.course_id = v_course_id
              and ce.student_id = v_student
              and ce.access_status = 'active'
          )) then
    return null;
  end if;

  select count(*) into v_total
  from public.session_resources sr
  where sr.session_id = p_session_id
    and sr.resource_type = 'recording';

  if v_total = 0 then
    return 'none';
  end if;

  select count(*) into v_unlocked
  from public.session_resources sr
  where sr.session_id = p_session_id
    and sr.resource_type = 'recording'
    and sr.is_locked = false;

  if v_unlocked > 0 then
    return 'available';
  end if;

  return 'pending';
end;
$$;


--

-- Name: get_student_coding_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_student_coding_questions(p_question_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, title text, slug text, problem_statement text, instructions text, input_format text, output_format text, constraints_text text, starter_code text, explanation text, hints text[], difficulty text, topic text, subtopic text, tags text[], company_tags text[], frequency_score integer, language text, default_marks integer, is_published boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    q.id, q.title, q.slug, q.problem_statement, q.instructions,
    q.input_format, q.output_format, q.constraints_text, q.starter_code,
    q.explanation, q.hints, q.difficulty, q.topic, q.subtopic,
    q.tags, q.company_tags, q.frequency_score, q.language,
    q.default_marks, q.is_published
  from public.coding_questions q
  where auth.uid() is not null
    and q.is_published = true
    and (p_question_id is null or q.id = p_question_id)
  order by q.frequency_score desc, q.title asc;
$$;


--

DROP FUNCTION IF EXISTS public.get_student_course_plan(uuid, uuid);
-- Name: get_student_course_plan(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_student_course_plan(p_course_id uuid, p_student_id uuid DEFAULT NULL::uuid) RETURNS TABLE(lesson_id uuid, chapter_id uuid, course_id uuid, title text, slug text, teaching_mode text, enable_coding_playground boolean, duration_minutes integer, xp_reward integer, order_index integer, is_free_preview boolean, chapter_title text, chapter_order_index integer, access text, reason text, is_released boolean, requires_activity_type text, requires_activity_id uuid, requires_activity_title text, activities jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := coalesce(p_student_id, auth.uid());
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    return;
  end if;

  -- staff viewing another student: caller must be admin or faculty of this course
  if p_student_id is not null and p_student_id <> v_caller then
    if not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
      raise exception 'Not authorized to view this student''s course plan.' using errcode = '42501';
    end if;
  elsif not (public.is_admin() or public.faculty_can_access_course(p_course_id)) then
    -- self-service: caller must be actively enrolled
    if not exists (
      select 1 from public.course_enrollments ce
      where ce.course_id = p_course_id and ce.student_id = v_caller and ce.access_status = 'active'
    ) then
      return;
    end if;
  end if;

  return query
  with ordered as (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = p_course_id and l.is_published and c.is_published
  ),
  base as (
  select
    l.id as lesson_id,
    l.chapter_id,
    l.course_id,
    l.title,
    l.slug,
    l.teaching_mode,
    l.enable_coding_playground,
    l.duration_minutes,
    l.xp_reward,
    l.order_index,
    l.is_free_preview,
    c.title as chapter_title,
    c.order_index as chapter_order_index,
    case
      when lp.id is not null then 'completed'
      when lr.id is not null then 'available'
      when l.unlock_rule = 'open' then 'available'
      when l.unlock_rule = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'locked'
      when prev.id is not null and prev_lp.id is null then 'locked'
      else 'available'
    end as access,
    case
      when lp.id is not null then 'Completed'
      when lr.id is not null then 'Released by faculty or admin'
      when l.unlock_rule = 'open' then ''
      when l.unlock_rule = 'gated'
           and (l.requires_activity_id is null
                or not public.activity_requirement_satisfied(l.requires_activity_type, l.requires_activity_id, v_uid))
        then 'Complete the required ' || l.requires_activity_type
             || coalesce(' "' || (
                  case l.requires_activity_type
                    when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
                    when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
                    when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
                  end
                ) || '"', '') || ' to unlock this lesson'
      when prev.id is not null and prev_lp.id is null then 'Complete "' || prev_l.title || '" first'
      else ''
    end as reason,
    lr.id is not null as is_released,
    l.requires_activity_type,
    l.requires_activity_id,
    case l.requires_activity_type
      when 'assignment' then (select a.title from public.assignments a where a.id = l.requires_activity_id)
      when 'quiz' then (select q.title from public.quizzes q where q.id = l.requires_activity_id)
      when 'coding' then (select cq.title from public.coding_questions cq where cq.id = l.requires_activity_id)
    end as requires_activity_title,
    coalesce((
      select jsonb_agg(act order by act->>'sort')
      from (
        select jsonb_build_object(
                 'sort', '01',
                 'kind', r.resource_type,
                 'title', r.title,
                 'state', case
                            when lp.id is not null then 'completed'
                            when r.is_locked is not true then 'available'
                            else 'locked'
                          end
               ) as act
        from public.lesson_resources r
        where r.lesson_id = l.id
          and r.is_published
          and (r.is_locked is not true or (p_student_id is not null and p_student_id <> v_caller))
        union all
        select jsonb_build_object(
                 'sort', '02',
                 'kind', 'live',
                 'title', ls.title,
                 'session_id', ls.id,
                 'state', case
                            when ls.status = 'cancelled' then 'cancelled'
                            when ls.status = 'completed' then 'completed'
                            when ls.status = 'live'
                                 or (now() >= ls.session_date
                                     and now() <= ls.session_date + (ls.duration_minutes || ' minutes')::interval)
                              then 'live_now'
                            else 'upcoming'
                          end,
                 'recording', case
                                when ls.status = 'completed' then coalesce((
                                  select case
                                    when count(*) filter (where sr.is_locked is not true) > 0 then 'available'
                                    when count(*) filter (where sr.is_locked) > 0 then 'locked'
                                    else 'none'
                                  end
                                  from public.session_resources sr
                                  where sr.session_id = ls.id
                                    and sr.resource_type = 'recording'
                                ), 'none')
                                else 'none'
                              end,
                 'date', to_char(ls.session_date, 'Mon DD, YYYY')
               ) as act
        from public.live_sessions ls
        where ls.lesson_id = l.id
        union all
        select jsonb_build_object(
                 'sort', '03',
                 'kind', 'quiz',
                 'title', q.title,
                 'quiz_id', q.id,
                 'state', case
                            when exists (
                              select 1 from public.quiz_attempts qa
                              where qa.quiz_id = q.id and qa.student_id = v_uid and qa.completed_at is not null
                            ) then 'completed'
                            else 'available'
                          end
               ) as act
        from public.quizzes q
        where q.lesson_id = l.id and q.is_published
        union all
        select jsonb_build_object(
                 'sort', '04',
                 'kind', 'assignment',
                 'title', a.title,
                 'assignment_id', a.id,
                 'state', coalesce((
                   select s.status
                   from public.assignment_submissions s
                   where s.assignment_id = a.id and s.student_id = v_uid
                   order by s.submitted_at desc nulls last
                   limit 1
                 ), 'available')
               ) as act
        from public.assignments a
        where a.lesson_id = l.id and a.is_published
        union all
        select jsonb_build_object(
                 'sort', '05',
                 'kind', 'practice',
                 'title', 'Practice Questions',
                 'count', count(*),
                 'state', case when lp.id is not null then 'completed' else 'available' end
               ) as act
        from public.lesson_practice_questions pq
        where pq.lesson_id = l.id
        having count(*) > 0
      ) acts
    ), '[]'::jsonb) as activities
  from public.lessons l
  join public.chapters c on c.id = l.chapter_id
  left join public.lesson_releases lr on lr.lesson_id = l.id and lr.student_id = v_uid
  left join public.lesson_progress lp on lp.lesson_id = l.id and lp.student_id = v_uid and lp.completed
  left join ordered cur on cur.id = l.id
  left join ordered prev on prev.rn = cur.rn - 1
  left join public.lessons prev_l on prev_l.id = prev.id
  left join public.lesson_progress prev_lp on prev_lp.lesson_id = prev.id and prev_lp.student_id = v_uid and prev_lp.completed
  where l.course_id = p_course_id and l.is_published and c.is_published
  )
  select
    b.lesson_id,
    b.chapter_id,
    b.course_id,
    b.title,
    b.slug,
    b.teaching_mode,
    b.enable_coding_playground,
    b.duration_minutes,
    b.xp_reward,
    b.order_index,
    b.is_free_preview,
    b.chapter_title,
    b.chapter_order_index,
    b.access,
    b.reason,
    b.is_released,
    b.requires_activity_type,
    b.requires_activity_id,
    b.requires_activity_title,
    case
      when b.access = 'locked' then coalesce((
        select jsonb_agg(
                 case
                   when (b.requires_activity_type = 'quiz' and el ->> 'kind' = 'quiz' and el ->> 'quiz_id' = b.requires_activity_id::text)
                     or (b.requires_activity_type = 'assignment' and el ->> 'kind' = 'assignment' and el ->> 'assignment_id' = b.requires_activity_id::text)
                     then el
                   else jsonb_set(el, '{state}', '"locked"'::jsonb)
                 end
                 order by el ->> 'sort')
        from jsonb_array_elements(b.activities) el
      ), '[]'::jsonb)
      else b.activities
    end as activities
  from base b
  order by b.chapter_order_index, b.order_index;
end;
$$;


--

-- Name: get_student_lesson_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_student_lesson_access(p_lesson_id uuid) RETURNS TABLE(access text, reason text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.access, p.reason
  from public.lessons l
  join public.get_student_course_plan(l.course_id) p on p.lesson_id = l.id
  where l.id = p_lesson_id
  limit 1;
$$;


--

-- Name: get_ws_pending_sync_batch(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_ws_pending_sync_batch(p_limit integer, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_rows jsonb;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'registrationId',r.registration_id,'eventId',r.event_id,'fullName',r.full_name,'email',r.email,'mobile',r.mobile,
    'participantCategory',r.participant_category,'college',r.college,'qualification',r.qualification,'branch',r.branch,
    'academicYear',r.academic_year,'interestedTechnologies',r.interested_technologies,'expectation',r.expectation,
    'referralSource',r.referral_source,'createdAt',r.created_at,'emailStatus',r.email_status,'sheetSyncStatus',r.sheet_sync_status
  ) order by r.created_at), '[]'::jsonb)
  into v_rows
  from (
    select * from public.ws_registrations
    where sheet_sync_status <> 'Synced' or email_status = 'Queued'
    order by created_at
    limit greatest(1,least(coalesce(p_limit,50),100))
  ) r;
  return jsonb_build_object('ok',true,'registrations',v_rows);
end;
$$;


--

-- Name: get_ws_registration_snapshot(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_ws_registration_snapshot(p_event_id text, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_rows jsonb;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'timestamp', to_char(r.created_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'),
    'registrationId', r.registration_id,
    'eventId', r.event_id,
    'workshop', e.workshop_name,
    'workshopDate', e.workshop_date,
    'fullName', r.full_name,
    'email', r.email,
    'mobile', r.mobile,
    'participantCategory', r.participant_category,
    'college', r.college,
    'qualification', r.qualification,
    'branch', r.branch,
    'academicYear', r.academic_year,
    'interestedTechnologies', r.interested_technologies,
    'expectation', r.expectation,
    'referralSource', r.referral_source,
    'registrationStatus', r.registration_status,
    'emailStatus', r.email_status,
    'attendanceStatus', case when r.checked_in_at is null then 'Not Checked In' else 'Checked In' end,
    'checkInTime', case when r.checked_in_at is null then '' else to_char(r.checked_in_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') end,
    'checkedInBy', coalesce(r.checked_in_by,'')
  ) order by r.created_at desc), '[]'::jsonb)
  into v_rows
  from public.ws_registrations r join public.ws_workshop_events e on e.event_id=r.event_id
  where coalesce(p_event_id,'')='' or p_event_id='ALL' or r.event_id=p_event_id;
  return jsonb_build_object('ok',true,'registrations',v_rows,'generatedAt',to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'));
end;
$$;


--

-- Name: ingest_offline_exam(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ingest_offline_exam(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_ext_source text := coalesce(p_payload->>'external_source', 'kaveri_question_paper');
  v_ext_paper  text := nullif(p_payload->>'external_paper_id', '');
  v_course_id  uuid;
  v_title      text;
  v_status     text;
  v_existing   public.offline_exams%rowtype;
  v_now        timestamptz := now();
  v_event_id   uuid;
begin
  if v_ext_paper is null then
    raise exception 'external_paper_id is required';
  end if;

  v_title := nullif(p_payload->>'title', '');
  if v_title is null then
    raise exception 'exam title is required';
  end if;

  begin
    v_course_id := nullif(p_payload->>'course_id', '')::uuid;
  exception when others then
    v_course_id := null;
  end;

  -- Question Paper System status -> LMS exam status. Only finalized papers are
  -- real exams; archived papers cancel an existing exam and are otherwise
  -- ignored so draft paper events never leak into the LMS.
  v_status := lower(coalesce(p_payload->>'status', 'scheduled'));
  if v_status = 'finalized' then v_status := 'scheduled';
  elsif v_status = 'archived' then v_status := 'cancelled';
  end if;
  if v_status not in ('draft','scheduled','conducted','results_pending','results_published','cancelled') then
    raise exception 'unsupported exam status';
  end if;

  select * into v_existing
    from public.offline_exams
   where external_source = v_ext_source and external_paper_id = v_ext_paper
   for update;

  if v_existing.id is not null then
    if v_status = 'draft' then
      return jsonb_build_object('action','ignored_draft','exam_id', v_existing.id);
    end if;
    update public.offline_exams
       set title = v_title,
           course_id = coalesce(v_course_id, v_existing.course_id),
           batch_label = coalesce(nullif(p_payload->>'batch_label',''), v_existing.batch_label),
           external_set_id = coalesce(nullif(p_payload->>'external_set_id',''), v_existing.external_set_id),
           exam_date = coalesce((p_payload->>'exam_date')::date, v_existing.exam_date),
           start_time = coalesce((p_payload->>'start_time')::time, v_existing.start_time),
           duration_minutes = coalesce((p_payload->>'duration_minutes')::int, v_existing.duration_minutes),
           max_marks = coalesce((p_payload->>'max_marks')::numeric(8,2), v_existing.max_marks),
           student_instructions = coalesce(nullif(p_payload->>'student_instructions',''), v_existing.student_instructions),
           status = case
                      when v_existing.status in ('results_published','cancelled') then v_existing.status
                      else v_status
                    end
     where id = v_existing.id;
    return jsonb_build_object('action','updated','exam_id', v_existing.id, 'status', v_status);
  end if;

  if v_status in ('draft','cancelled') then
    -- Nothing to create: cancelled/draft-only papers are not exams.
    return jsonb_build_object('action','ignored_'||v_status,'exam_id', null::uuid);
  end if;

  insert into public.offline_exams (
    title, course_id, batch_label, external_source, external_paper_id,
    external_set_id, exam_date, start_time, duration_minutes, max_marks,
    student_instructions, status, created_by
  ) values (
    v_title, v_course_id, nullif(p_payload->>'batch_label',''), v_ext_source, v_ext_paper,
    nullif(p_payload->>'external_set_id',''),
    (p_payload->>'exam_date')::date,
    (p_payload->>'start_time')::time,
    (p_payload->>'duration_minutes')::int,
    (p_payload->>'max_marks')::numeric(8,2),
    nullif(p_payload->>'student_instructions',''),
    v_status,
    auth.uid()
  )
  returning id into v_existing.id;

  select record_notification_event(
    'offline_exam_scheduled',
    auth.uid(),
    null,
    'offline_exam',
    v_existing.id,
    jsonb_build_object('title', v_title, 'external_paper_id', v_ext_paper, 'exam_date', p_payload->>'exam_date'),
    'offline_exam_scheduled:' || v_ext_source || ':' || v_ext_paper
  ) into v_event_id;

  return jsonb_build_object('action','created','exam_id', v_existing.id, 'status', v_status);
end;
$$;


--

-- Name: ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamp with time zone, text, text, text, timestamp with time zone, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ingest_workshop_registration(p_source text, p_external_workshop_id text, p_external_registration_id text, p_workshop_name text, p_email text, p_full_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_workshop_slug text DEFAULT NULL::text, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_venue text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_registration_status text DEFAULT 'registered'::text, p_registered_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL::text, p_action text DEFAULT 'workshop.registration.upsert'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_email text;
  v_workshop_id uuid;
  v_registration_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_duplicate boolean := false;
  v_summary jsonb;
  v_venue text;
  v_slug text;
  v_mode text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  v_email := lower(btrim(p_email));

  if v_email = '' or v_email is null then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_external_workshop_id is null or p_external_workshop_id = '' then
    raise exception 'INVALID_EXTERNAL_WORKSHOP_ID';
  end if;
  if p_external_registration_id is null or p_external_registration_id = '' then
    raise exception 'INVALID_EXTERNAL_REGISTRATION_ID';
  end if;

  -- Blank strings are "unknown", never "erase": existing central values
  -- are preserved via the coalesce upsert below.
  v_venue := nullif(btrim(coalesce(p_venue, '')), '');
  v_slug := nullif(btrim(coalesce(p_workshop_slug, '')), '');
  v_mode := case when p_mode in ('online', 'offline', 'hybrid') then p_mode else null end;

  -- Idempotency: an already-processed key answers duplicate without
  -- mutating anything again.
  if p_idempotency_key is not null then
    select true, request_summary into v_duplicate, v_summary
    from public.integration_audit_log
    where source = p_source
      and action = p_action
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_duplicate then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'registration_id', coalesce(v_summary ->> 'registration_id', null),
        'result', coalesce(v_summary ->> 'result', 'already processed')
      );
    end if;
  end if;

  -- Upsert the workshop (stable source + external key). Metadata refreshes
  -- only when the incoming payload actually carries metadata.
  insert into public.workshops (
    source, external_workshop_id, name, slug, starts_at, venue, mode, metadata
  )
  values (
    p_source, p_external_workshop_id, p_workshop_name, v_slug,
    p_starts_at, v_venue, v_mode, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source, external_workshop_id) do update
    set name = excluded.name,
        slug = coalesce(excluded.slug, workshops.slug),
        starts_at = coalesce(excluded.starts_at, workshops.starts_at),
        venue = coalesce(excluded.venue, workshops.venue),
        mode = coalesce(excluded.mode, workshops.mode),
        metadata = case when excluded.metadata <> '{}'::jsonb
                        then excluded.metadata else workshops.metadata end,
        updated_at = now()
  returning id into v_workshop_id;

  -- Account linking ONLY when the Supabase Auth email is verified/confirmed.
  -- A profiles.email string alone is never proof of ownership.
  select p.id into v_user_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
    and u.email_confirmed_at is not null
    and p.is_active = true
  limit 1;

  -- Upsert the registration (stable source + external key).
  insert into public.workshop_registrations (
    workshop_id, source, external_registration_id, user_id, email, full_name,
    phone, status, registered_at, metadata
  )
  values (
    v_workshop_id, p_source, p_external_registration_id, v_user_id, v_email,
    nullif(p_full_name, ''), nullif(p_phone, ''), p_registration_status,
    coalesce(p_registered_at, now()), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source, external_registration_id) do update
    set workshop_id = excluded.workshop_id,
        -- Never unlink a previously linked verified user on a replay; only
        -- upgrade an external lead to a linked user when now verified.
        user_id = coalesce(workshop_registrations.user_id, excluded.user_id),
        full_name = coalesce(excluded.full_name, workshop_registrations.full_name),
        phone = coalesce(excluded.phone, workshop_registrations.phone),
        status = excluded.status,
        registered_at = coalesce(excluded.registered_at, workshop_registrations.registered_at),
        metadata = case when excluded.metadata <> '{}'::jsonb
                        then excluded.metadata else workshop_registrations.metadata end,
        updated_at = now()
  returning id into v_registration_id;

  -- One append-only event per registration (idempotent per dedupe key).
  v_event_id := public.record_notification_event(
    'workshop_registered',
    null,
    v_user_id,
    'workshop_registration',
    v_registration_id,
    jsonb_build_object(
      'workshop_id', v_workshop_id,
      'workshop_name', p_workshop_name,
      'workshop_slug', v_slug,
      'starts_at', p_starts_at,
      'venue', v_venue,
      'registration_id', v_registration_id,
      'external_registration_id', p_external_registration_id,
      'linked_user_id', v_user_id,
      'linked', v_user_id is not null
    ),
    'workshop_registered:' || v_registration_id::text
  );

  -- In-app notification for linked users only, deduped by the stable
  -- registration identity so a replay under a different idempotency key
  -- can never stack duplicate confirmations. NO EMAIL: Apps Script stays
  -- the single registration confirmation source (single-source rule).
  if v_user_id is not null then
    if not exists (
      select 1
      from public.notifications n
      where n.user_id = v_user_id
        and n.reference_type = 'workshop_registration'
        and n.reference_id = v_registration_id
    ) then
      perform public.kaveri_notify(
        v_user_id,
        'Workshop registration confirmed',
        'Your registration for "' || p_workshop_name || '" is confirmed.' ||
          case when p_starts_at is not null
               then ' Scheduled for ' || to_char(p_starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || '.' else '' end,
        'workshop',
        v_registration_id, 'workshop_registration',
        case when v_slug is not null and v_slug <> ''
             then '/workshops/' || v_slug else null end
      );
    end if;
  end if;

  -- Audit trail (only after a successful mutation).
  insert into public.integration_audit_log (
    source, action, idempotency_key, request_sha256,
    request_summary, response_code, result
  )
  values (
    p_source, p_action,
    coalesce(p_idempotency_key, 'manual:' || v_registration_id::text),
    null,
    jsonb_build_object(
      'external_workshop_id', p_external_workshop_id,
      'external_registration_id', p_external_registration_id,
      'registration_id', v_registration_id,
      'linked_user_id', v_user_id,
      'linked', v_user_id is not null,
      'email_domain', coalesce(split_part(v_email, '@', 2), '')
    ),
    200,
    'processed'
  )
  on conflict (source, action, idempotency_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'registration_id', v_registration_id,
    'workshop_id', v_workshop_id,
    'linked_user_id', v_user_id,
    'linked', v_user_id is not null,
    'event_id', v_event_id
  );
end;
$$;


--

-- Name: is_faculty_for_course(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_faculty_for_course(course_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM course_faculty
    WHERE course_faculty.course_id = $1
    AND faculty_id = auth.uid()
  );
END;
$_$;


--

-- Name: is_published_coding_question(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_published_coding_question(p_question_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.coding_questions q
    where q.id = p_question_id
      and q.is_published = true
  );
$$;


--

-- Name: is_self_or_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_self_or_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT auth.uid() = p_user_id OR is_admin();
$$;


--

-- Name: is_student_enrolled(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.is_student_enrolled(course_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_enrollments.course_id = $1
    AND student_id = auth.uid()
    AND access_status = 'active'
  );
END;
$_$;


--

-- Name: join_batch_by_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.join_batch_by_code(p_code text) RETURNS TABLE(batch_id uuid, batch_name text, membership_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_batch public.batches%rowtype;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_batch
  from public.batches
  where upper(join_code) = upper(trim(p_code))
    and status = 'active'
  limit 1;

  if v_batch.id is null then
    raise exception 'Invalid or inactive batch code.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user
      and p.role = 'student'
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'Only active student accounts can join a batch.';
  end if;

  insert into public.batch_students (batch_id, student_id, status)
  values (v_batch.id, v_user, 'active')
  on conflict (batch_id, student_id)
  do update set status = 'active';

  return query
  select v_batch.id, v_batch.name, 'active'::text;
end;
$$;


--

-- Name: join_coding_live_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.join_coding_live_class(p_batch_id uuid) RETURNS TABLE(unlocked_count integer, batch_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer := 0;
  v_batch_name text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'student' and coalesce(p.is_active, true) = true
  ) then raise exception 'Only active student accounts can join a live class'; end if;

  select b.name into v_batch_name
  from public.batch_students bs
  join public.batches b on b.id = bs.batch_id
  where bs.student_id = auth.uid()
    and bs.status = 'active'
    and b.status = 'active'
    and b.id = p_batch_id;

  if v_batch_name is null then raise exception 'You are not enrolled in this active batch'; end if;

  insert into public.coding_vscode_student_assignment_access (
    student_id, assignment_id, batch_id, source, granted_at, granted_by
  )
  select auth.uid(), ab.assignment_id, ab.batch_id, 'live_attendance', now(), null
  from public.coding_vscode_assignment_batches ab
  join public.coding_vscode_assignments a on a.id = ab.assignment_id
  where ab.batch_id = p_batch_id
    and a.is_published = true
    and ab.is_unlocked = true
    and ab.live_until is not null
    and ab.live_until > now()
  on conflict (student_id, assignment_id, batch_id)
  do update set source = 'live_attendance', granted_at = least(public.coding_vscode_student_assignment_access.granted_at, excluded.granted_at);

  get diagnostics v_count = row_count;

  if v_count = 0 and not exists (
    select 1 from public.coding_vscode_assignment_batches ab
    where ab.batch_id = p_batch_id
      and ab.is_unlocked = true
      and ab.live_until is not null
      and ab.live_until > now()
  ) then
    raise exception 'There is no live coding class active for this batch right now';
  end if;

  return query select v_count, v_batch_name;
end;
$$;


--

-- Name: kaveri_notify(uuid, text, text, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.kaveri_notify(p_user_id uuid, p_title text, p_message text, p_type text DEFAULT 'info'::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_type text DEFAULT NULL::text, p_action_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (
    user_id, title, message, type, reference_id, reference_type, action_url
  )
  values (
    p_user_id, p_title, p_message, p_type,
    p_reference_id, p_reference_type, p_action_url
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;


--

-- Name: kaveri_queue_email(uuid, text, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.kaveri_queue_email(p_recipient_user_id uuid, p_template_key text, p_payload jsonb, p_dedupe_key text DEFAULT NULL::text, p_event_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_outbox_id uuid;
begin
  insert into public.notification_outbox (
    event_id, channel, template_key, recipient_user_id, recipient_email,
    recipient_name, payload, dedupe_key
  )
  select
    p_event_id, 'email', p_template_key, pr.id, pr.email, pr.full_name,
    coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  from public.profiles pr
  where pr.id = p_recipient_user_id
    and pr.email is not null
  on conflict (dedupe_key) where dedupe_key is not null
    do nothing
  returning id into v_outbox_id;

  -- Conflict (already queued) → return the existing row for idempotency.
  if v_outbox_id is null and p_dedupe_key is not null then
    select id into v_outbox_id
    from public.notification_outbox
    where dedupe_key = p_dedupe_key
    limit 1;
  end if;

  return v_outbox_id;
end;
$$;


--

-- Name: mark_ws_sync_results(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.mark_ws_sync_results(p_results jsonb, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare item jsonb; v_count integer:=0;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  for item in select * from jsonb_array_elements(coalesce(p_results,'[]'::jsonb)) loop
    update public.ws_registrations
      set sheet_sync_status = coalesce(nullif(item->>'sheetSyncStatus',''),sheet_sync_status),
          email_status = coalesce(nullif(item->>'emailStatus',''),email_status),
          updated_at=now()
      where registration_id=item->>'registrationId';
    if found then v_count:=v_count+1; end if;
  end loop;
  return jsonb_build_object('ok',true,'updated',v_count);
end;
$$;


--

-- Name: notification_delivery_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.notification_delivery_health() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_mode text;
  v_mailer_configured boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select coalesce(value ->> 'mode', 'disabled') into v_mode
  from public.kaveri_app_settings
  where key = 'email_delivery';

  select coalesce(nullif(value ->> 'mailer_url', ''), '') <> '' into v_mailer_configured
  from public.kaveri_app_settings
  where key = 'email_delivery';

  return jsonb_build_object(
    'ok', true,
    'as_of', now(),
    'email', jsonb_build_object(
      'mode', v_mode,
      'mailer_configured', coalesce(v_mailer_configured, false),
      'queued', (select count(*) from public.notification_outbox where status = 'queued'),
      'sending', (select count(*) from public.notification_outbox where status = 'sending'),
      'delivering', (select count(*) from public.notification_outbox where status = 'delivering'),
      'failed', (select count(*) from public.notification_outbox where status = 'failed'),
      'skipped', (select count(*) from public.notification_outbox where status = 'skipped'),
      'sent_last_1h', (select count(*) from public.notification_outbox
                        where status = 'sent' and sent_at > now() - interval '1 hour'),
      'sent_last_24h', (select count(*) from public.notification_outbox
                         where status = 'sent' and sent_at > now() - interval '24 hours'),
      'oldest_queued_age_seconds',
        (select extract(epoch from now() - min(next_attempt_at))::int
         from public.notification_outbox
         where status in ('queued', 'sending') and attempts < max_attempts)
    ),
    'events_total', (select count(*) from public.notification_events)
  );
end;
$$;


--

-- Name: offline_exam_course_writable(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exam_course_writable(p_course_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_admin()
         or (p_course_id is not null and public.is_faculty_for_course(p_course_id));
$$;


--

-- Name: offline_exam_manageable(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exam_manageable(p_exam_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
      from public.offline_exams e
     where e.id = p_exam_id
       and (public.is_admin()
            or (e.course_id is not null and public.is_faculty_for_course(e.course_id)))
  );
$$;


--

-- Name: offline_exam_results_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exam_results_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'offline_exam_result_saved'
      when new.status = 'published' and old.status = 'evaluated' then 'offline_exam_result_published'
      else 'offline_exam_result_updated'
    end,
    'offline_exam',
    new.exam_id,
    jsonb_build_object(
      'student_id', new.student_id,
      'marks_obtained', new.marks_obtained,
      'status', new.status,
      'published_at', new.published_at
    )
  );
  return new;
end;
$$;


--

-- Name: offline_exam_results_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exam_results_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if (tg_op = 'UPDATE' and old.status = 'published')
     and (auth.role() is distinct from 'service_role') then
    raise exception 'Published offline exam results are locked';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'evaluated';
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end;
$$;


--

-- Name: offline_exam_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exam_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--

-- Name: offline_exams_status_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.offline_exams_status_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.status is distinct from old.status then
    insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      'offline_exam_status_changed',
      'offline_exam',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;


--

-- Name: on_enrollment_request_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.on_enrollment_request_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.status = 'pending' then
    perform public.process_enrollment_event('enrollment_request_created', new.id);
  end if;
  return new;
end;
$$;


--

-- Name: process_enrollment_event(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.process_enrollment_event(p_event_type text, p_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests%rowtype;
  v_course   public.courses%rowtype;
  v_student  public.profiles%rowtype;
  v_event_id uuid;
  v_staff    uuid;
  v_base_payload jsonb;
  v_action_url text;
begin
  if p_event_type not in (
    'enrollment_request_created', 'enrollment_approved', 'enrollment_rejected'
  ) then
    raise exception 'UNSUPPORTED_ENROLLMENT_EVENT';
  end if;

  select * into v_request from public.enrollment_requests where id = p_request_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  select * into v_course from public.courses where id = v_request.course_id;
  select * into v_student from public.profiles where id = v_request.student_id;

  if v_course.id is null or v_student.id is null then
    raise exception 'ENROLLMENT_EVENT_CONTEXT_MISSING';
  end if;

  v_action_url := '/courses/' || coalesce(v_course.slug, '');

  v_base_payload := jsonb_build_object(
    'request_id', v_request.id,
    'student_id', v_student.id,
    'student_name', v_student.full_name,
    'student_email', v_student.email,
    'course_id', v_course.id,
    'course_title', v_course.title,
    'course_slug', v_course.slug,
    'requested_at', v_request.requested_at,
    'request_message', v_request.message
  );

  -- One append-only event per business action (idempotent per dedupe key).
  v_event_id := public.record_notification_event(
    p_event_type,
    (select auth.uid()),
    v_student.id,
    'course_enrollment_request',
    v_request.id,
    v_base_payload,
    p_event_type || ':' || v_request.id::text
  );

  if p_event_type = 'enrollment_request_created' then
    -- Student ack (in-app only).
    perform public.kaveri_notify(
      v_student.id,
      'Request received',
      'We received your access request for "' || v_course.title ||
        '". Our team will review it and you will be notified.',
      'info',
      v_request.id, 'enrollment_request', v_action_url
    );

    -- Notify + email admissions staff (super admins).
    for v_staff in
      select p.id from public.profiles p
      where p.role = 'super_admin' and p.is_active = true
    loop
      perform public.kaveri_notify(
        v_staff,
        'New enrollment request',
        v_student.full_name || ' requested access to "' || v_course.title || '".',
        'enrollment',
        v_request.id, 'enrollment_request', '/admin/enrollments/requests'
      );
      perform public.kaveri_queue_email(
        v_staff,
        'enrollment_request_created',
        v_base_payload,
        'enrollment_request_created:' || v_request.id::text || ':staff:' || v_staff::text,
        v_event_id
      );
    end loop;

  elsif p_event_type = 'enrollment_approved' then
    perform public.kaveri_notify(
      v_student.id,
      'Course access approved',
      'Your request for "' || v_course.title || '" was approved — the course is now available to you.',
      'success',
      v_request.id, 'enrollment_request', v_action_url
    );
    perform public.kaveri_queue_email(
      v_student.id,
      'enrollment_approved',
      v_base_payload,
      'enrollment_approved:' || v_request.id::text,
      v_event_id
    );

  elsif p_event_type = 'enrollment_rejected' then
    perform public.kaveri_notify(
      v_student.id,
      'Course access request not approved',
      'Your request for "' || v_course.title ||
        '" was not approved' ||
        case when v_request.review_note is not null and v_request.review_note <> ''
          then ': ' || v_request.review_note else '. Contact Kaveri if you believe this is an error.' end,
      'error',
      v_request.id, 'enrollment_request', v_action_url
    );
    perform public.kaveri_queue_email(
      v_student.id,
      'enrollment_rejected',
      jsonb_build_object(
        'review_note', v_request.review_note,
        'reviewed_at', v_request.reviewed_at
      ) || v_base_payload,
      'enrollment_rejected:' || v_request.id::text,
      v_event_id
    );
  end if;

  return v_event_id;
end;
$$;


--

-- Name: process_notification_outbox(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.process_notification_outbox(p_batch_size integer DEFAULT 25) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_mode text;
  v_mailer_url text;
  v_token text;
  v_gateway_jwt text;
  v_claimed uuid[];
  v_item uuid;
  v_row public.notification_outbox%rowtype;
  v_delivered int := 0;
  v_failed int := 0;
  v_skipped int := 0;
  v_transient int := 0;
  v_enqueued int := 0;
  v_job_id bigint;
  v_backoff interval;
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'INVALID_BATCH_SIZE';
  end if;

  select coalesce(value ->> 'mode', 'disabled')
  into v_mode
  from public.kaveri_app_settings
  where key = 'email_delivery';

  -- Claim due rows (row locks: concurrent workers never claim twice).
  -- Stale 'delivering' rows (mailer crashed after claim) are reclaimed.
  select array_agg(claimed.id)
  into v_claimed
  from (
    select o.id
    from public.notification_outbox o
    where (
        (o.status in ('queued', 'sending') and o.attempts < o.max_attempts and o.next_attempt_at <= now())
        or (o.status = 'delivering' and o.delivery_claimed_at < now() - interval '10 minutes')
      )
      and o.attempts < o.max_attempts
    order by o.created_at asc
    limit p_batch_size
    for update skip locked
  ) claimed;

  -- Rows that have exhausted retries are permanently failed (never linger).
  update public.notification_outbox
  set status = 'failed',
      last_error = 'MAX_ATTEMPTS_EXCEEDED',
      delivery_claimed_at = null,
      updated_at = now()
  where status in ('queued', 'sending', 'delivering')
    and attempts >= max_attempts;

  foreach v_item in array coalesce(v_claimed, array[]::uuid[]) loop
    select * into v_row from public.notification_outbox where id = v_item;

    v_backoff := (interval '1 minute') * least(power(2, v_row.attempts), 60);

    if v_mode = 'simulate_failure' then
      -- Dev/diagnostic mode: first attempt fails transiently, later succeeds.
      if (v_row.payload ->> 'simulated_failure_applied') is null then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            payload = payload || '{"simulated_failure_applied": true}'::jsonb,
            last_error = 'simulated transient delivery failure',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
      else
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'sent',
            sent_at = now(),
            last_error = null,
            updated_at = now()
        where id = v_item;
        v_delivered := v_delivered + 1;
      end if;

    elsif v_mode = 'pg_net' then
      if to_regnamespace('net') is null then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'PG_NET_UNAVAILABLE: pg_net extension not enabled',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end if;

      select value ->> 'mailer_url' into v_mailer_url
      from public.kaveri_app_settings
      where key = 'email_delivery';

      select decrypted_secret into v_token
      from vault.decrypted_secrets
      where name = 'notification_mailer_token';

      -- Gateway pass: the functions gateway requires a valid Supabase JWT
      -- in Authorization. The anon key is public; the real authorization
      -- is the X-Kaveri-Mailer-Token header verified by the function.
      select decrypted_secret into v_gateway_jwt
      from vault.decrypted_secrets
      where name = 'supabase_anon_key';

      if v_mailer_url is null or v_mailer_url = ''
         or v_token is null or v_token = ''
         or v_gateway_jwt is null or v_gateway_jwt = '' then
        update public.notification_outbox
        set attempts = attempts + 1,
            status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'MAILER_NOT_CONFIGURED: set email_delivery.mailer_url and vault secrets notification_mailer_token + supabase_anon_key',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end if;

      -- Claim for delivery (self-heals after 10 min if the mailer never
      -- answers).
      update public.notification_outbox
      set status = 'sending',
          attempts = attempts + 1,
          next_attempt_at = now() + interval '10 minutes',
          last_error = null,
          updated_at = now()
      where id = v_item;

      begin
        -- net.http_post(url, body, params, headers, timeout_ms)
        -- Body is ONLY the outbox id: the mailer treats the DB row as the
        -- single authority for message content.
        select net.http_post(
          v_mailer_url,
          jsonb_build_object('outbox_id', v_row.id),
          '{}'::jsonb,
          jsonb_build_object(
            'authorization', 'Bearer ' || v_gateway_jwt,
            'x-kaveri-mailer-token', v_token,
            'content-type', 'application/json'
          ),
          10000
        ) into v_job_id;
      exception when others then
        update public.notification_outbox
        set status = 'queued',
            next_attempt_at = now() + v_backoff,
            last_error = 'PG_NET_ENQUEUE_FAILED',
            updated_at = now()
        where id = v_item;
        v_transient := v_transient + 1;
        continue;
      end;

      update public.notification_outbox
      set payload = payload || jsonb_build_object(
            'pg_net_jobs', coalesce(payload -> 'pg_net_jobs', '[]'::jsonb)
              || jsonb_build_array(v_job_id)
          ),
          updated_at = now()
      where id = v_item;
      v_enqueued := v_enqueued + 1;

    else
      -- mode = 'disabled' (local default): durable queue, honestly skipped.
      update public.notification_outbox
      set attempts = attempts + 1,
          status = 'skipped',
          last_error = 'email delivery disabled (kaveri_app_settings email_delivery); requeue when a provider is configured',
          updated_at = now()
      where id = v_item;
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'claimed', coalesce(array_length(v_claimed, 1), 0),
    'mode', v_mode,
    'delivered', v_delivered,
    'enqueued_to_mailer', v_enqueued,
    'transient_retry', v_transient,
    'skipped_no_provider', v_skipped,
    'failed', v_failed
  );
end;
$$;


--

-- Name: publish_offline_exam_results(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.publish_offline_exam_results(p_exam_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_exam public.offline_exams%rowtype;
  v_student uuid;
  v_published int := 0;
  v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_exam from public.offline_exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if not public.offline_exam_manageable(p_exam_id) then
    raise exception 'OFFLINE_EXAM_FORBIDDEN';
  end if;
  if v_exam.status in ('results_published','cancelled','draft') then
    raise exception 'Exam is not open for publication';
  end if;

  update public.offline_exam_results
     set status = 'published', published_at = now(), published_by = auth.uid()
   where exam_id = p_exam_id and status = 'evaluated';

  get diagnostics v_published = row_count;

  if v_published = 0 then
    raise exception 'No evaluated results to publish';
  end if;

  update public.offline_exams set status = 'results_published' where id = p_exam_id;

  for v_student in
    select r.student_id from public.offline_exam_results r
     where r.exam_id = p_exam_id and r.status = 'published'
  loop
    perform public.kaveri_notify(
      v_student,
      'Offline exam result published',
      'Your result for "' || v_exam.title || '" is now available.',
      'exam',
      p_exam_id,
      'offline_exam',
      '/student/offline-exams'
    );
  end loop;

  select record_notification_event(
    'offline_exam_result_published',
    auth.uid(),
    null,
    'offline_exam',
    p_exam_id,
    jsonb_build_object('title', v_exam.title, 'published', v_published),
    'offline_exam_result_published:' || p_exam_id::text
  ) into v_event_id;

  return jsonb_build_object('published', v_published, 'exam_status', 'results_published');
end;
$$;


--

-- Name: qp_finalize_paper(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.qp_finalize_paper(p_paper_id uuid) RETURNS TABLE(version_id uuid, version_number integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_paper public.qp_papers%rowtype;
  v_snapshot jsonb;
  v_version_id uuid;
  v_version_number integer;
  v_finalized_at timestamptz := now();
  v_course_context jsonb := 'null'::jsonb;
  v_faculty_context jsonb := 'null'::jsonb;
  v_company_context jsonb := '{}'::jsonb;
  v_template_context jsonb := '{}'::jsonb;
begin
  if v_uid is null or not public.qp_is_active_faculty_or_admin() then
    raise exception 'Active faculty or Super Admin access required.';
  end if;

  select p.* into v_paper from public.qp_papers p where p.id=p_paper_id for update;
  if not found then raise exception 'Paper not found.'; end if;
  if not public.qp_is_super_admin() and v_paper.created_by <> v_uid then raise exception 'You do not have access to finalize this paper.'; end if;
  if v_paper.status <> 'draft' then raise exception 'Only draft papers can be finalized.'; end if;
  if not exists (select 1 from public.qp_sets s where s.paper_id=p_paper_id) then raise exception 'Paper has no sets.'; end if;
  if exists (
    select 1 from public.qp_sets s where s.paper_id=p_paper_id
      and not exists (select 1 from public.qp_paper_questions q where q.set_id=s.id)
  ) then raise exception 'Every set must contain at least one question.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and btrim(coalesce(q.content_plain_text,''))=''
  ) then raise exception 'Paper contains an empty question.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and q.question_type='mcq'
      and jsonb_array_length(coalesce(q.mcq_options,'[]'::jsonb)) < 2
  ) then raise exception 'Every MCQ must contain at least two options.'; end if;
  if exists (
    select 1 from public.qp_paper_questions q join public.qp_sets s on s.id=q.set_id
    where s.paper_id=p_paper_id and q.question_type='mcq'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(q.mcq_options,'[]'::jsonb)) opt
        where opt->>'is_correct'='true'
      )
  ) then raise exception 'Every MCQ must have at least one correct option.'; end if;

  if v_paper.course_id is not null then
    select jsonb_build_object('id',c.id,'title',c.title) into v_course_context
    from public.courses c where c.id=v_paper.course_id;
    v_course_context := coalesce(v_course_context,'null'::jsonb);
  end if;

  select jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email)
    into v_faculty_context from public.profiles p where p.id=v_paper.created_by;
  v_faculty_context := coalesce(v_faculty_context,'null'::jsonb);

  select coalesce(s.value,'{}'::jsonb) into v_company_context
    from public.qp_settings s where s.key='company';
  v_company_context := coalesce(v_company_context,'{}'::jsonb);

  select coalesce(s.value,'{}'::jsonb) into v_template_context
    from public.qp_settings s where s.key='template_defaults';
  v_template_context := coalesce(v_template_context,'{}'::jsonb);

  v_version_number := coalesce(v_paper.current_version,0)+1;

  select jsonb_build_object(
    'paper', to_jsonb(v_paper) || jsonb_build_object('status','finalized','current_version',v_version_number,'finalized_by',v_uid,'finalized_at',v_finalized_at),
    'display_context', jsonb_build_object('course',v_course_context,'faculty',v_faculty_context,'company',v_company_context,'template',v_template_context),
    'sets', coalesce((
      select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'questions', coalesce((
            select jsonb_agg(
              to_jsonb(q) || jsonb_build_object(
                'assets', coalesce((
                  select jsonb_agg(to_jsonb(a) order by a.order_index,a.created_at,a.id)
                  from public.qp_question_assets a where a.paper_question_id=q.id
                ),'[]'::jsonb)
              ) order by q.order_index,q.created_at,q.id
            ) from public.qp_paper_questions q where q.set_id=s.id
          ),'[]'::jsonb)
        ) order by s.order_index,s.created_at,s.id
      ) from public.qp_sets s where s.paper_id=p_paper_id
    ),'[]'::jsonb),
    'snapshot_at',v_finalized_at
  ) into v_snapshot;

  insert into public.qp_paper_versions (paper_id,version_number,snapshot,finalized_by,finalized_at)
  values (p_paper_id,v_version_number,v_snapshot,v_uid,v_finalized_at)
  returning id into v_version_id;

  perform set_config('kaveri.qp_finalizing','1',true);

  update public.qp_papers set
    status='finalized',
    current_version=v_version_number,
    finalized_by=v_uid,
    finalized_at=v_finalized_at,
    updated_by=v_uid
  where id=p_paper_id;

  return query select v_version_id,v_version_number;
end;
$$;


--

-- Name: qp_storage_path_is_unreferenced(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.qp_storage_path_is_unreferenced(p_path text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (
    select 1 from public.qp_question_assets a
    where a.storage_path = p_path
  );
$$;


--

-- Name: record_notification_event(text, uuid, uuid, text, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.record_notification_event(p_event_type text, p_actor_user_id uuid, p_subject_user_id uuid, p_entity_type text, p_entity_id uuid, p_payload jsonb, p_dedupe_key text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_event_id uuid;
begin
  insert into public.notification_events (
    event_type, actor_user_id, subject_user_id, entity_type, entity_id,
    payload, dedupe_key
  )
  values (
    p_event_type, p_actor_user_id, p_subject_user_id, p_entity_type,
    p_entity_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null
    do nothing
  returning id into v_event_id;

  -- Duplicate dedupe_key → return the ORIGINAL event id; the payload of
  -- an already-recorded event is immutable and is never rewritten.
  if v_event_id is null and p_dedupe_key is not null then
    select id into v_event_id
    from public.notification_events
    where dedupe_key = p_dedupe_key;
  end if;

  return v_event_id;
end;
$$;


--

-- Name: register_workshop_participant(text, text, text, text, text, text, text, text, text, text[], text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.register_workshop_participant(p_event_id text, p_full_name text, p_email text, p_mobile text, p_participant_category text, p_college text, p_qualification text, p_branch text, p_academic_year text, p_interested_technologies text[], p_expectation text, p_referral_source text, p_consent boolean) RETURNS TABLE(status text, registration_id text, existing_registration_id text, message text, email_status text, sheet_sync_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_event public.ws_workshop_events%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  v_existing text;
  v_sequence bigint;
  v_registration_id text;
begin
  if length(trim(coalesce(p_event_id, ''))) < 4 then
    return query select 'validation', null::text, null::text, 'Event ID is required.', null::text, null::text;
    return;
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    return query select 'validation', null::text, null::text, 'Full name is required.', null::text, null::text;
    return;
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return query select 'validation', null::text, null::text, 'Enter a valid email address.', null::text, null::text;
    return;
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return query select 'validation', null::text, null::text, 'Enter a valid 10-digit Indian mobile number.', null::text, null::text;
    return;
  end if;
  if not coalesce(p_consent, false) then
    return query select 'validation', null::text, null::text, 'Consent is required.', null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_event_id) || '|' || v_email || '|' || v_mobile, 0));

  select r.registration_id into v_existing
  from public.ws_registrations r
  where r.event_id = trim(p_event_id)
    and (lower(r.email) = v_email or r.mobile = v_mobile)
  order by r.created_at asc
  limit 1;

  if v_existing is not null then
    return query select 'duplicate', null::text, v_existing, 'You are already registered for this workshop.', null::text, null::text;
    return;
  end if;

  update public.ws_workshop_events e
  set registered_count = e.registered_count + 1,
      next_sequence = e.next_sequence + 1,
      updated_at = now()
  where e.event_id = trim(p_event_id)
    and e.registrations_open = true
    and (e.max_seats = 0 or e.registered_count < e.max_seats)
  returning e.* into v_event;

  if not found then
    select * into v_event from public.ws_workshop_events e where e.event_id = trim(p_event_id);
    if not found then
      return query select 'error', null::text, null::text, 'This workshop could not be found. Refresh the page and try again.', null::text, null::text;
    elsif not v_event.registrations_open then
      return query select 'error', null::text, null::text, 'Registrations are currently closed for this workshop.', null::text, null::text;
    else
      return query select 'error', null::text, null::text, 'This workshop is full. No seats are currently available.', null::text, null::text;
    end if;
    return;
  end if;

  v_sequence := v_event.next_sequence;
  v_registration_id := v_event.event_id || '-' || lpad(v_sequence::text, 4, '0');

  begin
    insert into public.ws_registrations (
      registration_id, event_id, full_name, email, mobile,
      participant_category, college, qualification, branch, academic_year,
      interested_technologies, expectation, referral_source, consent
    ) values (
      v_registration_id, v_event.event_id, trim(p_full_name), v_email, v_mobile,
      trim(coalesce(p_participant_category, '')), trim(coalesce(p_college, '')),
      trim(coalesce(p_qualification, '')), trim(coalesce(p_branch, '')),
      trim(coalesce(p_academic_year, '')), coalesce(p_interested_technologies, '{}'),
      trim(coalesce(p_expectation, '')), trim(coalesce(p_referral_source, '')), true
    );
  exception when unique_violation then
    update public.ws_workshop_events
      set registered_count = greatest(registered_count - 1, 0), updated_at = now()
      where event_id = v_event.event_id;
    select r.registration_id into v_existing
      from public.ws_registrations r
      where r.event_id = v_event.event_id
        and (lower(r.email) = v_email or r.mobile = v_mobile)
      order by r.created_at asc limit 1;
    return query select 'duplicate', null::text, v_existing, 'You are already registered for this workshop.', null::text, null::text;
    return;
  end;

  return query select 'success', v_registration_id, null::text, 'Registration confirmed.', 'Queued', 'Queued';
end;
$_$;


--

-- Name: reject_enrollment_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.reject_enrollment_request(p_request_id uuid, p_review_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_request public.enrollment_requests%rowtype;
begin
  if not is_admin() then
    raise exception 'INSUFFICIENT_PRIVILEGE';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  update public.enrollment_requests
  set status = 'rejected',
      review_note = p_review_note,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
  where id = p_request_id;

  -- Emit event + in-app + outbox (same transaction; async delivery).
  perform public.process_enrollment_event('enrollment_rejected', p_request_id);

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'rejected');
end;
$$;


--

-- Name: release_coding_assignments_permanently(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.release_coding_assignments_permanently(p_batch_id uuid, p_assignment_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_assignment uuid;
  v_count integer := 0;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;
  if coalesce(array_length(p_assignment_ids, 1), 0) = 0 then raise exception 'Select at least one question'; end if;
  if not exists (select 1 from public.batches b where b.id = p_batch_id and b.status = 'active') then
    raise exception 'Active batch not found';
  end if;

  foreach v_assignment in array p_assignment_ids loop
    if not exists (
      select 1 from public.coding_vscode_assignments a
      where a.id = v_assignment and a.is_published = true and a.language = 'python'
    ) then raise exception 'Published Python question not found'; end if;

    insert into public.coding_vscode_assignment_batches (
      assignment_id, batch_id, is_unlocked, unlocked_at, locked_at, live_until,
      is_permanently_released, updated_at, updated_by
    ) values (
      v_assignment, p_batch_id, false, null, null, null,
      true, now(), auth.uid()
    )
    on conflict on constraint coding_vscode_assignment_batches_assignment_id_batch_id_key
    do update set
      is_permanently_released = true,
      updated_at = now(),
      updated_by = auth.uid();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


--

-- Name: release_lesson_for_student(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.release_lesson_for_student(p_student_id uuid, p_lesson_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson_id and l.is_published = true;

  if v_course_id is null then
    raise exception 'Published lesson not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to release lessons for this course.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id and ce.student_id = p_student_id and ce.access_status = 'active'
  ) then
    raise exception 'Student is not actively enrolled in this course.' using errcode = '42501';
  end if;

  insert into public.lesson_releases (student_id, lesson_id, course_id, source, granted_by)
  values (p_student_id, p_lesson_id, v_course_id, 'manual', auth.uid())
  on conflict (student_id, lesson_id)
  do update set granted_by = excluded.granted_by, granted_at = now(), source = 'manual';
end;
$$;


--

-- Name: request_coding_assignment_access(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.request_coding_assignment_access(p_assignment_id uuid, p_batch_id uuid, p_reason text DEFAULT NULL::text) RETURNS TABLE(request_id uuid, request_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student' and coalesce(p.is_active, true) = true
  ) then raise exception 'Only active student accounts can request access'; end if;

  if exists (
    select 1
    from public.coding_vscode_assignment_batches ab
    left join public.coding_vscode_student_assignment_access pa
      on pa.student_id = auth.uid() and pa.assignment_id = ab.assignment_id and pa.batch_id = ab.batch_id
    where ab.assignment_id = p_assignment_id
      and ab.batch_id = p_batch_id
      and (ab.is_permanently_released = true or pa.id is not null)
  ) then raise exception 'This question is already permanently available to you'; end if;

  if exists (
    select 1 from public.coding_vscode_assignment_batches ab
    where ab.assignment_id = p_assignment_id
      and ab.batch_id = p_batch_id
      and ab.is_unlocked = true
      and ab.live_until is not null
      and ab.live_until > now()
  ) then raise exception 'Your live class is active. Join the live class instead'; end if;

  if not exists (
    select 1
    from public.batch_students bs
    join public.batches b on b.id = bs.batch_id
    join public.coding_vscode_assignment_batches ab on ab.batch_id = bs.batch_id
    where bs.student_id = auth.uid()
      and bs.status = 'active'
      and b.status = 'active'
      and bs.batch_id = p_batch_id
      and ab.assignment_id = p_assignment_id
  ) then raise exception 'This question is not part of your class history'; end if;

  insert into public.coding_vscode_access_requests (
    student_id, assignment_id, batch_id, status, reason, requested_at,
    decided_at, decided_by, access_until, updated_at
  ) values (
    auth.uid(), p_assignment_id, p_batch_id, 'pending', nullif(trim(coalesce(p_reason,'')),''), now(),
    null, null, null, now()
  )
  on conflict (student_id, assignment_id, batch_id)
  do update set
    status = 'pending',
    reason = excluded.reason,
    requested_at = now(),
    decided_at = null,
    decided_by = null,
    access_until = null,
    updated_at = now()
  returning id, status into v_id, v_status;

  return query select v_id, v_status;
end;
$$;


--

-- Name: requeue_notification_outbox(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.requeue_notification_outbox(p_id uuid DEFAULT NULL::uuid, p_reset_attempts boolean DEFAULT true) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_updated int;
begin
  if p_id is not null then
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where id = p_id
      and status in ('skipped', 'failed');
    get diagnostics v_updated = row_count;
  else
    update public.notification_outbox
    set status = 'queued',
        next_attempt_at = now(),
        attempts = case when p_reset_attempts then 0 else attempts end,
        last_error = null,
        updated_at = now()
    where status in ('skipped', 'failed')
      and (payload ->> 'simulated_failure_applied') is null;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;


--

-- Name: reset_ws_load_test(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.reset_ws_load_test(p_event_id text, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_deleted integer := 0;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  if p_event_id not like 'KT-LOADTEST-%' then raise exception 'Only KT-LOADTEST events can be reset by this function.'; end if;
  delete from public.ws_registrations where event_id = p_event_id;
  get diagnostics v_deleted = row_count;
  delete from public.ws_workshop_events where event_id = p_event_id;
  return jsonb_build_object('ok',true,'deletedRegistrations',v_deleted,'deletedEventId',p_event_id);
end;
$$;


--

-- Name: review_project_submission(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.review_project_submission(p_submission_id uuid, p_status text, p_score integer, p_feedback text DEFAULT NULL::text) RETURNS public.project_submissions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_submission public.project_submissions%rowtype;
  v_project public.projects%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('reviewed', 'approved', 'rejected') then
    raise exception 'Invalid review status';
  end if;

  select ps.* into v_submission
  from public.project_submissions ps
  where ps.id = p_submission_id;

  if not found then
    raise exception 'Submission not found';
  end if;

  if v_submission.status = 'draft' then
    raise exception 'Draft submissions cannot be reviewed';
  end if;

  select * into v_project from public.projects where id = v_submission.project_id;

  if not (
    public.is_admin()
    or v_project.created_by = v_user_id
    or (v_project.course_id is not null and public.faculty_can_access_course(v_project.course_id))
  ) then
    raise exception 'You cannot review this submission';
  end if;

  if p_score is null or p_score < 0 or p_score > v_project.max_marks then
    raise exception 'Score must be between 0 and %', v_project.max_marks;
  end if;

  perform set_config('app.project_submission_rpc', '1', true);

  update public.project_submissions set
    status = p_status,
    score = p_score,
    feedback = nullif(trim(coalesce(p_feedback, '')), ''),
    reviewed_by = v_user_id,
    reviewed_at = now(),
    updated_at = now()
  where id = p_submission_id
  returning * into v_submission;

  return v_submission;
end;
$$;


--

-- Name: revoke_lesson_release(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.revoke_lesson_release(p_student_id uuid, p_lesson_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson_id;

  if v_course_id is null then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.faculty_can_access_course(v_course_id)) then
    raise exception 'Not authorized to release lessons for this course.' using errcode = '42501';
  end if;

  delete from public.lesson_releases lr
  where lr.student_id = p_student_id and lr.lesson_id = p_lesson_id;
end;
$$;


--

-- Name: save_offline_exam_results(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.save_offline_exam_results(p_exam_id uuid, p_results jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_exam public.offline_exams%rowtype;
  v_item jsonb;
  v_student uuid;
  v_marks numeric(8,2);
  v_remarks text;
  v_count int := 0;
  v_idx int := 0;
  v_enrolled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_exam from public.offline_exams where id = p_exam_id for update;
  if not found then raise exception 'Exam not found'; end if;
  if not public.offline_exam_manageable(p_exam_id) then
    raise exception 'OFFLINE_EXAM_FORBIDDEN';
  end if;
  if v_exam.status in ('results_published','draft','cancelled') then
    raise exception 'Exam is not open for result entry';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'results must be an array';
  end if;

  -- Validate the whole batch first so a bad row never leaves partial state.
  for v_item in select * from jsonb_array_elements(p_results) loop
    v_idx := v_idx + 1;
    v_student := (v_item->>'student_id')::uuid;
    v_marks := (v_item->>'marks_obtained')::numeric(8,2);
    if v_student is null or not exists (select 1 from public.profiles where id = v_student) then
      raise exception 'Invalid student at index %', v_idx - 1;
    end if;
    if v_marks is null or v_marks < 0 or (v_exam.max_marks is not null and v_marks > v_exam.max_marks) then
      raise exception 'Invalid marks at index %', v_idx - 1;
    end if;
    if v_exam.course_id is not null then
      select exists (
        select 1 from public.course_enrollments ce
        where ce.student_id = v_student and ce.course_id = v_exam.course_id
          and ce.access_status = 'active'
      ) into v_enrolled;
      if not v_enrolled then
        raise exception 'Student at index % is not actively enrolled in this exam course', v_idx - 1;
      end if;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(p_results) loop
    v_student := (v_item->>'student_id')::uuid;
    v_marks := (v_item->>'marks_obtained')::numeric(8,2);
    v_remarks := nullif(v_item->>'remarks', '');
    insert into public.offline_exam_results (exam_id, student_id, marks_obtained, remarks, evaluated_by, evaluated_at)
    values (p_exam_id, v_student, v_marks, v_remarks, auth.uid(), now())
    on conflict (exam_id, student_id) do update
      set marks_obtained = excluded.marks_obtained,
          remarks = excluded.remarks,
          evaluated_by = excluded.evaluated_by,
          evaluated_at = excluded.evaluated_at;
    v_count := v_count + 1;
  end loop;

  if v_exam.status = 'scheduled' or v_exam.status = 'conducted' then
    update public.offline_exams set status = 'results_pending' where id = p_exam_id;
  end if;

  return jsonb_build_object('saved', v_count, 'exam_status', 'results_pending');
end;
$$;


--

-- Name: save_project_structure(uuid, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.save_project_structure(p_project_id uuid, p_milestones jsonb DEFAULT '[]'::jsonb, p_rubric jsonb DEFAULT '[]'::jsonb, p_starter_files jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  delete from public.project_milestones where project_id = p_project_id;
  delete from public.project_rubric_items where project_id = p_project_id;
  delete from public.project_starter_files where project_id = p_project_id;

  insert into public.project_milestones (project_id, title, description, max_marks, order_index)
  select
    p_project_id,
    item.value->>'title',
    nullif(item.value->>'description', ''),
    greatest(coalesce((item.value->>'max_marks')::integer, 0), 0),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb)) with ordinality as item(value, ordinality);

  insert into public.project_rubric_items (project_id, title, description, max_marks, order_index)
  select
    p_project_id,
    item.value->>'title',
    nullif(item.value->>'description', ''),
    greatest(coalesce((item.value->>'max_marks')::integer, 1), 1),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_rubric, '[]'::jsonb)) with ordinality as item(value, ordinality);

  insert into public.project_starter_files (project_id, file_path, content, language, order_index)
  select
    p_project_id,
    item.value->>'file_path',
    coalesce(item.value->>'content', ''),
    coalesce(nullif(item.value->>'language', ''), 'text'),
    item.ordinality - 1
  from jsonb_array_elements(coalesce(p_starter_files, '[]'::jsonb)) with ordinality as item(value, ordinality);
end;
$$;


--

-- Name: save_project_submission(uuid, text, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.save_project_submission(p_project_id uuid, p_github_url text DEFAULT NULL::text, p_live_url text DEFAULT NULL::text, p_external_url text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_submit boolean DEFAULT false) RETURNS public.project_submissions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects%rowtype;
  v_submission public.project_submissions%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select * into v_project
  from public.projects
  where id = p_project_id and is_published = true;
  if not found then raise exception 'Project is not available'; end if;

  if v_project.course_id is not null
     and not public.is_admin()
     and not exists (
       select 1 from public.course_enrollments ce
       where ce.course_id = v_project.course_id
         and ce.student_id = v_user_id
         and coalesce(ce.access_status, 'active') = 'active'
     )
  then
    raise exception 'You are not enrolled in this project course';
  end if;

  select * into v_submission
  from public.project_submissions
  where project_id = p_project_id and student_id = v_user_id;

  if found and v_submission.status = 'approved' then raise exception 'Approved submissions cannot be changed'; end if;
  if found and v_submission.status = 'submitted' then raise exception 'This project is awaiting faculty review'; end if;
  if length(coalesce(p_description, '')) > 10000 then raise exception 'Implementation notes cannot exceed 10000 characters'; end if;
  if length(coalesce(p_github_url, '')) > 2048
     or length(coalesce(p_live_url, '')) > 2048
     or length(coalesce(p_external_url, '')) > 2048
  then raise exception 'A submitted URL is too long'; end if;

  if nullif(trim(coalesce(p_github_url, '')), '') is not null
     and trim(p_github_url) !~* '^https://(www\.)?github\.com/'
  then raise exception 'Enter a valid GitHub repository URL'; end if;
  if nullif(trim(coalesce(p_live_url, '')), '') is not null
     and trim(p_live_url) !~* '^https?://'
  then raise exception 'Enter a valid live demo URL'; end if;
  if nullif(trim(coalesce(p_external_url, '')), '') is not null
     and trim(p_external_url) !~* '^https?://'
  then raise exception 'Enter a valid external project URL'; end if;

  if p_submit then
    if v_project.due_at is not null and now() > v_project.due_at and not v_project.allow_late_submissions
    then raise exception 'The project deadline has passed'; end if;
    if (v_project.repository_required or v_project.submission_mode in ('github', 'github_and_live'))
       and nullif(trim(coalesce(p_github_url, '')), '') is null
    then raise exception 'A GitHub repository URL is required'; end if;
    if (v_project.live_demo_required or v_project.submission_mode = 'github_and_live')
       and nullif(trim(coalesce(p_live_url, '')), '') is null
    then raise exception 'A live demo URL is required'; end if;
    if v_project.submission_mode = 'external_url'
       and nullif(trim(coalesce(p_external_url, '')), '') is null
    then raise exception 'An external project URL is required'; end if;
  end if;

  perform set_config('app.project_submission_rpc', '1', true);

  insert into public.project_submissions (
    project_id, student_id, github_url, live_url, external_url, description,
    status, submitted_at, feedback, score, reviewed_by, reviewed_at
  ) values (
    p_project_id, v_user_id,
    nullif(trim(coalesce(p_github_url, '')), ''),
    nullif(trim(coalesce(p_live_url, '')), ''),
    nullif(trim(coalesce(p_external_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    case when p_submit then 'submitted' else 'draft' end,
    case when p_submit then now() else null end,
    null, null, null, null
  )
  on conflict (project_id, student_id) do update set
    github_url = excluded.github_url,
    live_url = excluded.live_url,
    external_url = excluded.external_url,
    description = excluded.description,
    status = excluded.status,
    submitted_at = excluded.submitted_at,
    feedback = case when p_submit then null else public.project_submissions.feedback end,
    score = case when p_submit then null else public.project_submissions.score end,
    reviewed_by = case when p_submit then null else public.project_submissions.reviewed_by end,
    reviewed_at = case when p_submit then null else public.project_submissions.reviewed_at end,
    updated_at = now()
  returning * into v_submission;

  if p_submit and v_project.submission_mode = 'file_upload' and not exists (
    select 1 from public.project_submission_files f where f.submission_id = v_submission.id
  ) then
    raise exception 'Upload at least one project evidence file';
  end if;

  return v_submission;
end;
$$;


--

-- Name: set_coding_vscode_assignment_lock(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_coding_vscode_assignment_lock(p_assignment_id uuid, p_batch_id uuid, p_unlocked boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_kaveri_staff() then
    raise exception 'Teacher access required';
  end if;

  insert into public.coding_vscode_assignment_batches (
    assignment_id,
    batch_id,
    is_unlocked,
    unlocked_at,
    locked_at,
    updated_at,
    updated_by
  )
  values (
    p_assignment_id,
    p_batch_id,
    p_unlocked,
    case when p_unlocked then now() else null end,
    case when not p_unlocked then now() else null end,
    now(),
    auth.uid()
  )
  on conflict (assignment_id, batch_id)
  do update set
    is_unlocked = excluded.is_unlocked,
    unlocked_at = case
      when excluded.is_unlocked then now()
      else public.coding_vscode_assignment_batches.unlocked_at
    end,
    locked_at = case
      when not excluded.is_unlocked then now()
      else public.coding_vscode_assignment_batches.locked_at
    end,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;


--

-- Name: set_coding_vscode_assignment_target(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.set_coding_vscode_assignment_target(p_assignment_id uuid, p_batch_id uuid, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_kaveri_staff() then
    raise exception 'Teacher access required';
  end if;

  if p_enabled then
    insert into public.coding_vscode_assignment_batches (
      assignment_id,
      batch_id,
      is_unlocked,
      updated_at,
      updated_by
    )
    values (
      p_assignment_id,
      p_batch_id,
      false,
      now(),
      auth.uid()
    )
    on conflict (assignment_id, batch_id)
    do update set
      updated_at = now(),
      updated_by = auth.uid();
  else
    delete from public.coding_vscode_assignment_batches
    where assignment_id = p_assignment_id
      and batch_id = p_batch_id;
  end if;
end;
$$;


--

-- Name: start_coding_live_class(uuid, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.start_coding_live_class(p_batch_id uuid, p_assignment_ids uuid[], p_minutes integer DEFAULT 90) RETURNS TABLE(assignment_id uuid, batch_id uuid, live_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_until timestamptz;
  v_assignment uuid;
begin
  if not public.is_kaveri_staff() then raise exception 'Teacher access required'; end if;
  if coalesce(array_length(p_assignment_ids, 1), 0) = 0 then raise exception 'Select at least one question'; end if;
  if p_minutes < 5 or p_minutes > 480 then raise exception 'Live class duration must be between 5 and 480 minutes'; end if;
  if not exists (select 1 from public.batches b where b.id = p_batch_id and b.status = 'active') then
    raise exception 'Active batch not found';
  end if;

  v_until := now() + make_interval(mins => p_minutes);

  foreach v_assignment in array p_assignment_ids loop
    if not exists (
      select 1 from public.coding_vscode_assignments a
      where a.id = v_assignment and a.is_published = true and a.language = 'python'
    ) then raise exception 'Published Python question not found'; end if;

    insert into public.coding_vscode_assignment_batches (
      assignment_id, batch_id, is_unlocked, unlocked_at, locked_at, live_until,
      is_permanently_released, updated_at, updated_by
    ) values (
      v_assignment, p_batch_id, true, now(), null, v_until,
      false, now(), auth.uid()
    )
    on conflict on constraint coding_vscode_assignment_batches_assignment_id_batch_id_key
    do update set
      is_unlocked = true,
      unlocked_at = now(),
      locked_at = null,
      live_until = v_until,
      updated_at = now(),
      updated_by = auth.uid();
  end loop;

  return query
  select ab.assignment_id, ab.batch_id, ab.live_until
  from public.coding_vscode_assignment_batches ab
  where ab.batch_id = p_batch_id
    and ab.assignment_id = any(p_assignment_ids);
end;
$$;


--

-- Name: student_activity_unlocked(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.student_activity_unlocked(p_lesson_id uuid, p_activity_type text, p_activity_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_access text;
begin
  if v_uid is null then
    return false;
  end if;

  -- Course-level activity: not bound to a lesson, so enrollment/gates govern.
  if p_lesson_id is null then
    return true;
  end if;

  v_access := public.student_lesson_access(p_lesson_id);
  if v_access in ('available', 'completed') then
    return true;
  end if;

  -- Parent lesson is locked.  The ONLY exception is the circular gate: this
  -- exact activity is the required gate of the SAME parent lesson, so the
  -- student can satisfy it and unlock that lesson.  A future lesson in the
  -- course referencing the activity grants nothing.
  return exists (
    select 1
    from public.lessons l
    where l.id = p_lesson_id
      and l.requires_activity_type = p_activity_type
      and l.requires_activity_id = p_activity_id
  );
end;
$$;


--

-- Name: student_can_access_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.student_can_access_session(p_session_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT EXISTS (
  SELECT 1 FROM live_sessions ls
  JOIN course_enrollments ce ON ce.course_id = ls.course_id
  WHERE ls.id = p_session_id
  AND ce.student_id = auth.uid()
  AND (ce.access_status = 'active' OR ce.access_status IS NULL)
);
$$;


--

-- Name: student_lesson_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.student_lesson_access(p_lesson_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_unlock_rule text;
  v_req_type text;
  v_req_id uuid;
  v_prev_id uuid;
begin
  if v_uid is null then
    return 'locked';
  end if;

  select l.course_id, l.unlock_rule, l.requires_activity_type, l.requires_activity_id
    into v_course_id, v_unlock_rule, v_req_type, v_req_id
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = p_lesson_id and l.is_published and c.is_published;

  if v_course_id is null then
    return 'locked';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    return 'locked';
  end if;

  if exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = p_lesson_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'completed';
  end if;

  if exists (
    select 1 from public.lesson_releases lr
    where lr.lesson_id = p_lesson_id and lr.student_id = v_uid
  ) then
    return 'available';
  end if;

  -- open: published + active enrollment is enough (backward compatible)
  if v_unlock_rule = 'open' then
    return 'available';
  end if;

  if v_unlock_rule = 'gated'
     and (v_req_id is null or not public.activity_requirement_satisfied(v_req_type, v_req_id, v_uid)) then
    return 'locked';
  end if;

  -- sequential (or gated whose activity is satisfied): previous published lesson must be completed
  select prev.id into v_prev_id
  from (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) cur
  join (
    select l.id,
           row_number() over (order by c.order_index, l.order_index) as rn
    from public.lessons l
    join public.chapters c on c.id = l.chapter_id
    where l.course_id = v_course_id and l.is_published and c.is_published
  ) prev on prev.rn = cur.rn - 1
  where cur.id = p_lesson_id;

  if v_prev_id is not null and not exists (
    select 1 from public.lesson_progress lp
    where lp.lesson_id = v_prev_id and lp.student_id = v_uid and lp.completed
  ) then
    return 'locked';
  end if;

  return 'available';
end;
$$;


--

-- Name: submit_quiz_attempt(uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb, p_time_taken_seconds integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_lesson_id uuid;
  v_pass_pct integer;
  v_xp_reward integer;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_pct numeric := 0;
  v_attempt_id uuid;
  v_passed boolean;
  v_was_passed boolean;
  qr record;
  ans jsonb;
  v_selected jsonb;
  v_correct_ids jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'student' and p.is_active
  ) then
    raise exception 'Only an active student may submit a quiz.' using errcode = '42501';
  end if;

  select qz.course_id, qz.lesson_id, qz.pass_percentage, qz.xp_reward
    into v_course_id, v_lesson_id, v_pass_pct, v_xp_reward
  from public.quizzes qz
  where qz.id = p_quiz_id and qz.is_published;

  if v_course_id is null then
    raise exception 'Published quiz not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.course_enrollments ce
    where ce.course_id = v_course_id
      and ce.student_id = v_uid
      and ce.access_status = 'active'
  ) then
    raise exception 'An active enrollment in this course is required.' using errcode = '42501';
  end if;

  if not public.student_activity_unlocked(v_lesson_id, 'quiz', p_quiz_id) then
    raise exception 'This quiz unlocks with its lesson.' using errcode = '42501';
  end if;

  for qr in
    select qq.id, qq.question_type, qq.points, qq.correct_answer_text,
           coalesce((
             select jsonb_agg(
               jsonb_build_object('id', o.id, 'is_correct', o.is_correct)
               order by o.order_index
             )
             from public.quiz_options o
             where o.question_id = qq.id
           ), '[]'::jsonb) as options
    from public.quiz_questions qq
    where qq.quiz_id = p_quiz_id
    order by qq.order_index
  loop
    v_total := v_total + qr.points;
    ans := p_answers -> qr.id::text;

    if qr.question_type in ('fill_in_blank', 'code_output') then
      if lower(trim(coalesce(ans->>'text', ''))) = lower(trim(coalesce(qr.correct_answer_text, ''))) then
        v_earned := v_earned + qr.points;
      end if;
    elsif qr.question_type <> 'coding' then
      -- mcq / true_false / multiple_select: exact set match.
      -- Compare option-id strings on both sides: qr.options holds
      -- jsonb objects, so project elem->>'id' before ordering.
      select coalesce(jsonb_agg(elem->>'id' order by elem->>'id'), '[]'::jsonb)
        into v_correct_ids
      from jsonb_array_elements(qr.options) elem
      where (elem->>'is_correct')::boolean;

      select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
        into v_selected
      from jsonb_array_elements_text(coalesce(ans->'selected', '[]'::jsonb)) elem;

      if v_correct_ids = v_selected then
        v_earned := v_earned + qr.points;
      end if;
    end if;
    -- 'coding' questions are manually graded: no automatic points
  end loop;

  if v_total > 0 then
    v_pct := round((v_earned / v_total) * 100, 2);
  end if;
  v_passed := v_pct >= coalesce(v_pass_pct, 70);

  -- Award the advertised XP at most once per passed quiz (mirrors the
  -- trusted lesson-completion XP path). Serialize on student+quiz so
  -- parallel submits cannot double-grant.
  if v_passed and coalesce(v_xp_reward, 0) > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_quiz_id::text, 0));
  end if;

  select exists (
    select 1 from public.quiz_attempts qp
    where qp.quiz_id = p_quiz_id
      and qp.student_id = v_uid
      and qp.passed
  ) into v_was_passed;

  insert into public.quiz_attempts (
    quiz_id, student_id, score, max_score, passed,
    time_taken_seconds, completed_at
  )
  values (
    p_quiz_id, v_uid, v_pct, v_total::integer,
    v_passed,
    p_time_taken_seconds, now()
  )
  returning id into v_attempt_id;

  if v_passed and not v_was_passed and coalesce(v_xp_reward, 0) > 0 then
    insert into public.xp_transactions (student_id, amount, reason, reference_id, reference_type)
    select v_uid, qz2.xp_reward, 'Passed quiz: ' || qz2.title, qz2.id, 'quiz'
    from public.quizzes qz2
    where qz2.id = p_quiz_id;

    update public.profiles
    set xp_points = xp_points + coalesce(v_xp_reward, 0),
        level = floor(sqrt(greatest(xp_points + coalesce(v_xp_reward, 0), 0)::numeric / 100))::integer + 1,
        updated_at = now()
    where id = v_uid;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'score', v_pct,
    'max_score', v_total::integer,
    'passed', v_passed,
    'xp_reward', case when v_passed then coalesce(v_xp_reward, 0) else 0 end,
    'xp_awarded', case when v_passed and not v_was_passed then coalesce(v_xp_reward, 0) else 0 end
  );
end;
$$;


--

-- Name: upsert_ws_event(text, text, text, boolean, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.upsert_ws_event(p_event_id text, p_workshop_name text, p_workshop_date text, p_registrations_open boolean, p_max_seats integer, p_secret text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_event public.ws_workshop_events%rowtype;
begin
  if not public.ws_admin_ok(p_secret) then raise exception 'Unauthorized.'; end if;
  if length(trim(coalesce(p_event_id,''))) < 4 then raise exception 'Event ID is required.'; end if;

  insert into public.ws_workshop_events(event_id, workshop_name, workshop_date, registrations_open, max_seats)
  values(
    trim(p_event_id),
    trim(coalesce(p_workshop_name,'')),
    trim(coalesce(p_workshop_date,'')),
    coalesce(p_registrations_open,false),
    greatest(coalesce(p_max_seats,0),0)
  )
  on conflict (event_id) do update set
    workshop_name = excluded.workshop_name,
    workshop_date = excluded.workshop_date,
    registrations_open = excluded.registrations_open,
    max_seats = excluded.max_seats,
    updated_at = now()
  returning * into v_event;

  return jsonb_build_object(
    'ok',true,
    'eventId',v_event.event_id,
    'registeredCount',v_event.registered_count,
    'maxSeats',v_event.max_seats,
    'registrationsOpen',v_event.registrations_open
  );
end;
$$;


--

-- Name: ws_admin_ok(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.ws_admin_ok(p_secret text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select exists(
    select 1 from public.ws_private_settings
    where setting_key='admin_secret_sha256'
      and value_hash = encode(extensions.digest(convert_to(coalesce(p_secret,''),'UTF8'),'sha256'),'hex')
  );
$$;


--

-- 5. Constraints, indexes, policies, triggers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'achievements_pkey' AND conrelid = 'public.achievements'::regclass) THEN
  ALTER TABLE ONLY public.achievements ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_pkey' AND conrelid = 'public.activity_logs'::regclass) THEN
  ALTER TABLE ONLY public.activity_logs ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_requests_pkey' AND conrelid = 'public.enrollment_requests'::regclass) THEN
  ALTER TABLE ONLY public.enrollment_requests ADD CONSTRAINT enrollment_requests_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_compensation_history_pkey' AND conrelid = 'public.faculty_compensation_history'::regclass) THEN
  ALTER TABLE ONLY public.faculty_compensation_history ADD CONSTRAINT faculty_compensation_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_employment_employee_code_key' AND conrelid = 'public.faculty_employment'::regclass) THEN
  ALTER TABLE ONLY public.faculty_employment ADD CONSTRAINT faculty_employment_employee_code_key UNIQUE (employee_code);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_employment_faculty_id_key' AND conrelid = 'public.faculty_employment'::regclass) THEN
  ALTER TABLE ONLY public.faculty_employment ADD CONSTRAINT faculty_employment_faculty_id_key UNIQUE (faculty_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_employment_pkey' AND conrelid = 'public.faculty_employment'::regclass) THEN
  ALTER TABLE ONLY public.faculty_employment ADD CONSTRAINT faculty_employment_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_google_connections_faculty_id_key' AND conrelid = 'public.faculty_google_connections'::regclass) THEN
  ALTER TABLE ONLY public.faculty_google_connections ADD CONSTRAINT faculty_google_connections_faculty_id_key UNIQUE (faculty_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_performance_reviews_pkey' AND conrelid = 'public.faculty_performance_reviews'::regclass) THEN
  ALTER TABLE ONLY public.faculty_performance_reviews ADD CONSTRAINT faculty_performance_reviews_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hiring_companies_pkey' AND conrelid = 'public.hiring_companies'::regclass) THEN
  ALTER TABLE ONLY public.hiring_companies ADD CONSTRAINT hiring_companies_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_job_id_student_id_key' AND conrelid = 'public.job_applications'::regclass) THEN
  ALTER TABLE ONLY public.job_applications ADD CONSTRAINT job_applications_job_id_student_id_key UNIQUE (job_id, student_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_pkey' AND conrelid = 'public.job_applications'::regclass) THEN
  ALTER TABLE ONLY public.job_applications ADD CONSTRAINT job_applications_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_pkey' AND conrelid = 'public.job_postings'::regclass) THEN
  ALTER TABLE ONLY public.job_postings ADD CONSTRAINT job_postings_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kaveri_app_settings_pkey' AND conrelid = 'public.kaveri_app_settings'::regclass) THEN
  ALTER TABLE ONLY public.kaveri_app_settings ADD CONSTRAINT kaveri_app_settings_pkey PRIMARY KEY (key);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_bookmarks_pkey' AND conrelid = 'public.lesson_bookmarks'::regclass) THEN
  ALTER TABLE ONLY public.lesson_bookmarks ADD CONSTRAINT lesson_bookmarks_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_bookmarks_student_id_lesson_id_key' AND conrelid = 'public.lesson_bookmarks'::regclass) THEN
  ALTER TABLE ONLY public.lesson_bookmarks ADD CONSTRAINT lesson_bookmarks_student_id_lesson_id_key UNIQUE (student_id, lesson_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_notes_pkey' AND conrelid = 'public.lesson_notes'::regclass) THEN
  ALTER TABLE ONLY public.lesson_notes ADD CONSTRAINT lesson_notes_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_pkey' AND conrelid = 'public.notification_events'::regclass) THEN
  ALTER TABLE ONLY public.notification_events ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_pkey' AND conrelid = 'public.notification_outbox'::regclass) THEN
  ALTER TABLE ONLY public.notification_outbox ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_exam_id_student_id_key' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_exam_id_student_id_key UNIQUE (exam_id, student_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_pkey' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_students_exam_id_student_id_key' AND conrelid = 'public.offline_exam_students'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_students ADD CONSTRAINT offline_exam_students_exam_id_student_id_key UNIQUE (exam_id, student_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_students_pkey' AND conrelid = 'public.offline_exam_students'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_students ADD CONSTRAINT offline_exam_students_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exams_pkey' AND conrelid = 'public.offline_exams'::regclass) THEN
  ALTER TABLE ONLY public.offline_exams ADD CONSTRAINT offline_exams_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_settings_key_key' AND conrelid = 'public.platform_settings'::regclass) THEN
  ALTER TABLE ONLY public.platform_settings ADD CONSTRAINT platform_settings_key_key UNIQUE (key);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_settings_pkey' AND conrelid = 'public.platform_settings'::regclass) THEN
  ALTER TABLE ONLY public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qp_platform_sync_paper_id_action_key' AND conrelid = 'public.qp_platform_sync'::regclass) THEN
  ALTER TABLE ONLY public.qp_platform_sync ADD CONSTRAINT qp_platform_sync_paper_id_action_key UNIQUE (paper_id, action);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qp_platform_sync_pkey' AND conrelid = 'public.qp_platform_sync'::regclass) THEN
  ALTER TABLE ONLY public.qp_platform_sync ADD CONSTRAINT qp_platform_sync_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_answers_pkey' AND conrelid = 'public.quiz_answers'::regclass) THEN
  ALTER TABLE ONLY public.quiz_answers ADD CONSTRAINT quiz_answers_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_pkey' AND conrelid = 'public.quiz_attempts'::regclass) THEN
  ALTER TABLE ONLY public.quiz_attempts ADD CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_code_snippets_pkey' AND conrelid = 'public.saved_code_snippets'::regclass) THEN
  ALTER TABLE ONLY public.saved_code_snippets ADD CONSTRAINT saved_code_snippets_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_resources_pkey' AND conrelid = 'public.session_resources'::regclass) THEN
  ALTER TABLE ONLY public.session_resources ADD CONSTRAINT session_resources_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_support_records_pkey' AND conrelid = 'public.student_support_records'::regclass) THEN
  ALTER TABLE ONLY public.student_support_records ADD CONSTRAINT student_support_records_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_pkey' AND conrelid = 'public.user_achievements'::regclass) THEN
  ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_student_id_achievement_id_key' AND conrelid = 'public.user_achievements'::regclass) THEN
  ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_student_id_achievement_id_key UNIQUE (student_id, achievement_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_registrations_pkey' AND conrelid = 'public.workshop_registrations'::regclass) THEN
  ALTER TABLE ONLY public.workshop_registrations ADD CONSTRAINT workshop_registrations_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshops_pkey' AND conrelid = 'public.workshops'::regclass) THEN
  ALTER TABLE ONLY public.workshops ADD CONSTRAINT workshops_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='achievements' AND policyname='achievements_delete') THEN
  -- Name: achievements achievements_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY achievements_delete ON public.achievements FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='achievements' AND policyname='achievements_insert') THEN
  -- Name: achievements achievements_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY achievements_insert ON public.achievements FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='achievements' AND policyname='achievements_select') THEN
  -- Name: achievements achievements_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY achievements_select ON public.achievements FOR SELECT TO authenticated, anon USING (true);
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='achievements' AND policyname='achievements_update') THEN
  -- Name: achievements achievements_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY achievements_update ON public.achievements FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_user_id_fkey' AND conrelid = 'public.activity_logs'::regclass) THEN
  ALTER TABLE ONLY public.activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_activity_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs USING btree (created_at DESC);


--

-- Name: idx_activity_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs USING btree (user_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' AND policyname='activity_logs_delete') THEN
  -- Name: activity_logs activity_logs_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY activity_logs_delete ON public.activity_logs FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' AND policyname='activity_logs_insert') THEN
  -- Name: activity_logs activity_logs_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' AND policyname='activity_logs_select') THEN
  -- Name: activity_logs activity_logs_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY activity_logs_select ON public.activity_logs FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_logs' AND policyname='activity_logs_update') THEN
  -- Name: activity_logs activity_logs_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY activity_logs_update ON public.activity_logs FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
-- Name: idx_announcements_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_announcements_course ON public.announcements USING btree (course_id);


--

-- Name: idx_announcements_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_announcements_global ON public.announcements USING btree (is_global);


--

DROP TRIGGER IF EXISTS update_announcements_updated_at ON public.announcements;
-- Name: announcements update_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS assignment_question_submissions_updated_at ON public.assignment_question_submissions;
-- Name: assignment_question_submissions assignment_question_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assignment_question_submissions_updated_at BEFORE UPDATE ON public.assignment_question_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_questions' AND policyname='Faculty can manage questions for their assignments') THEN
  -- Name: assignment_questions Faculty can manage questions for their assignments; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY "Faculty can manage questions for their assignments" ON public.assignment_questions USING (((EXISTS ( SELECT 1
     FROM public.assignments
    WHERE ((assignments.id = assignment_questions.assignment_id) AND public.is_faculty_for_course(assignments.course_id)))) OR (( SELECT profiles.role
     FROM public.profiles
    WHERE (profiles.id = auth.uid())) = 'super_admin'::text)));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_questions' AND policyname='Students can read questions for enrolled assignments') THEN
  -- Name: assignment_questions Students can read questions for enrolled assignments; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY "Students can read questions for enrolled assignments" ON public.assignment_questions FOR SELECT USING ((EXISTS ( SELECT 1
     FROM public.assignments
    WHERE ((assignments.id = assignment_questions.assignment_id) AND public.is_student_enrolled(assignments.course_id) AND (assignments.is_published = true)))));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS assignment_questions_updated_at ON public.assignment_questions;
-- Name: assignment_questions assignment_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assignment_questions_updated_at BEFORE UPDATE ON public.assignment_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--

-- Name: idx_submissions_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions USING btree (assignment_id);


--

-- Name: idx_submissions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.assignment_submissions USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_submissions' AND policyname='submissions_delete') THEN
  -- Name: assignment_submissions submissions_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY submissions_delete ON public.assignment_submissions FOR DELETE TO authenticated USING (((student_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_submissions' AND policyname='submissions_insert') THEN
  -- Name: assignment_submissions submissions_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY submissions_insert ON public.assignment_submissions FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR ((student_id = auth.uid()) AND (EXISTS ( SELECT 1
     FROM (public.assignments a
       JOIN public.course_enrollments ce ON ((ce.course_id = a.course_id)))
    WHERE ((a.id = assignment_submissions.assignment_id) AND a.is_published AND (ce.student_id = auth.uid()) AND (ce.access_status = 'active'::text) AND public.student_activity_unlocked(a.lesson_id, 'assignment'::text, a.id)))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_submissions' AND policyname='submissions_select') THEN
  -- Name: assignment_submissions submissions_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY submissions_select ON public.assignment_submissions FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR public.is_admin() OR (EXISTS ( SELECT 1
     FROM (public.assignments a
       JOIN public.course_faculty cf ON ((cf.course_id = a.course_id)))
    WHERE ((a.id = assignment_submissions.assignment_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='assignment_submissions' AND policyname='submissions_update') THEN
  -- Name: assignment_submissions submissions_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY submissions_update ON public.assignment_submissions FOR UPDATE TO authenticated USING (((student_id = auth.uid()) OR public.is_admin() OR (EXISTS ( SELECT 1
     FROM (public.assignments a
       JOIN public.course_faculty cf ON ((cf.course_id = a.course_id)))
    WHERE ((a.id = assignment_submissions.assignment_id) AND (cf.faculty_id = auth.uid())))))) WITH CHECK (((student_id = auth.uid()) OR public.is_admin() OR (EXISTS ( SELECT 1
     FROM (public.assignments a
       JOIN public.course_faculty cf ON ((cf.course_id = a.course_id)))
    WHERE ((a.id = assignment_submissions.assignment_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS group_assignment_submission_notification_trigger ON public.assignment_submissions;
-- Name: assignment_submissions group_assignment_submission_notification_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER group_assignment_submission_notification_trigger AFTER INSERT OR UPDATE OF status ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION private.group_assignment_submission_notification();


--

DROP TRIGGER IF EXISTS update_submissions_updated_at ON public.assignment_submissions;
-- Name: assignment_submissions update_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: idx_assignment_test_cases_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_assignment_test_cases_assignment_id ON public.assignment_test_cases USING btree (assignment_id);


--

DROP TRIGGER IF EXISTS assignment_test_cases_updated_at ON public.assignment_test_cases;
-- Name: assignment_test_cases assignment_test_cases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assignment_test_cases_updated_at BEFORE UPDATE ON public.assignment_test_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_chapter_id_fkey' AND conrelid = 'public.assignments'::regclass) THEN
  ALTER TABLE ONLY public.assignments ADD CONSTRAINT assignments_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_assignments_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_assignments_course ON public.assignments USING btree (course_id);


--

DROP TRIGGER IF EXISTS sync_assignment_publication_trigger ON public.assignments;
-- Name: assignments sync_assignment_publication_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_assignment_publication_trigger BEFORE INSERT OR UPDATE OF status ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.sync_assignment_publication();


--

DROP TRIGGER IF EXISTS update_assignments_updated_at ON public.assignments;
-- Name: assignments update_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: idx_chapters_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_chapters_course ON public.chapters USING btree (course_id);


--

DROP TRIGGER IF EXISTS course_builder_chapters_updated_at ON public.chapters;
-- Name: chapters course_builder_chapters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER course_builder_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.course_builder_set_updated_at();


--

DROP TRIGGER IF EXISTS update_chapters_updated_at ON public.chapters;
-- Name: chapters update_chapters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS coding_question_attempts_set_updated_at ON public.coding_question_attempts;
-- Name: coding_question_attempts coding_question_attempts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coding_question_attempts_set_updated_at BEFORE UPDATE ON public.coding_question_attempts FOR EACH ROW EXECUTE FUNCTION public.kaveri_set_updated_at();


--

DROP TRIGGER IF EXISTS coding_question_test_cases_set_updated_at ON public.coding_question_test_cases;
-- Name: coding_question_test_cases coding_question_test_cases_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coding_question_test_cases_set_updated_at BEFORE UPDATE ON public.coding_question_test_cases FOR EACH ROW EXECUTE FUNCTION public.kaveri_set_updated_at();


--

DROP TRIGGER IF EXISTS coding_questions_set_updated_at ON public.coding_questions;
-- Name: coding_questions coding_questions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coding_questions_set_updated_at BEFORE UPDATE ON public.coding_questions FOR EACH ROW EXECUTE FUNCTION public.kaveri_set_updated_at();


--

DROP TRIGGER IF EXISTS coding_vscode_submissions_guard_trigger ON public.coding_vscode_submissions;
-- Name: coding_vscode_submissions coding_vscode_submissions_guard_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER coding_vscode_submissions_guard_trigger BEFORE INSERT OR UPDATE ON public.coding_vscode_submissions FOR EACH ROW EXECUTE FUNCTION public.coding_vscode_submissions_guard();


--

-- Name: idx_course_enrollments_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_course_enrollments_expiry ON public.course_enrollments USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--

-- Name: idx_enrollments_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.course_enrollments USING btree (course_id);


--

-- Name: idx_enrollments_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.course_enrollments USING btree (student_id);


--

DROP TRIGGER IF EXISTS seed_attendance_after_enrollment ON public.course_enrollments;
-- Name: course_enrollments seed_attendance_after_enrollment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_attendance_after_enrollment AFTER INSERT OR UPDATE OF course_id, student_id ON public.course_enrollments FOR EACH ROW EXECUTE FUNCTION public.seed_attendance_for_course_enrollment();


--

-- Name: idx_course_faculty_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_course_faculty_course ON public.course_faculty USING btree (course_id);


--

-- Name: idx_course_faculty_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_course_faculty_faculty ON public.course_faculty USING btree (faculty_id);


--

-- Name: idx_courses_difficulty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_courses_difficulty ON public.courses USING btree (difficulty);


--

-- Name: idx_courses_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_courses_published ON public.courses USING btree (is_published);


--

-- Name: idx_courses_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_courses_slug ON public.courses USING btree (slug);


--

DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
-- Name: courses update_courses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_requests_course_id_fkey' AND conrelid = 'public.enrollment_requests'::regclass) THEN
  ALTER TABLE ONLY public.enrollment_requests ADD CONSTRAINT enrollment_requests_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_requests_reviewed_by_fkey' AND conrelid = 'public.enrollment_requests'::regclass) THEN
  ALTER TABLE ONLY public.enrollment_requests ADD CONSTRAINT enrollment_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_requests_student_id_fkey' AND conrelid = 'public.enrollment_requests'::regclass) THEN
  ALTER TABLE ONLY public.enrollment_requests ADD CONSTRAINT enrollment_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: enrollment_requests_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS enrollment_requests_course_idx ON public.enrollment_requests USING btree (course_id);


--

-- Name: enrollment_requests_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS enrollment_requests_pending_unique ON public.enrollment_requests USING btree (student_id, course_id) WHERE (status = 'pending'::text);


--

-- Name: enrollment_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS enrollment_requests_status_idx ON public.enrollment_requests USING btree (status, requested_at DESC);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='enrollment_requests' AND policyname='enrollment_requests_delete_admin') THEN
  -- Name: enrollment_requests enrollment_requests_delete_admin; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY enrollment_requests_delete_admin ON public.enrollment_requests FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='enrollment_requests' AND policyname='enrollment_requests_insert_student') THEN
  -- Name: enrollment_requests enrollment_requests_insert_student; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY enrollment_requests_insert_student ON public.enrollment_requests FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (student_id = ( SELECT auth.uid() AS uid)) AND (( SELECT p.role
     FROM public.profiles p
    WHERE (p.id = ( SELECT auth.uid() AS uid))) = 'student'::text) AND (EXISTS ( SELECT 1
     FROM public.courses c
    WHERE ((c.id = enrollment_requests.course_id) AND (c.is_published = true) AND (c.enrollment_mode = 'approval_required'::text)))) AND (NOT (EXISTS ( SELECT 1
     FROM public.course_enrollments e
    WHERE ((e.student_id = enrollment_requests.student_id) AND (e.course_id = enrollment_requests.course_id) AND (e.access_status = 'active'::text)))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='enrollment_requests' AND policyname='enrollment_requests_select_own_or_admin') THEN
  -- Name: enrollment_requests enrollment_requests_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY enrollment_requests_select_own_or_admin ON public.enrollment_requests FOR SELECT TO authenticated USING (((student_id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='enrollment_requests' AND policyname='enrollment_requests_update_admin') THEN
  -- Name: enrollment_requests enrollment_requests_update_admin; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY enrollment_requests_update_admin ON public.enrollment_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS enrollment_request_created_notify_trigger ON public.enrollment_requests;
-- Name: enrollment_requests enrollment_request_created_notify_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enrollment_request_created_notify_trigger AFTER INSERT ON public.enrollment_requests FOR EACH ROW EXECUTE FUNCTION public.on_enrollment_request_created();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_compensation_history_created_by_fkey' AND conrelid = 'public.faculty_compensation_history'::regclass) THEN
  ALTER TABLE ONLY public.faculty_compensation_history ADD CONSTRAINT faculty_compensation_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_compensation_history_faculty_id_fkey' AND conrelid = 'public.faculty_compensation_history'::regclass) THEN
  ALTER TABLE ONLY public.faculty_compensation_history ADD CONSTRAINT faculty_compensation_history_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_faculty_comp_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_comp_date ON public.faculty_compensation_history USING btree (effective_date);


--

-- Name: idx_faculty_comp_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_comp_faculty ON public.faculty_compensation_history USING btree (faculty_id);


--

-- Name: idx_faculty_comp_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_comp_type ON public.faculty_compensation_history USING btree (change_type);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_compensation_history' AND policyname='faculty_compensation_delete') THEN
  -- Name: faculty_compensation_history faculty_compensation_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_compensation_delete ON public.faculty_compensation_history FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_compensation_history' AND policyname='faculty_compensation_insert') THEN
  -- Name: faculty_compensation_history faculty_compensation_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_compensation_insert ON public.faculty_compensation_history FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_compensation_history' AND policyname='faculty_compensation_select') THEN
  -- Name: faculty_compensation_history faculty_compensation_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_compensation_select ON public.faculty_compensation_history FOR SELECT TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_compensation_history' AND policyname='faculty_compensation_update') THEN
  -- Name: faculty_compensation_history faculty_compensation_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_compensation_update ON public.faculty_compensation_history FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_employment_faculty_id_fkey' AND conrelid = 'public.faculty_employment'::regclass) THEN
  ALTER TABLE ONLY public.faculty_employment ADD CONSTRAINT faculty_employment_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_employment_manager_id_fkey' AND conrelid = 'public.faculty_employment'::regclass) THEN
  ALTER TABLE ONLY public.faculty_employment ADD CONSTRAINT faculty_employment_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_faculty_employment_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_employment_faculty ON public.faculty_employment USING btree (faculty_id);


--

-- Name: idx_faculty_employment_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_employment_manager ON public.faculty_employment USING btree (manager_id);


--

-- Name: idx_faculty_employment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_faculty_employment_status ON public.faculty_employment USING btree (employment_status);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_employment' AND policyname='faculty_employment_delete') THEN
  -- Name: faculty_employment faculty_employment_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_employment_delete ON public.faculty_employment FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_employment' AND policyname='faculty_employment_insert') THEN
  -- Name: faculty_employment faculty_employment_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_employment_insert ON public.faculty_employment FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_employment' AND policyname='faculty_employment_select') THEN
  -- Name: faculty_employment faculty_employment_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_employment_select ON public.faculty_employment FOR SELECT TO authenticated USING (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_employment' AND policyname='faculty_employment_update') THEN
  -- Name: faculty_employment faculty_employment_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_employment_update ON public.faculty_employment FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_faculty_employment_updated_at ON public.faculty_employment;
-- Name: faculty_employment update_faculty_employment_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_faculty_employment_updated_at BEFORE UPDATE ON public.faculty_employment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_google_connections_faculty_id_fkey' AND conrelid = 'public.faculty_google_connections'::regclass) THEN
  ALTER TABLE ONLY public.faculty_google_connections ADD CONSTRAINT faculty_google_connections_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_google_connections' AND policyname='fgc_delete') THEN
  -- Name: faculty_google_connections fgc_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY fgc_delete ON public.faculty_google_connections FOR DELETE TO authenticated USING (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_google_connections' AND policyname='fgc_insert') THEN
  -- Name: faculty_google_connections fgc_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY fgc_insert ON public.faculty_google_connections FOR INSERT TO authenticated WITH CHECK (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_google_connections' AND policyname='fgc_select') THEN
  -- Name: faculty_google_connections fgc_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY fgc_select ON public.faculty_google_connections FOR SELECT TO authenticated USING (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_google_connections' AND policyname='fgc_update') THEN
  -- Name: faculty_google_connections fgc_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY fgc_update ON public.faculty_google_connections FOR UPDATE TO authenticated USING (((faculty_id = auth.uid()) OR public.is_admin())) WITH CHECK (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_performance_reviews_faculty_id_fkey' AND conrelid = 'public.faculty_performance_reviews'::regclass) THEN
  ALTER TABLE ONLY public.faculty_performance_reviews ADD CONSTRAINT faculty_performance_reviews_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faculty_performance_reviews_reviewer_id_fkey' AND conrelid = 'public.faculty_performance_reviews'::regclass) THEN
  ALTER TABLE ONLY public.faculty_performance_reviews ADD CONSTRAINT faculty_performance_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_performance_reviews_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_performance_reviews_faculty ON public.faculty_performance_reviews USING btree (faculty_id);


--

-- Name: idx_performance_reviews_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_performance_reviews_period ON public.faculty_performance_reviews USING btree (review_period);


--

-- Name: idx_performance_reviews_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer ON public.faculty_performance_reviews USING btree (reviewer_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_performance_reviews' AND policyname='performance_reviews_delete') THEN
  -- Name: faculty_performance_reviews performance_reviews_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY performance_reviews_delete ON public.faculty_performance_reviews FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_performance_reviews' AND policyname='performance_reviews_insert') THEN
  -- Name: faculty_performance_reviews performance_reviews_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY performance_reviews_insert ON public.faculty_performance_reviews FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_performance_reviews' AND policyname='performance_reviews_select') THEN
  -- Name: faculty_performance_reviews performance_reviews_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY performance_reviews_select ON public.faculty_performance_reviews FOR SELECT TO authenticated USING (((faculty_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='faculty_performance_reviews' AND policyname='performance_reviews_update') THEN
  -- Name: faculty_performance_reviews performance_reviews_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY performance_reviews_update ON public.faculty_performance_reviews FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_performance_reviews_updated_at ON public.faculty_performance_reviews;
-- Name: faculty_performance_reviews update_performance_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_performance_reviews_updated_at BEFORE UPDATE ON public.faculty_performance_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS audit_faculty_teaching_work_trigger ON public.faculty_teaching_work;
-- Name: faculty_teaching_work audit_faculty_teaching_work_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_faculty_teaching_work_trigger AFTER INSERT OR DELETE OR UPDATE ON public.faculty_teaching_work FOR EACH ROW EXECUTE FUNCTION public.audit_faculty_teaching_work();


--

DROP TRIGGER IF EXISTS validate_faculty_teaching_work_trigger ON public.faculty_teaching_work;
-- Name: faculty_teaching_work validate_faculty_teaching_work_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_faculty_teaching_work_trigger BEFORE INSERT OR UPDATE ON public.faculty_teaching_work FOR EACH ROW EXECUTE FUNCTION public.validate_faculty_teaching_work();


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hiring_companies' AND policyname='admin_all_hiring_companies') THEN
  -- Name: hiring_companies admin_all_hiring_companies; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY admin_all_hiring_companies ON public.hiring_companies TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hiring_companies' AND policyname='authenticated_read_hiring_companies') THEN
  -- Name: hiring_companies authenticated_read_hiring_companies; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY authenticated_read_hiring_companies ON public.hiring_companies FOR SELECT TO authenticated USING ((is_active = true));
  --
  END IF;
END $$;
-- Name: integration_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS integration_audit_log_created_idx ON public.integration_audit_log USING btree (created_at DESC);


--

-- Name: integration_audit_log_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS integration_audit_log_key_idx ON public.integration_audit_log USING btree (source, action, idempotency_key);


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_job_id_fkey' AND conrelid = 'public.job_applications'::regclass) THEN
  ALTER TABLE ONLY public.job_applications ADD CONSTRAINT job_applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_recommended_by_fkey' AND conrelid = 'public.job_applications'::regclass) THEN
  ALTER TABLE ONLY public.job_applications ADD CONSTRAINT job_applications_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_student_id_fkey' AND conrelid = 'public.job_applications'::regclass) THEN
  ALTER TABLE ONLY public.job_applications ADD CONSTRAINT job_applications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_job_applications_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications USING btree (job_id);


--

-- Name: idx_job_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_applications_status ON public.job_applications USING btree (status);


--

-- Name: idx_job_applications_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_applications_student ON public.job_applications USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='admin_all_job_applications') THEN
  -- Name: job_applications admin_all_job_applications; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY admin_all_job_applications ON public.job_applications TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='faculty_read_job_applications') THEN
  -- Name: job_applications faculty_read_job_applications; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_read_job_applications ON public.job_applications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='faculty_update_job_applications') THEN
  -- Name: job_applications faculty_update_job_applications; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_update_job_applications ON public.job_applications FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text))))) WITH CHECK ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='student_insert_application') THEN
  -- Name: job_applications student_insert_application; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY student_insert_application ON public.job_applications FOR INSERT TO authenticated WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='student_read_own_applications') THEN
  -- Name: job_applications student_read_own_applications; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY student_read_own_applications ON public.job_applications FOR SELECT TO authenticated USING ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_applications' AND policyname='student_update_own_application') THEN
  -- Name: job_applications student_update_own_application; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY student_update_own_application ON public.job_applications FOR UPDATE TO authenticated USING (((student_id = auth.uid()) AND (status = 'applied'::text))) WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_company_id_fkey' AND conrelid = 'public.job_postings'::regclass) THEN
  ALTER TABLE ONLY public.job_postings ADD CONSTRAINT job_postings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.hiring_companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_created_by_fkey' AND conrelid = 'public.job_postings'::regclass) THEN
  ALTER TABLE ONLY public.job_postings ADD CONSTRAINT job_postings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_job_postings_apply_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_postings_apply_by ON public.job_postings USING btree (apply_by);


--

-- Name: idx_job_postings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_postings_company ON public.job_postings USING btree (company_id);


--

-- Name: idx_job_postings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_job_postings_status ON public.job_postings USING btree (status);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_postings' AND policyname='admin_all_job_postings') THEN
  -- Name: job_postings admin_all_job_postings; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY admin_all_job_postings ON public.job_postings TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_postings' AND policyname='faculty_read_job_postings') THEN
  -- Name: job_postings faculty_read_job_postings; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_read_job_postings ON public.job_postings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text)))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_postings' AND policyname='student_read_open_jobs') THEN
  -- Name: job_postings student_read_open_jobs; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY student_read_open_jobs ON public.job_postings FOR SELECT TO authenticated USING (((status = 'open'::text) AND (EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'student'::text))))));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_bookmarks_lesson_id_fkey' AND conrelid = 'public.lesson_bookmarks'::regclass) THEN
  ALTER TABLE ONLY public.lesson_bookmarks ADD CONSTRAINT lesson_bookmarks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_bookmarks_student_id_fkey' AND conrelid = 'public.lesson_bookmarks'::regclass) THEN
  ALTER TABLE ONLY public.lesson_bookmarks ADD CONSTRAINT lesson_bookmarks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_lesson_bookmarks_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_bookmarks_student ON public.lesson_bookmarks USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_bookmarks' AND policyname='lesson_bookmarks_delete') THEN
  -- Name: lesson_bookmarks lesson_bookmarks_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_bookmarks_delete ON public.lesson_bookmarks FOR DELETE TO authenticated USING ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_bookmarks' AND policyname='lesson_bookmarks_insert') THEN
  -- Name: lesson_bookmarks lesson_bookmarks_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_bookmarks_insert ON public.lesson_bookmarks FOR INSERT TO authenticated WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_bookmarks' AND policyname='lesson_bookmarks_select') THEN
  -- Name: lesson_bookmarks lesson_bookmarks_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_bookmarks_select ON public.lesson_bookmarks FOR SELECT TO authenticated USING ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_file_uploads_uploaded_by_fkey' AND conrelid = 'public.lesson_file_uploads'::regclass) THEN
  ALTER TABLE ONLY public.lesson_file_uploads ADD CONSTRAINT lesson_file_uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_file_uploads' AND policyname='faculty_delete_lesson_files') THEN
  -- Name: lesson_file_uploads faculty_delete_lesson_files; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_delete_lesson_files ON public.lesson_file_uploads FOR DELETE TO authenticated USING ((uploaded_by = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_file_uploads' AND policyname='faculty_insert_lesson_files') THEN
  -- Name: lesson_file_uploads faculty_insert_lesson_files; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_insert_lesson_files ON public.lesson_file_uploads FOR INSERT TO authenticated WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
     FROM (public.lessons l
       JOIN public.course_faculty cf ON ((cf.course_id = l.course_id)))
    WHERE ((l.id = lesson_file_uploads.lesson_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_file_uploads' AND policyname='faculty_select_lesson_files') THEN
  -- Name: lesson_file_uploads faculty_select_lesson_files; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY faculty_select_lesson_files ON public.lesson_file_uploads FOR SELECT TO authenticated USING (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
     FROM (public.lessons l
       JOIN public.course_faculty cf ON ((cf.course_id = l.course_id)))
    WHERE ((l.id = lesson_file_uploads.lesson_id) AND (cf.faculty_id = auth.uid())))) OR (EXISTS ( SELECT 1
     FROM (public.lessons l
       JOIN public.course_enrollments ce ON ((ce.course_id = l.course_id)))
    WHERE ((l.id = lesson_file_uploads.lesson_id) AND (ce.student_id = auth.uid()) AND (ce.access_status = 'active'::text))))));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_notes_lesson_id_fkey' AND conrelid = 'public.lesson_notes'::regclass) THEN
  ALTER TABLE ONLY public.lesson_notes ADD CONSTRAINT lesson_notes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_notes_student_id_fkey' AND conrelid = 'public.lesson_notes'::regclass) THEN
  ALTER TABLE ONLY public.lesson_notes ADD CONSTRAINT lesson_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_lesson_notes_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_notes_student ON public.lesson_notes USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_notes' AND policyname='lesson_notes_delete') THEN
  -- Name: lesson_notes lesson_notes_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_notes_delete ON public.lesson_notes FOR DELETE TO authenticated USING ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_notes' AND policyname='lesson_notes_insert') THEN
  -- Name: lesson_notes lesson_notes_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_notes_insert ON public.lesson_notes FOR INSERT TO authenticated WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_notes' AND policyname='lesson_notes_select') THEN
  -- Name: lesson_notes lesson_notes_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_notes_select ON public.lesson_notes FOR SELECT TO authenticated USING ((student_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lesson_notes' AND policyname='lesson_notes_update') THEN
  -- Name: lesson_notes lesson_notes_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY lesson_notes_update ON public.lesson_notes FOR UPDATE TO authenticated USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_lesson_notes_updated_at ON public.lesson_notes;
-- Name: lesson_notes update_lesson_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lesson_notes_updated_at BEFORE UPDATE ON public.lesson_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: idx_lesson_practice_questions_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_practice_questions_lesson_id ON public.lesson_practice_questions USING btree (lesson_id);


--

DROP TRIGGER IF EXISTS update_lesson_progress_updated_at ON public.lesson_progress;
-- Name: lesson_progress update_lesson_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lesson_progress_updated_at BEFORE UPDATE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: idx_lesson_resources_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson ON public.lesson_resources USING btree (lesson_id);


--

-- Name: idx_lesson_subtopics_topic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_subtopics_topic_id ON public.lesson_subtopics USING btree (topic_id);


--

-- Name: idx_lesson_topics_lesson_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lesson_topics_lesson_id ON public.lesson_topics USING btree (lesson_id);


--

-- Name: idx_lessons_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON public.lessons USING btree (chapter_id);


--

DROP TRIGGER IF EXISTS course_builder_lessons_updated_at ON public.lessons;
-- Name: lessons course_builder_lessons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER course_builder_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.course_builder_set_updated_at();


--

DROP TRIGGER IF EXISTS update_lessons_updated_at ON public.lessons;
-- Name: lessons update_lessons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_created_by_fkey' AND conrelid = 'public.live_sessions'::regclass) THEN
  ALTER TABLE ONLY public.live_sessions ADD CONSTRAINT live_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_live_sessions_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_sessions_chapter ON public.live_sessions USING btree (chapter_id);


--

-- Name: idx_live_sessions_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_sessions_course ON public.live_sessions USING btree (course_id);


--

-- Name: idx_live_sessions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_sessions_date ON public.live_sessions USING btree (session_date);


--

-- Name: idx_live_sessions_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_sessions_lesson ON public.live_sessions USING btree (lesson_id);


--

-- Name: idx_live_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON public.live_sessions USING btree (status);


--

DROP TRIGGER IF EXISTS seed_attendance_after_live_session ON public.live_sessions;
-- Name: live_sessions seed_attendance_after_live_session; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_attendance_after_live_session AFTER INSERT ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.seed_attendance_for_live_session();


--

DROP TRIGGER IF EXISTS update_live_sessions_updated_at ON public.live_sessions;
-- Name: live_sessions update_live_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_live_sessions_updated_at BEFORE UPDATE ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_actor_user_id_fkey' AND conrelid = 'public.notification_events'::regclass) THEN
  ALTER TABLE ONLY public.notification_events ADD CONSTRAINT notification_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_subject_user_id_fkey' AND conrelid = 'public.notification_events'::regclass) THEN
  ALTER TABLE ONLY public.notification_events ADD CONSTRAINT notification_events_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: notification_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_events_created_idx ON public.notification_events USING btree (created_at DESC);


--

-- Name: notification_events_dedupe_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS notification_events_dedupe_key_idx ON public.notification_events USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--

-- Name: notification_events_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_events_entity_idx ON public.notification_events USING btree (entity_type, entity_id);


--

-- Name: notification_events_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_events_subject_idx ON public.notification_events USING btree (subject_user_id, created_at DESC);


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_event_id_fkey' AND conrelid = 'public.notification_outbox'::regclass) THEN
  ALTER TABLE ONLY public.notification_outbox ADD CONSTRAINT notification_outbox_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.notification_events(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_recipient_user_id_fkey' AND conrelid = 'public.notification_outbox'::regclass) THEN
  ALTER TABLE ONLY public.notification_outbox ADD CONSTRAINT notification_outbox_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: notification_outbox_dedupe_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_key_idx ON public.notification_outbox USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--

-- Name: notification_outbox_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON public.notification_outbox USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text]));


--

-- Name: notification_outbox_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_outbox_recipient_idx ON public.notification_outbox USING btree (recipient_user_id, created_at DESC);


--

-- Name: notification_outbox_stale_delivering_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS notification_outbox_stale_delivering_idx ON public.notification_outbox USING btree (delivery_claimed_at) WHERE (status = 'delivering'::text);


--

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at_trigger ON public.notification_preferences;
-- Name: notification_preferences set_notification_preferences_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_notification_preferences_updated_at_trigger BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_notification_preferences_updated_at();


--

-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications USING btree (is_read);


--

-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id);


--

DROP TRIGGER IF EXISTS set_notification_read_at_trigger ON public.notifications;
-- Name: notifications set_notification_read_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_notification_read_at_trigger BEFORE UPDATE OF is_read ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_notification_read_at();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_evaluated_by_fkey' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_evaluated_by_fkey FOREIGN KEY (evaluated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_exam_id_fkey' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.offline_exams(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_published_by_fkey' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_results_student_id_fkey' AND conrelid = 'public.offline_exam_results'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_results ADD CONSTRAINT offline_exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_offline_exam_results_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exam_results_exam ON public.offline_exam_results USING btree (exam_id);


--

-- Name: idx_offline_exam_results_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exam_results_student ON public.offline_exam_results USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_results' AND policyname='offline_results_staff_insert') THEN
  -- Name: offline_exam_results offline_results_staff_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_results_staff_insert ON public.offline_exam_results FOR INSERT TO authenticated WITH CHECK (public.offline_exam_manageable(exam_id));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_results' AND policyname='offline_results_staff_read') THEN
  -- Name: offline_exam_results offline_results_staff_read; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_results_staff_read ON public.offline_exam_results FOR SELECT TO authenticated USING ((public.is_admin() OR public.offline_exam_manageable(exam_id)));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_results' AND policyname='offline_results_staff_update') THEN
  -- Name: offline_exam_results offline_results_staff_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_results_staff_update ON public.offline_exam_results FOR UPDATE TO authenticated USING (public.is_kaveri_staff()) WITH CHECK (public.offline_exam_manageable(exam_id));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_results' AND policyname='offline_results_student_read_published') THEN
  -- Name: offline_exam_results offline_results_student_read_published; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_results_student_read_published ON public.offline_exam_results FOR SELECT TO authenticated USING (((student_id = auth.uid()) AND (status = 'published'::text) AND (EXISTS ( SELECT 1
     FROM public.offline_exams e
    WHERE ((e.id = offline_exam_results.exam_id) AND (e.status = 'results_published'::text))))));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_offline_exam_results_audit ON public.offline_exam_results;
-- Name: offline_exam_results trg_offline_exam_results_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_exam_results_audit AFTER INSERT OR UPDATE ON public.offline_exam_results FOR EACH ROW EXECUTE FUNCTION public.offline_exam_results_audit();


--

DROP TRIGGER IF EXISTS trg_offline_exam_results_guard ON public.offline_exam_results;
-- Name: offline_exam_results trg_offline_exam_results_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_exam_results_guard BEFORE INSERT OR UPDATE ON public.offline_exam_results FOR EACH ROW EXECUTE FUNCTION public.offline_exam_results_guard();


--

DROP TRIGGER IF EXISTS trg_offline_results_updated_at ON public.offline_exam_results;
-- Name: offline_exam_results trg_offline_results_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_results_updated_at BEFORE UPDATE ON public.offline_exam_results FOR EACH ROW EXECUTE FUNCTION public.offline_exam_set_updated_at();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_students_exam_id_fkey' AND conrelid = 'public.offline_exam_students'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_students ADD CONSTRAINT offline_exam_students_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.offline_exams(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_students_graded_by_fkey' AND conrelid = 'public.offline_exam_students'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_students ADD CONSTRAINT offline_exam_students_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exam_students_student_id_fkey' AND conrelid = 'public.offline_exam_students'::regclass) THEN
  ALTER TABLE ONLY public.offline_exam_students ADD CONSTRAINT offline_exam_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_offline_exam_students_exam_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exam_students_exam_id ON public.offline_exam_students USING btree (exam_id);


--

-- Name: idx_offline_exam_students_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exam_students_student_id ON public.offline_exam_students USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_students' AND policyname='delete_offline_exam_students') THEN
  -- Name: offline_exam_students delete_offline_exam_students; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY delete_offline_exam_students ON public.offline_exam_students FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
     FROM (public.offline_exams oe
       JOIN public.course_faculty cf ON ((cf.course_id = oe.course_id)))
    WHERE ((oe.id = offline_exam_students.exam_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_students' AND policyname='insert_offline_exam_students') THEN
  -- Name: offline_exam_students insert_offline_exam_students; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY insert_offline_exam_students ON public.offline_exam_students FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
     FROM (public.offline_exams oe
       JOIN public.course_faculty cf ON ((cf.course_id = oe.course_id)))
    WHERE ((oe.id = offline_exam_students.exam_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_students' AND policyname='select_offline_exam_students') THEN
  -- Name: offline_exam_students select_offline_exam_students; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY select_offline_exam_students ON public.offline_exam_students FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))) OR (student_id = auth.uid()) OR (EXISTS ( SELECT 1
     FROM (public.offline_exams oe
       JOIN public.course_faculty cf ON ((cf.course_id = oe.course_id)))
    WHERE ((oe.id = offline_exam_students.exam_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exam_students' AND policyname='update_offline_exam_students') THEN
  -- Name: offline_exam_students update_offline_exam_students; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY update_offline_exam_students ON public.offline_exam_students FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
     FROM (public.offline_exams oe
       JOIN public.course_faculty cf ON ((cf.course_id = oe.course_id)))
    WHERE ((oe.id = offline_exam_students.exam_id) AND (cf.faculty_id = auth.uid())))))) WITH CHECK (((EXISTS ( SELECT 1
     FROM public.profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
     FROM (public.offline_exams oe
       JOIN public.course_faculty cf ON ((cf.course_id = oe.course_id)))
    WHERE ((oe.id = offline_exam_students.exam_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exams_course_id_fkey' AND conrelid = 'public.offline_exams'::regclass) THEN
  ALTER TABLE ONLY public.offline_exams ADD CONSTRAINT offline_exams_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'offline_exams_created_by_fkey' AND conrelid = 'public.offline_exams'::regclass) THEN
  ALTER TABLE ONLY public.offline_exams ADD CONSTRAINT offline_exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_offline_exams_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exams_course ON public.offline_exams USING btree (course_id);


--

-- Name: idx_offline_exams_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exams_course_id ON public.offline_exams USING btree (course_id);


--

-- Name: idx_offline_exams_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exams_date ON public.offline_exams USING btree (exam_date);


--

-- Name: idx_offline_exams_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_offline_exams_status ON public.offline_exams USING btree (status);


--

-- Name: uq_offline_exams_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS uq_offline_exams_external ON public.offline_exams USING btree (external_source, external_paper_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exams' AND policyname='offline_exams_admin_delete') THEN
  -- Name: offline_exams offline_exams_admin_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_exams_admin_delete ON public.offline_exams FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exams' AND policyname='offline_exams_faculty_insert') THEN
  -- Name: offline_exams offline_exams_faculty_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_exams_faculty_insert ON public.offline_exams FOR INSERT TO authenticated WITH CHECK (public.offline_exam_course_writable(course_id));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exams' AND policyname='offline_exams_staff_read') THEN
  -- Name: offline_exams offline_exams_staff_read; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_exams_staff_read ON public.offline_exams FOR SELECT TO authenticated USING ((public.is_admin() OR ((course_id IS NOT NULL) AND public.is_faculty_for_course(course_id))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exams' AND policyname='offline_exams_staff_update') THEN
  -- Name: offline_exams offline_exams_staff_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_exams_staff_update ON public.offline_exams FOR UPDATE TO authenticated USING (public.is_kaveri_staff()) WITH CHECK ((public.is_admin() OR public.offline_exam_manageable(id)));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='offline_exams' AND policyname='offline_exams_student_read') THEN
  -- Name: offline_exams offline_exams_student_read; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY offline_exams_student_read ON public.offline_exams FOR SELECT TO authenticated USING (((status <> ALL (ARRAY['draft'::text, 'cancelled'::text])) AND ((course_id IS NULL) OR (EXISTS ( SELECT 1
     FROM public.course_enrollments ce
    WHERE ((ce.course_id = offline_exams.course_id) AND (ce.student_id = auth.uid()) AND (ce.access_status = 'active'::text)))))));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_offline_exams_status_audit ON public.offline_exams;
-- Name: offline_exams trg_offline_exams_status_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_exams_status_audit AFTER UPDATE ON public.offline_exams FOR EACH ROW EXECUTE FUNCTION public.offline_exams_status_audit();


--

DROP TRIGGER IF EXISTS trg_offline_exams_updated_at ON public.offline_exams;
-- Name: offline_exams trg_offline_exams_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_offline_exams_updated_at BEFORE UPDATE ON public.offline_exams FOR EACH ROW EXECUTE FUNCTION public.offline_exam_set_updated_at();


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_settings' AND policyname='platform_settings_delete') THEN
  -- Name: platform_settings platform_settings_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY platform_settings_delete ON public.platform_settings FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_settings' AND policyname='platform_settings_insert') THEN
  -- Name: platform_settings platform_settings_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY platform_settings_insert ON public.platform_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_settings' AND policyname='platform_settings_select') THEN
  -- Name: platform_settings platform_settings_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY platform_settings_select ON public.platform_settings FOR SELECT TO authenticated, anon USING (true);
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_settings' AND policyname='platform_settings_update') THEN
  -- Name: platform_settings platform_settings_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY platform_settings_update ON public.platform_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles USING btree (email);


--

-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles USING btree (role);


--

DROP TRIGGER IF EXISTS trg_protect_profile_authorization_fields ON public.profiles;
-- Name: profiles trg_protect_profile_authorization_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_profile_authorization_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();


--

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS update_project_milestones_updated_at ON public.project_milestones;
-- Name: project_milestones update_project_milestones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_milestones_updated_at BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS update_project_rubric_items_updated_at ON public.project_rubric_items;
-- Name: project_rubric_items update_project_rubric_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_rubric_items_updated_at BEFORE UPDATE ON public.project_rubric_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS update_project_starter_files_updated_at ON public.project_starter_files;
-- Name: project_starter_files update_project_starter_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_starter_files_updated_at BEFORE UPDATE ON public.project_starter_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS capture_project_submission_review_history ON public.project_submissions;
-- Name: project_submissions capture_project_submission_review_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER capture_project_submission_review_history AFTER UPDATE ON public.project_submissions FOR EACH ROW EXECUTE FUNCTION public.capture_project_submission_review_history();


--

DROP TRIGGER IF EXISTS protect_project_submission_review_fields ON public.project_submissions;
-- Name: project_submissions protect_project_submission_review_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_project_submission_review_fields BEFORE UPDATE ON public.project_submissions FOR EACH ROW EXECUTE FUNCTION public.protect_project_submission_review_fields();


--

DROP TRIGGER IF EXISTS update_project_submissions_updated_at ON public.project_submissions;
-- Name: project_submissions update_project_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_submissions_updated_at BEFORE UPDATE ON public.project_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS update_project_workspace_files_updated_at ON public.project_workspace_files;
-- Name: project_workspace_files update_project_workspace_files_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_project_workspace_files_updated_at BEFORE UPDATE ON public.project_workspace_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DROP TRIGGER IF EXISTS trg_qp_ai_generations_updated_at ON public.qp_ai_generations;
-- Name: qp_ai_generations trg_qp_ai_generations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_ai_generations_updated_at BEFORE UPDATE ON public.qp_ai_generations FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_ai_settings_updated_at ON public.qp_ai_settings;
-- Name: qp_ai_settings trg_qp_ai_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_ai_settings_updated_at BEFORE UPDATE ON public.qp_ai_settings FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_paper_questions_immutability ON public.qp_paper_questions;
-- Name: qp_paper_questions trg_qp_paper_questions_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_paper_questions_immutability BEFORE INSERT OR DELETE OR UPDATE ON public.qp_paper_questions FOR EACH ROW EXECUTE FUNCTION public.qp_paper_questions_enforce_immutability();


--

DROP TRIGGER IF EXISTS trg_qp_paper_questions_updated_at ON public.qp_paper_questions;
-- Name: qp_paper_questions trg_qp_paper_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_paper_questions_updated_at BEFORE UPDATE ON public.qp_paper_questions FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_papers_immutability ON public.qp_papers;
-- Name: qp_papers trg_qp_papers_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_papers_immutability BEFORE UPDATE ON public.qp_papers FOR EACH ROW EXECUTE FUNCTION public.qp_papers_enforce_immutability();


--

DROP TRIGGER IF EXISTS trg_qp_papers_prevent_finalized_delete ON public.qp_papers;
-- Name: qp_papers trg_qp_papers_prevent_finalized_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_papers_prevent_finalized_delete BEFORE DELETE ON public.qp_papers FOR EACH ROW EXECUTE FUNCTION public.qp_papers_prevent_finalized_delete();


--

DROP TRIGGER IF EXISTS trg_qp_papers_updated_at ON public.qp_papers;
-- Name: qp_papers trg_qp_papers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_papers_updated_at BEFORE UPDATE ON public.qp_papers FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qp_platform_sync_paper_id_fkey' AND conrelid = 'public.qp_platform_sync'::regclass) THEN
  ALTER TABLE ONLY public.qp_platform_sync ADD CONSTRAINT qp_platform_sync_paper_id_fkey FOREIGN KEY (paper_id) REFERENCES public.qp_papers(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_qp_platform_sync_paper; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_qp_platform_sync_paper ON public.qp_platform_sync USING btree (paper_id);


--

-- Name: idx_qp_platform_sync_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_qp_platform_sync_status ON public.qp_platform_sync USING btree (status);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qp_platform_sync' AND policyname='qp_platform_sync_insert') THEN
  -- Name: qp_platform_sync qp_platform_sync_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY qp_platform_sync_insert ON public.qp_platform_sync FOR INSERT TO authenticated WITH CHECK (public.qp_is_active_faculty_or_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qp_platform_sync' AND policyname='qp_platform_sync_select') THEN
  -- Name: qp_platform_sync qp_platform_sync_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY qp_platform_sync_select ON public.qp_platform_sync FOR SELECT TO authenticated USING (public.qp_is_active_faculty_or_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qp_platform_sync' AND policyname='qp_platform_sync_update') THEN
  -- Name: qp_platform_sync qp_platform_sync_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY qp_platform_sync_update ON public.qp_platform_sync FOR UPDATE TO authenticated USING (public.qp_is_active_faculty_or_admin()) WITH CHECK (public.qp_is_active_faculty_or_admin());
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_qp_question_assets_immutability ON public.qp_question_assets;
-- Name: qp_question_assets trg_qp_question_assets_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_question_assets_immutability BEFORE INSERT OR DELETE OR UPDATE ON public.qp_question_assets FOR EACH ROW EXECUTE FUNCTION public.qp_question_assets_enforce_immutability();


--

DROP TRIGGER IF EXISTS trg_qp_question_bank_guard_approval ON public.qp_question_bank;
-- Name: qp_question_bank trg_qp_question_bank_guard_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_question_bank_guard_approval BEFORE INSERT OR UPDATE ON public.qp_question_bank FOR EACH ROW EXECUTE FUNCTION public.qp_question_bank_guard_approval();


--

DROP TRIGGER IF EXISTS trg_qp_question_bank_search_vector ON public.qp_question_bank;
-- Name: qp_question_bank trg_qp_question_bank_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_question_bank_search_vector BEFORE INSERT OR UPDATE ON public.qp_question_bank FOR EACH ROW EXECUTE FUNCTION public.qp_question_bank_update_search_vector();


--

DROP TRIGGER IF EXISTS trg_qp_question_bank_updated_at ON public.qp_question_bank;
-- Name: qp_question_bank trg_qp_question_bank_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_question_bank_updated_at BEFORE UPDATE ON public.qp_question_bank FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_sets_immutability ON public.qp_sets;
-- Name: qp_sets trg_qp_sets_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_sets_immutability BEFORE INSERT OR DELETE OR UPDATE ON public.qp_sets FOR EACH ROW EXECUTE FUNCTION public.qp_sets_enforce_immutability();


--

DROP TRIGGER IF EXISTS trg_qp_sets_updated_at ON public.qp_sets;
-- Name: qp_sets trg_qp_sets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_sets_updated_at BEFORE UPDATE ON public.qp_sets FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_settings_updated_at ON public.qp_settings;
-- Name: qp_settings trg_qp_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_settings_updated_at BEFORE UPDATE ON public.qp_settings FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DROP TRIGGER IF EXISTS trg_qp_templates_updated_at ON public.qp_templates;
-- Name: qp_templates trg_qp_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_qp_templates_updated_at BEFORE UPDATE ON public.qp_templates FOR EACH ROW EXECUTE FUNCTION public.qp_set_updated_at();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_answers_attempt_id_fkey' AND conrelid = 'public.quiz_answers'::regclass) THEN
  ALTER TABLE ONLY public.quiz_answers ADD CONSTRAINT quiz_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.quiz_attempts(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_answers_question_id_fkey' AND conrelid = 'public.quiz_answers'::regclass) THEN
  ALTER TABLE ONLY public.quiz_answers ADD CONSTRAINT quiz_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_quiz_answers_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt ON public.quiz_answers USING btree (attempt_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_answers' AND policyname='quiz_answers_delete') THEN
  -- Name: quiz_answers quiz_answers_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_answers_delete ON public.quiz_answers FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_answers' AND policyname='quiz_answers_insert') THEN
  -- Name: quiz_answers quiz_answers_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_answers_insert ON public.quiz_answers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
     FROM public.quiz_attempts
    WHERE ((quiz_attempts.id = quiz_answers.attempt_id) AND (quiz_attempts.student_id = auth.uid())))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_answers' AND policyname='quiz_answers_select') THEN
  -- Name: quiz_answers quiz_answers_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_answers_select ON public.quiz_answers FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
     FROM public.quiz_attempts
    WHERE ((quiz_attempts.id = quiz_answers.attempt_id) AND (quiz_attempts.student_id = auth.uid())))) OR public.is_faculty()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_answers' AND policyname='quiz_answers_update') THEN
  -- Name: quiz_answers quiz_answers_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_answers_update ON public.quiz_answers FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_quiz_id_fkey' AND conrelid = 'public.quiz_attempts'::regclass) THEN
  ALTER TABLE ONLY public.quiz_attempts ADD CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_student_id_fkey' AND conrelid = 'public.quiz_attempts'::regclass) THEN
  ALTER TABLE ONLY public.quiz_attempts ADD CONSTRAINT quiz_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_quiz_attempts_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON public.quiz_attempts USING btree (quiz_id);


--

-- Name: idx_quiz_attempts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON public.quiz_attempts USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_attempts' AND policyname='quiz_attempts_delete') THEN
  -- Name: quiz_attempts quiz_attempts_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_attempts_delete ON public.quiz_attempts FOR DELETE TO authenticated USING (((student_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_attempts' AND policyname='quiz_attempts_insert') THEN
  -- Name: quiz_attempts quiz_attempts_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_attempts_insert ON public.quiz_attempts FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR ((student_id = auth.uid()) AND (score IS NULL) AND (passed IS NULL) AND (completed_at IS NULL) AND (EXISTS ( SELECT 1
     FROM (public.quizzes q
       JOIN public.course_enrollments ce ON ((ce.course_id = q.course_id)))
    WHERE ((q.id = quiz_attempts.quiz_id) AND q.is_published AND (ce.student_id = auth.uid()) AND (ce.access_status = 'active'::text) AND public.student_activity_unlocked(q.lesson_id, 'quiz'::text, q.id)))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_attempts' AND policyname='quiz_attempts_select') THEN
  -- Name: quiz_attempts quiz_attempts_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_attempts_select ON public.quiz_attempts FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR public.is_admin() OR (EXISTS ( SELECT 1
     FROM (public.quizzes q
       JOIN public.course_faculty cf ON ((cf.course_id = q.course_id)))
    WHERE ((q.id = quiz_attempts.quiz_id) AND (cf.faculty_id = auth.uid()))))));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quiz_attempts' AND policyname='quiz_attempts_update') THEN
  -- Name: quiz_attempts quiz_attempts_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY quiz_attempts_update ON public.quiz_attempts FOR UPDATE TO authenticated USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));
  --
  END IF;
END $$;
-- Name: idx_quiz_options_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON public.quiz_options USING btree (question_id);


--

-- Name: idx_quiz_questions_quiz; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions USING btree (quiz_id);


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_created_by_fkey' AND conrelid = 'public.quizzes'::regclass) THEN
  ALTER TABLE ONLY public.quizzes ADD CONSTRAINT quizzes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: idx_quizzes_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_quizzes_course ON public.quizzes USING btree (course_id);


--

DROP TRIGGER IF EXISTS update_quizzes_updated_at ON public.quizzes;
-- Name: quizzes update_quizzes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_code_snippets_user_id_fkey' AND conrelid = 'public.saved_code_snippets'::regclass) THEN
  ALTER TABLE ONLY public.saved_code_snippets ADD CONSTRAINT saved_code_snippets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_code_snippets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_code_snippets_user ON public.saved_code_snippets USING btree (user_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_code_snippets' AND policyname='snippets_delete') THEN
  -- Name: saved_code_snippets snippets_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY snippets_delete ON public.saved_code_snippets FOR DELETE TO authenticated USING ((user_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_code_snippets' AND policyname='snippets_insert') THEN
  -- Name: saved_code_snippets snippets_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY snippets_insert ON public.saved_code_snippets FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_code_snippets' AND policyname='snippets_select') THEN
  -- Name: saved_code_snippets snippets_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY snippets_select ON public.saved_code_snippets FOR SELECT TO authenticated USING ((user_id = auth.uid()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='saved_code_snippets' AND policyname='snippets_update') THEN
  -- Name: saved_code_snippets snippets_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY snippets_update ON public.saved_code_snippets FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_snippets_updated_at ON public.saved_code_snippets;
-- Name: saved_code_snippets update_snippets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_snippets_updated_at BEFORE UPDATE ON public.saved_code_snippets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'secure_grading_runs_coding_vscode_submission_id_fkey' AND conrelid = 'public.secure_grading_runs'::regclass) THEN
  ALTER TABLE ONLY public.secure_grading_runs ADD CONSTRAINT secure_grading_runs_coding_vscode_submission_id_fkey FOREIGN KEY (coding_vscode_submission_id) REFERENCES public.coding_vscode_submissions(id) ON DELETE SET NULL;
  END IF;
END $$;
-- Name: secure_grading_runs_vscode_submission_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS secure_grading_runs_vscode_submission_idx ON public.secure_grading_runs USING btree (coding_vscode_submission_id) WHERE (coding_vscode_submission_id IS NOT NULL);


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_marked_by_fkey' AND conrelid = 'public.session_attendance'::regclass) THEN
  ALTER TABLE ONLY public.session_attendance ADD CONSTRAINT session_attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_attendance_student_id_fkey' AND conrelid = 'public.session_attendance'::regclass) THEN
  ALTER TABLE ONLY public.session_attendance ADD CONSTRAINT session_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_session_attendance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_session_attendance_status ON public.session_attendance USING btree (attendance_status);


--

DROP TRIGGER IF EXISTS update_session_attendance_updated_at ON public.session_attendance;
-- Name: session_attendance update_session_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_session_attendance_updated_at BEFORE UPDATE ON public.session_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_resources_session_id_fkey' AND conrelid = 'public.session_resources'::regclass) THEN
  ALTER TABLE ONLY public.session_resources ADD CONSTRAINT session_resources_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.live_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_session_resources_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_session_resources_session ON public.session_resources USING btree (session_id);


--

-- Name: idx_session_resources_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_session_resources_type ON public.session_resources USING btree (resource_type);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_resources' AND policyname='session_resources_delete') THEN
  -- Name: session_resources session_resources_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY session_resources_delete ON public.session_resources FOR DELETE TO authenticated USING (public.faculty_can_manage_session(session_id));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_resources' AND policyname='session_resources_insert') THEN
  -- Name: session_resources session_resources_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY session_resources_insert ON public.session_resources FOR INSERT TO authenticated WITH CHECK (public.faculty_can_manage_session(session_id));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_resources' AND policyname='session_resources_select') THEN
  -- Name: session_resources session_resources_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY session_resources_select ON public.session_resources FOR SELECT TO authenticated USING ((((is_locked = false) AND public.student_can_access_session(session_id)) OR public.faculty_can_manage_session(session_id) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_resources' AND policyname='session_resources_update') THEN
  -- Name: session_resources session_resources_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY session_resources_update ON public.session_resources FOR UPDATE TO authenticated USING (public.faculty_can_manage_session(session_id)) WITH CHECK (public.faculty_can_manage_session(session_id));
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_support_records_faculty_id_fkey' AND conrelid = 'public.student_support_records'::regclass) THEN
  ALTER TABLE ONLY public.student_support_records ADD CONSTRAINT student_support_records_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_support_records_student_id_fkey' AND conrelid = 'public.student_support_records'::regclass) THEN
  ALTER TABLE ONLY public.student_support_records ADD CONSTRAINT student_support_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_support_records_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_records_category ON public.student_support_records USING btree (category);


--

-- Name: idx_support_records_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_records_faculty ON public.student_support_records USING btree (faculty_id);


--

-- Name: idx_support_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_records_status ON public.student_support_records USING btree (status);


--

-- Name: idx_support_records_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_support_records_student ON public.student_support_records USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='student_support_records' AND policyname='support_records_delete') THEN
  -- Name: student_support_records support_records_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY support_records_delete ON public.student_support_records FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='student_support_records' AND policyname='support_records_insert') THEN
  -- Name: student_support_records support_records_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY support_records_insert ON public.student_support_records FOR INSERT TO authenticated WITH CHECK ((public.faculty_can_access_student(student_id) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='student_support_records' AND policyname='support_records_select') THEN
  -- Name: student_support_records support_records_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY support_records_select ON public.student_support_records FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR public.faculty_can_access_student(student_id) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='student_support_records' AND policyname='support_records_update') THEN
  -- Name: student_support_records support_records_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY support_records_update ON public.student_support_records FOR UPDATE TO authenticated USING ((public.faculty_can_access_student(student_id) OR public.is_admin())) WITH CHECK ((public.faculty_can_access_student(student_id) OR public.is_admin()));
  --
  END IF;
END $$;
DROP TRIGGER IF EXISTS update_support_records_updated_at ON public.student_support_records;
-- Name: student_support_records update_support_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_support_records_updated_at BEFORE UPDATE ON public.student_support_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_achievement_id_fkey' AND conrelid = 'public.user_achievements'::regclass) THEN
  ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_achievements_student_id_fkey' AND conrelid = 'public.user_achievements'::regclass) THEN
  ALTER TABLE ONLY public.user_achievements ADD CONSTRAINT user_achievements_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: idx_user_achievements_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_user_achievements_student ON public.user_achievements USING btree (student_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_achievements' AND policyname='user_achievements_delete') THEN
  -- Name: user_achievements user_achievements_delete; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY user_achievements_delete ON public.user_achievements FOR DELETE TO authenticated USING (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_achievements' AND policyname='user_achievements_insert') THEN
  -- Name: user_achievements user_achievements_insert; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY user_achievements_insert ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_achievements' AND policyname='user_achievements_select') THEN
  -- Name: user_achievements user_achievements_select; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY user_achievements_select ON public.user_achievements FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR public.is_admin()));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_achievements' AND policyname='user_achievements_update') THEN
  -- Name: user_achievements user_achievements_update; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY user_achievements_update ON public.user_achievements FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  --
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_registrations_user_id_fkey' AND conrelid = 'public.workshop_registrations'::regclass) THEN
  ALTER TABLE ONLY public.workshop_registrations ADD CONSTRAINT workshop_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshop_registrations_workshop_id_fkey' AND conrelid = 'public.workshop_registrations'::regclass) THEN
  ALTER TABLE ONLY public.workshop_registrations ADD CONSTRAINT workshop_registrations_workshop_id_fkey FOREIGN KEY (workshop_id) REFERENCES public.workshops(id) ON DELETE CASCADE;
  END IF;
END $$;
-- Name: workshop_registrations_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS workshop_registrations_email_idx ON public.workshop_registrations USING btree (email);


--

-- Name: workshop_registrations_source_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS workshop_registrations_source_external_uidx ON public.workshop_registrations USING btree (source, external_registration_id);


--

-- Name: workshop_registrations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS workshop_registrations_user_idx ON public.workshop_registrations USING btree (user_id);


--

-- Name: workshop_registrations_workshop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS workshop_registrations_workshop_idx ON public.workshop_registrations USING btree (workshop_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workshop_registrations' AND policyname='workshop_registrations_select_own_or_admin') THEN
  -- Name: workshop_registrations workshop_registrations_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY workshop_registrations_select_own_or_admin ON public.workshop_registrations FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));
  --
  END IF;
END $$;
-- Name: workshops_source_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS workshops_source_external_uidx ON public.workshops USING btree (source, external_workshop_id);


--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workshops' AND policyname='workshops_select_anon_published') THEN
  -- Name: workshops workshops_select_anon_published; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY workshops_select_anon_published ON public.workshops FOR SELECT TO anon USING ((status = 'published'::text));
  --
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workshops' AND policyname='workshops_select_authenticated') THEN
  -- Name: workshops workshops_select_authenticated; Type: POLICY; Schema: public; Owner: -
  --
  CREATE POLICY workshops_select_authenticated ON public.workshops FOR SELECT TO authenticated USING (((status <> 'draft'::text) OR public.is_admin()));
  --
  END IF;
END $$;
-- 6. Grants (replayed from original migrations)
-- from 20260710080058_15_fix_course_creation_and_deletion_rls.sql
REVOKE EXECUTE ON FUNCTION public.create_faculty_course(jsonb) FROM PUBLIC;
-- from 20260710080058_15_fix_course_creation_and_deletion_rls.sql
GRANT EXECUTE ON FUNCTION public.create_faculty_course(jsonb) TO authenticated;
-- from 20260710080058_15_fix_course_creation_and_deletion_rls.sql
REVOKE EXECUTE ON FUNCTION public.delete_course_with_content(uuid) FROM PUBLIC;
-- from 20260710080058_15_fix_course_creation_and_deletion_rls.sql
GRANT EXECUTE ON FUNCTION public.delete_course_with_content(uuid) TO authenticated;
-- from 20260808103503_live_session_attendance_google_foundation.sql
REVOKE ALL ON public.faculty_google_connections FROM anon, authenticated;
-- from 20260808103503_live_session_attendance_google_foundation.sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_attendance TO anon, authenticated;
-- from 20260809090000_faculty_project_builder.sql
revoke all on function public.faculty_can_access_course(uuid) from public, anon;
-- from 20260809090000_faculty_project_builder.sql
grant execute on function public.faculty_can_access_course(uuid) to authenticated;
-- from 20260809090000_faculty_project_builder.sql
revoke all on function public.save_project_structure(uuid, jsonb, jsonb, jsonb) from public, anon;
-- from 20260809090000_faculty_project_builder.sql
grant execute on function public.save_project_structure(uuid, jsonb, jsonb, jsonb) to authenticated;
-- from 20260809113000_restore_create_faculty_course.sql
revoke execute on function public.create_faculty_course(jsonb) from public;
-- from 20260809113000_restore_create_faculty_course.sql
revoke execute on function public.create_faculty_course(jsonb) from anon;
-- from 20260809113000_restore_create_faculty_course.sql
grant execute on function public.create_faculty_course(jsonb) to authenticated;
-- from 20260811090000_student_project_submission_workflow.sql
revoke all on function public.save_project_submission(uuid, text, text, text, text, boolean) from public, anon;
-- from 20260811090000_student_project_submission_workflow.sql
revoke all on function public.review_project_submission(uuid, text, integer, text) from public, anon;
-- from 20260811090000_student_project_submission_workflow.sql
grant execute on function public.save_project_submission(uuid, text, text, text, text, boolean) to authenticated;
-- from 20260811090000_student_project_submission_workflow.sql
grant execute on function public.review_project_submission(uuid, text, integer, text) to authenticated;
-- from 20260813080625_faculty_announcements_communication.sql
revoke all on function public.can_manage_announcement_target(text, uuid, uuid) from public, anon;
-- from 20260813080625_faculty_announcements_communication.sql
revoke all on function public.can_view_announcement(uuid, text, uuid, uuid, text, timestamptz, timestamptz) from public, anon;
-- from 20260813080625_faculty_announcements_communication.sql
grant execute on function public.can_manage_announcement_target(text, uuid, uuid) to authenticated;
-- from 20260813080625_faculty_announcements_communication.sql
grant execute on function public.can_view_announcement(uuid, text, uuid, uuid, text, timestamptz, timestamptz) to authenticated;
-- from 20260813080625_faculty_announcements_communication.sql
grant select, insert, update, delete on public.announcements to authenticated;
-- from 20260813131229_faculty_notifications_center.sql
grant select, insert, update, delete on public.notifications to authenticated;
-- from 20260821161456_restore_delete_course_with_content.sql
revoke all on function public.delete_course_with_content(uuid) from public;
-- from 20260821161456_restore_delete_course_with_content.sql
revoke all on function public.delete_course_with_content(uuid) from anon;
-- from 20260821161456_restore_delete_course_with_content.sql
grant execute on function public.delete_course_with_content(uuid) to authenticated;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
revoke all on table public.profiles from anon;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
grant select, update on table public.profiles to authenticated;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
revoke insert, update, delete, truncate on table public.courses from anon;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
grant select on table public.courses to anon;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
grant select, insert, update, delete on table public.courses to authenticated;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
revoke all on table public.course_faculty from anon;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
grant select, insert, update, delete on table public.course_faculty to authenticated;
-- from 20260823154916_harden_shared_auth_and_course_policies.sql
revoke all on function public.faculty_can_access_course(uuid) from public;
-- from 20260823160038_qp_0008_snapshot_reproducibility.sql
revoke all on function public.qp_finalize_paper(uuid) from public;
-- from 20260823160038_qp_0008_snapshot_reproducibility.sql
grant execute on function public.qp_finalize_paper(uuid) to authenticated;
-- from 20260823160053_qp_0009_storage_reference_guard.sql
revoke all on function public.qp_storage_path_is_unreferenced(text) from public;
-- from 20260823160053_qp_0009_storage_reference_guard.sql
grant execute on function public.qp_storage_path_is_unreferenced(text) to authenticated;
-- from 20260824090815_secure_vscode_coding_submissions.sql
revoke all on table public.coding_vscode_submissions from anon;
-- from 20260824090815_secure_vscode_coding_submissions.sql
revoke all on table public.coding_vscode_submissions from authenticated;
-- from 20260824090815_secure_vscode_coding_submissions.sql
grant select, insert, update, delete on table public.coding_vscode_submissions to authenticated;
-- from 20260824121740_coding_batch_join_codes.sql
grant execute on function public.join_batch_by_code(text) to authenticated;
-- from 20260824130120_staff_assignment_target_write_rpc.sql
revoke all on function public.set_coding_vscode_assignment_target(uuid, uuid, boolean) from public;
-- from 20260824130120_staff_assignment_target_write_rpc.sql
grant execute on function public.set_coding_vscode_assignment_target(uuid, uuid, boolean) to authenticated;
-- from 20260825142119_workshop_high_volume_registration.sql
revoke all on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) from public;
-- from 20260825142119_workshop_high_volume_registration.sql
grant execute on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) to anon, authenticated;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.configure_ws_admin_secret(text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
grant execute on function public.configure_ws_admin_secret(text) to anon, authenticated;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.ws_admin_ok(text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.get_ws_registration_snapshot(text,text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
grant execute on function public.get_ws_registration_snapshot(text,text) to anon, authenticated;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.check_in_ws_registration(text,text,text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
grant execute on function public.check_in_ws_registration(text,text,text) to anon, authenticated;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.get_ws_pending_sync_batch(integer,text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
grant execute on function public.get_ws_pending_sync_batch(integer,text) to anon, authenticated;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
revoke all on function public.mark_ws_sync_results(jsonb,text) from public;
-- from 20260825142453_workshop_admin_sync_api_v2.sql
grant execute on function public.mark_ws_sync_results(jsonb,text) to anon, authenticated;
-- from 20260825142952_workshop_event_sync_api.sql
revoke all on function public.upsert_ws_event(text,text,text,boolean,integer,text) from public;
-- from 20260825142952_workshop_event_sync_api.sql
grant execute on function public.upsert_ws_event(text,text,text,boolean,integer,text) to anon, authenticated;
-- from 20260825143120_workshop_load_test_cleanup.sql
revoke all on function public.reset_ws_load_test(text,text) from public;
-- from 20260825143120_workshop_load_test_cleanup.sql
grant execute on function public.reset_ws_load_test(text,text) to anon, authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.ws_admin_ok(text) from anon, authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.register_workshop_participant(text,text,text,text,text,text,text,text,text,text[],text,text,boolean) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.configure_ws_admin_secret(text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.get_ws_registration_snapshot(text,text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.check_in_ws_registration(text,text,text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.get_ws_pending_sync_batch(integer,text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.mark_ws_sync_results(jsonb,text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.upsert_ws_event(text,text,text,boolean,integer,text) from authenticated;
-- from 20260825143323_workshop_rpc_privilege_tightening.sql
revoke execute on function public.reset_ws_load_test(text,text) from authenticated;
-- from 20260825144002_lock_ws_admin_secret_setup.sql
revoke execute on function public.configure_ws_admin_secret(text) from public, anon, authenticated;
-- from 20260826131708_coding_live_class_lock_unlock.sql
revoke all on function public.set_coding_vscode_assignment_lock(uuid, uuid, boolean) from public;
-- from 20260826131708_coding_live_class_lock_unlock.sql
grant execute on function public.set_coding_vscode_assignment_lock(uuid, uuid, boolean) to authenticated;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
revoke all on function public.start_coding_live_class(uuid, uuid[], integer) from public;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
revoke all on function public.end_coding_live_class(uuid) from public;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
revoke all on function public.request_coding_assignment_access(uuid, uuid, text) from public;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
revoke all on function public.decide_coding_access_request(uuid, boolean, integer) from public;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
grant execute on function public.start_coding_live_class(uuid, uuid[], integer) to authenticated;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
grant execute on function public.end_coding_live_class(uuid) to authenticated;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
grant execute on function public.request_coding_assignment_access(uuid, uuid, text) to authenticated;
-- from 20260826133946_live_class_windows_and_makeup_access.sql
grant execute on function public.decide_coding_access_request(uuid, boolean, integer) to authenticated;
-- from 20260826135353_permanent_attendance_and_recorded_release_v2.sql
revoke all on function public.join_coding_live_class(uuid) from public;
-- from 20260826135353_permanent_attendance_and_recorded_release_v2.sql
revoke all on function public.release_coding_assignments_permanently(uuid, uuid[]) from public;
-- from 20260826135353_permanent_attendance_and_recorded_release_v2.sql
grant execute on function public.join_coding_live_class(uuid) to authenticated;
-- from 20260826135353_permanent_attendance_and_recorded_release_v2.sql
grant execute on function public.release_coding_assignments_permanently(uuid, uuid[]) to authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignments from anon;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_questions from anon;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_test_cases from anon;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_submissions from anon;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignments from authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_questions from authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_test_cases from authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on table public.assignment_submissions from authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
grant select, insert, update, delete on table public.assignments to authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
grant select, insert, update, delete on table public.assignment_questions to authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
grant select, insert, update, delete on table public.assignment_test_cases to authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
grant select, insert, update, delete on table public.assignment_submissions to authenticated;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on function public.get_student_coding_questions(uuid) from public;
-- from 20260829132923_coding_security_containment_v1.sql
revoke all on function public.get_student_coding_questions(uuid) from anon;
-- from 20260829132923_coding_security_containment_v1.sql
grant execute on function public.get_student_coding_questions(uuid) to authenticated;
-- from 20260829141907_isolated_coding_grader_v1.sql
revoke all on table public.secure_grading_runs from public;
-- from 20260829141907_isolated_coding_grader_v1.sql
revoke all on table public.secure_grading_runs from anon;
-- from 20260829141907_isolated_coding_grader_v1.sql
revoke all on table public.secure_grading_runs from authenticated;
-- from 20260829141907_isolated_coding_grader_v1.sql
grant select on table public.secure_grading_runs to authenticated;
-- from 20260901102000_google_auth_role_enforcement.sql
revoke insert, delete, truncate, references, trigger on table public.profiles from authenticated;
-- from 20260901102000_google_auth_role_enforcement.sql
revoke all on function public.admin_set_user_role(uuid, text) from public;
-- from 20260901102000_google_auth_role_enforcement.sql
revoke all on function public.admin_set_user_active(uuid, boolean) from public;
-- from 20260901102000_google_auth_role_enforcement.sql
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
-- from 20260901102000_google_auth_role_enforcement.sql
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
revoke all on table public.course_enrollments from anon;
-- from 20260902120000_lesson_completion_integrity.sql
revoke update on table public.course_enrollments from authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
grant select, insert, delete on table public.course_enrollments to authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
revoke update on table public.profiles from authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
grant update (full_name, avatar_url, phone, bio) on table public.profiles to authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
revoke all on function public.admin_set_enrollment_access(uuid, text, text) from public;
-- from 20260902120000_lesson_completion_integrity.sql
revoke all on function public.complete_lesson(uuid) from public;
-- from 20260902120000_lesson_completion_integrity.sql
grant execute on function public.admin_set_enrollment_access(uuid, text, text) to authenticated;
-- from 20260902120000_lesson_completion_integrity.sql
grant execute on function public.complete_lesson(uuid) to authenticated;
-- from 20260903134500_fix_student_visible_coding_test_rls.sql
revoke all on function public.is_published_coding_question(uuid) from public;
-- from 20260903134500_fix_student_visible_coding_test_rls.sql
revoke all on function public.is_published_coding_question(uuid) from anon;
-- from 20260903134500_fix_student_visible_coding_test_rls.sql
grant execute on function public.is_published_coding_question(uuid) to authenticated;
-- from 20260903143000_harden_anon_function_execute.sql
revoke all on function public.admin_set_user_role(uuid, text) from anon;
-- from 20260903143000_harden_anon_function_execute.sql
revoke all on function public.admin_set_user_active(uuid, boolean) from anon;
-- from 20260903143000_harden_anon_function_execute.sql
revoke all on function public.admin_set_enrollment_access(uuid, text, text) from anon;
-- from 20260903143000_harden_anon_function_execute.sql
revoke all on function public.complete_lesson(uuid) from anon;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.activity_requirement_satisfied(text, uuid, uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.activity_requirement_satisfied(text, uuid, uuid) to authenticated;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.student_lesson_access(uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.student_lesson_access(uuid) to authenticated;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.get_student_course_plan(uuid, uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.get_student_course_plan(uuid, uuid) to authenticated;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.get_student_lesson_access(uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.get_student_lesson_access(uuid) to authenticated;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.release_lesson_for_student(uuid, uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.release_lesson_for_student(uuid, uuid) to authenticated;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
revoke all on function public.revoke_lesson_release(uuid, uuid) from public;
-- from 20260904093000_lesson_progression_and_resource_lock_enforcement.sql
grant execute on function public.revoke_lesson_release(uuid, uuid) to authenticated;
-- from 20260904110000_live_session_recording_and_mvp_policy_cleanup.sql
revoke all on function public.get_session_recording_status(uuid) from public;
-- from 20260904110000_live_session_recording_and_mvp_policy_cleanup.sql
grant execute on function public.get_session_recording_status(uuid) to authenticated;
-- from 20260904150000_verification_hardening.sql
revoke execute on function public.activity_requirement_satisfied(text, uuid, uuid) from authenticated;
-- from 20260904150000_verification_hardening.sql
revoke select on public.quiz_options from authenticated;
-- from 20260904150000_verification_hardening.sql
grant select (id, question_id, option_text, order_index) on public.quiz_options to authenticated;
-- from 20260904150000_verification_hardening.sql
revoke select on public.quiz_questions from authenticated;
-- from 20260904150000_verification_hardening.sql
grant select ( id, quiz_id, question_text, question_type, order_index, points, created_at, difficulty, code_snippet, image_url, enable_playground, time_limit_seconds ) on public.quiz_questions to authenticated;
-- from 20260904150000_verification_hardening.sql
revoke all on function public.get_quiz_questions_staff(uuid) from public;
-- from 20260904150000_verification_hardening.sql
grant execute on function public.get_quiz_questions_staff(uuid) to authenticated;
-- from 20260904150000_verification_hardening.sql
revoke all on function public.get_quiz_questions_for_student(uuid) from public;
-- from 20260904150000_verification_hardening.sql
grant execute on function public.get_quiz_questions_for_student(uuid) to authenticated;
-- from 20260904150000_verification_hardening.sql
revoke all on function public.submit_quiz_attempt(uuid, jsonb, integer) from public;
-- from 20260904150000_verification_hardening.sql
grant execute on function public.submit_quiz_attempt(uuid, jsonb, integer) to authenticated;
-- from 20260904160000_final_signoff_activity_lock_and_gate_contract.sql
revoke execute on function public.student_activity_unlocked(uuid, text, uuid) from public, anon;
-- from 20260904160000_final_signoff_activity_lock_and_gate_contract.sql
grant execute on function public.student_activity_unlocked(uuid, text, uuid) to authenticated;
-- from 20260905150000_enrollment_mode_and_requests.sql
revoke execute on function public.approve_enrollment_request(uuid) from public, anon;
-- from 20260905150000_enrollment_mode_and_requests.sql
revoke execute on function public.reject_enrollment_request(uuid, text) from public, anon;
-- from 20260905150000_enrollment_mode_and_requests.sql
revoke execute on function public.cancel_enrollment_request(uuid) from public, anon;
-- from 20260905150000_enrollment_mode_and_requests.sql
grant execute on function public.approve_enrollment_request(uuid) to authenticated;
-- from 20260905150000_enrollment_mode_and_requests.sql
grant execute on function public.reject_enrollment_request(uuid, text) to authenticated;
-- from 20260905150000_enrollment_mode_and_requests.sql
grant execute on function public.cancel_enrollment_request(uuid) to authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.kaveri_notify(uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.record_notification_event(text, uuid, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.kaveri_queue_email(uuid, text, jsonb, text, uuid) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.process_enrollment_event(text, uuid) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.on_enrollment_request_created() from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.process_notification_outbox(int) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
revoke all on function public.requeue_notification_outbox(uuid, boolean) from public, anon, authenticated;
-- from 20260905180000_central_notifications_outbox.sql
grant execute on function public.process_notification_outbox(int) to service_role;
-- from 20260905180000_central_notifications_outbox.sql
grant execute on function public.requeue_notification_outbox(uuid, boolean) to service_role;
-- from 20260905190000_email_delivery_hardening.sql
revoke all on function public.get_server_secret(text) from public, anon, authenticated;
-- from 20260905190000_email_delivery_hardening.sql
grant execute on function public.get_server_secret(text) to service_role;
-- from 20260905190000_email_delivery_hardening.sql
revoke all on function public.force_resend_notification_outbox(uuid) from public, anon, authenticated;
-- from 20260905190000_email_delivery_hardening.sql
revoke all on function public.notification_delivery_health() from public, anon, authenticated;
-- from 20260905190000_email_delivery_hardening.sql
grant execute on function public.force_resend_notification_outbox(uuid) to service_role;
-- from 20260905190000_email_delivery_hardening.sql
grant execute on function public.notification_delivery_health() to service_role;
-- from 20260905210000_workshop_bridge.sql
revoke all on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text) from public, anon, authenticated;
-- from 20260905210000_workshop_bridge.sql
grant execute on function public.ingest_workshop_registration(text, text, text, text, text, text, text, text, timestamptz, text, text, text, timestamptz, jsonb, text, text) to service_role;
-- from 20260905233000_coding_vscode_authority_hardening.sql
revoke execute on function public.claim_vscode_submission_verification(uuid, uuid) from public, anon, authenticated;
-- from 20260905233000_coding_vscode_authority_hardening.sql
grant execute on function public.claim_vscode_submission_verification(uuid, uuid) to service_role;
-- from 20260905235000_offline_exams_bridge.sql
revoke execute on function public.ingest_offline_exam(jsonb) from public, anon, authenticated;
-- from 20260905235000_offline_exams_bridge.sql
grant execute on function public.ingest_offline_exam(jsonb) to service_role;
-- from 20260905235000_offline_exams_bridge.sql
revoke execute on function public.save_offline_exam_results(uuid, jsonb) from public, anon;
-- from 20260905235000_offline_exams_bridge.sql
grant execute on function public.save_offline_exam_results(uuid, jsonb) to authenticated;
-- from 20260905235000_offline_exams_bridge.sql
revoke execute on function public.publish_offline_exam_results(uuid) from public, anon;
-- from 20260905235000_offline_exams_bridge.sql
grant execute on function public.publish_offline_exam_results(uuid) to authenticated;
-- from 20260905240400_offline_exams_product_completion.sql
revoke execute on function public.create_offline_exam(text, uuid, text, date, time, integer, numeric, text, text) from public, anon;
-- from 20260905240400_offline_exams_product_completion.sql
grant execute on function public.create_offline_exam(text, uuid, text, date, time, integer, numeric, text, text) to authenticated;
-- from 20260906000000_marketing_lead_ingestion.sql
revoke all on public.integration_audit_log from public, anon, authenticated;
-- from 20260906000000_marketing_lead_ingestion.sql
grant all on public.integration_audit_log to service_role;
