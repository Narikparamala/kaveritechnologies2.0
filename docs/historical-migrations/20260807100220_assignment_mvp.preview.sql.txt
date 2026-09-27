-- Kaveri Technologies Assignment MVP
-- Development preview database without login authentication.

create extension if not exists pgcrypto with schema extensions;
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- Preview users
create table public.profiles (
  id uuid primary key,
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  bio text,
  role text not null default 'student'
    check (role in ('student', 'faculty', 'super_admin')),
  xp_points integer not null default 0,
  level integer not null default 1,
  streak_days integer not null default 0,
  last_active_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Courses
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_description text,
  description text,
  thumbnail_url text,
  difficulty text not null default 'beginner'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  duration_hours integer not null default 0,
  category text not null default 'python',
  language text not null default 'English',
  is_published boolean not null default true,
  is_featured boolean not null default false,
  enrollment_count integer not null default 0,
  price numeric(10,2) not null default 0,
  certificate_eligible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.course_faculty (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (course_id, faculty_id)
);
create table public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  progress_percentage numeric(5,2) not null default 0,
  enrollment_source text not null default 'manual',
  access_status text not null default 'active'
    check (access_status in ('active', 'revoked', 'pending')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  notes text,
  unique (course_id, student_id)
);
-- Assignments
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  chapter_id uuid,
  lesson_id uuid,
  title text not null,
  description text,
  instructions text,
  assignment_type text not null default 'coding'
    check (assignment_type in ('coding', 'written', 'mixed')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed')),
  start_date timestamptz,
  due_date timestamptz,
  allow_late_submission boolean not null default false,
  max_submissions integer,
  passing_score integer,
  order_index integer not null default 0,
  max_marks integer not null default 100 check (max_marks >= 0),
  difficulty text not null default 'beginner',
  allow_resubmit boolean not null default true,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.assignments(id) on delete cascade,
  title text not null,
  problem_statement text,
  instructions text,
  input_format text,
  output_format text,
  constraints_text text,
  starter_code text,
  hints text[] not null default '{}',
  question_type text not null default 'coding'
    check (question_type in ('coding', 'short_answer', 'long_answer')),
  difficulty text not null default 'beginner',
  marks integer not null default 10 check (marks >= 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.assignment_test_cases (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.assignments(id) on delete cascade,
  question_id uuid
    references public.assignment_questions(id) on delete cascade,
  input_data text,
  expected_output text not null,
  is_hidden boolean not null default false,
  weight integer not null default 1 check (weight > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.assignments(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'graded', 'returned')),
  score integer,
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  submission_number integer not null default 1,
  unique (assignment_id, student_id, submission_number)
);
create table public.assignment_question_submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null
    references public.assignment_submissions(id) on delete cascade,
  question_id uuid not null
    references public.assignment_questions(id) on delete cascade,
  submitted_code text,
  submitted_text text,
  execution_output text,
  passed_test_cases integer not null default 0,
  total_test_cases integer not null default 0,
  marks_awarded integer,
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);
-- Automatically synchronize the publication fields.
create or replace function public.sync_assignment_publication()
returns trigger
language plpgsql
as $$
begin
  new.is_published = (new.status = 'published');
  return new;
end;
$$;
create trigger sync_assignment_publication_trigger
before insert or update of status
on public.assignments
for each row
execute function public.sync_assignment_publication();
-- Updated-at triggers
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();
create trigger assignments_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();
create trigger assignment_questions_updated_at
before update on public.assignment_questions
for each row execute function public.set_updated_at();
create trigger assignment_test_cases_updated_at
before update on public.assignment_test_cases
for each row execute function public.set_updated_at();
create trigger assignment_submissions_updated_at
before update on public.assignment_submissions
for each row execute function public.set_updated_at();
create trigger assignment_question_submissions_updated_at
before update on public.assignment_question_submissions
for each row execute function public.set_updated_at();
-- Useful indexes
create index assignments_course_idx
  on public.assignments(course_id);
create index assignment_questions_assignment_idx
  on public.assignment_questions(assignment_id, order_index);
create index assignment_test_cases_question_idx
  on public.assignment_test_cases(question_id, order_index);
create index assignment_submissions_assignment_idx
  on public.assignment_submissions(assignment_id);
create index assignment_submissions_student_idx
  on public.assignment_submissions(student_id);
-- Preview-mode access.
-- This is temporary and must be replaced before public production use.
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_faculty enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignment_test_cases enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assignment_question_submissions enable row level security;
create policy "preview_profiles"
on public.profiles for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_courses"
on public.courses for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_course_faculty"
on public.course_faculty for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_course_enrollments"
on public.course_enrollments for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_assignments"
on public.assignments for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_assignment_questions"
on public.assignment_questions for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_assignment_test_cases"
on public.assignment_test_cases for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_assignment_submissions"
on public.assignment_submissions for all
to anon, authenticated
using (true)
with check (true);
create policy "preview_question_submissions"
on public.assignment_question_submissions for all
to anon, authenticated
using (true)
with check (true);
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.courses,
  public.course_faculty,
  public.course_enrollments,
  public.assignments,
  public.assignment_questions,
  public.assignment_test_cases,
  public.assignment_submissions,
  public.assignment_question_submissions
to anon, authenticated;
-- Preview identity used by the current application.
insert into public.profiles (
  id,
  email,
  full_name,
  role,
  xp_points,
  level,
  streak_days
)
values (
  '00000000-0000-0000-0000-000000000001',
  'preview@kaveri.academy',
  'Preview User',
  'faculty',
  1250,
  3,
  7
);
-- Initial Python course
insert into public.courses (
  id,
  title,
  slug,
  short_description,
  description,
  difficulty,
  category,
  language,
  is_published,
  created_by
)
values (
  '10000000-0000-0000-0000-000000000001',
  'Python Fundamentals',
  'python-fundamentals',
  'Learn Python through coding assignments.',
  'A beginner-friendly Python course for Kaveri Technologies students.',
  'beginner',
  'python',
  'English',
  true,
  '00000000-0000-0000-0000-000000000001'
);
-- Make the preview identity both faculty and enrolled student.
insert into public.course_faculty (
  course_id,
  faculty_id
)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
);
insert into public.course_enrollments (
  course_id,
  student_id,
  enrollment_source,
  access_status,
  granted_by,
  granted_at
)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'manual',
  'active',
  '00000000-0000-0000-0000-000000000001',
  now()
);
