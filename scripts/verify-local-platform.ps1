[CmdletBinding()]
param(
    [string]$DbContainer = "supabase_db_kaverilmspracticeplayground"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$migrations = @(
    "supabase\migrations\20260829141907_isolated_coding_grader_v1.sql",
    "supabase\migrations\20260901090000_repair_assignment_mvp_history.sql",
    "supabase\migrations\20260901102000_google_auth_role_enforcement.sql",
    "supabase\migrations\20260902120000_lesson_completion_integrity.sql",
    "supabase\migrations\20260903110000_judge0_multilanguage_workspace.sql"
)

function Invoke-LocalPsql {
    param([Parameter(Mandatory)][string]$Sql)

    $Sql | docker exec -i $DbContainer `
        psql `
        -v ON_ERROR_STOP=1 `
        -U postgres `
        -d postgres `
        -P pager=off

    if ($LASTEXITCODE -ne 0) {
        throw "Local PostgreSQL command failed. Do not commit or push."
    }
}

Set-Location $repoRoot

$runningContainer = docker ps `
    --filter "name=^/$DbContainer$" `
    --filter "status=running" `
    --format "{{.Names}}"

if ($LASTEXITCODE -ne 0 -or $runningContainer -ne $DbContainer) {
    throw "Docker container '$DbContainer' is not running. Start Docker Desktop and Supabase in the other PowerShell window first."
}

foreach ($relativePath in $migrations) {
    $migrationPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path $migrationPath)) {
        throw "Missing migration: $relativePath"
    }

    Write-Host "`n--- APPLYING $relativePath ---" -ForegroundColor Cyan
    Invoke-LocalPsql -Sql (Get-Content $migrationPath -Raw)
}

Write-Host "`n--- RUNNING AUTHORIZATION AND LEARNING-INTEGRITY TESTS ---" -ForegroundColor Cyan

$securityTests = @'
begin;

do $$
declare
  v_admin_id uuid;
  v_student_id uuid;
  v_lesson_id uuid;
  v_course_id uuid;
  original_admin_role text;
  original_student_role text;
begin
  -- Build disposable Auth identities inside this transaction. This keeps the
  -- authorization test independent from whoever has signed in locally.
  v_admin_id := gen_random_uuid();
  v_student_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'platform-admin-' || v_admin_id::text || '@example.test',
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Verification Admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_student_id,
      'authenticated',
      'authenticated',
      'platform-student-' || v_student_id::text || '@example.test',
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Platform Verification Student"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

  select role into original_admin_role from public.profiles where id = v_admin_id;
  select role into original_student_role from public.profiles where id = v_student_id;

  select lesson.id, lesson.course_id into v_lesson_id, v_course_id
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.is_published = true and course.is_published = true
  order by lesson.created_at
  limit 1;

  if original_admin_role is null or original_student_role is null then
    raise exception 'Temporary Auth profiles were not provisioned by handle_new_user().';
  end if;
  if v_lesson_id is null then
    raise exception 'One published course lesson is required for the completion test.';
  end if;

  -- Disable only Kaveri's user trigger while preparing temporary identities.
  -- Foreign-key and other constraint triggers remain enabled.
  execute 'alter table public.profiles disable trigger trg_protect_profile_authorization_fields';
  update public.profiles set role = 'super_admin', is_active = true where id = v_admin_id;
  update public.profiles set role = 'student', is_active = true where id = v_student_id;
  execute 'alter table public.profiles enable trigger trg_protect_profile_authorization_fields';

  insert into public.course_enrollments (
    course_id, student_id, enrollment_source, access_status, granted_by, granted_at
  ) values (
    v_course_id, v_student_id, 'admin_grant', 'active', v_admin_id, now()
  ) on conflict (course_id, student_id) do update
    set access_status = 'active', revoked_by = null, revoked_at = null;

  delete from public.lesson_progress
  where student_id = v_student_id and lesson_id = v_lesson_id;
  delete from public.xp_transactions
  where student_id = v_student_id and reference_id = v_lesson_id and reference_type = 'lesson';

  perform set_config('kaveri.test_admin_id', v_admin_id::text, true);
  perform set_config('kaveri.test_student_id', v_student_id::text, true);
  perform set_config('kaveri.test_lesson_id', v_lesson_id::text, true);
  perform set_config('kaveri.test_course_id', v_course_id::text, true);
  perform set_config('kaveri.test_student_xp', (select xp_points::text from public.profiles where id = v_student_id), true);
  perform set_config('kaveri.test_admin_role', original_admin_role, true);
  perform set_config('kaveri.test_student_role', original_student_role, true);
end;
$$;

do $$
begin
  if to_regclass('public.secure_grading_runs') is null then
    raise exception 'SECURITY FAILURE: secure grading audit table is missing.';
  end if;
  if not has_table_privilege('authenticated', 'public.secure_grading_runs', 'SELECT') then
    raise exception 'SECURITY FAILURE: students cannot read their own grading audit rows.';
  end if;
  if has_table_privilege('authenticated', 'public.secure_grading_runs', 'INSERT')
     or has_table_privilege('authenticated', 'public.secure_grading_runs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.secure_grading_runs', 'DELETE') then
    raise exception 'SECURITY FAILURE: browser can modify secure grading audit rows.';
  end if;
  if to_regclass('public.coding_execution_requests') is null then
    raise exception 'SECURITY FAILURE: code execution audit table is missing.';
  end if;
  if has_table_privilege('anon', 'public.coding_execution_requests', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.coding_execution_requests', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'SECURITY FAILURE: browser can access code execution audit rows.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coding_question_attempts' and column_name = 'language_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'coding_question_attempts' and column_name = 'language_name'
  ) then
    raise exception 'SECURITY FAILURE: selected Judge0 runtime cannot be persisted.';
  end if;
  if has_table_privilege('authenticated', 'public.lesson_progress', 'INSERT') then
    raise exception 'SECURITY FAILURE: authenticated can insert lesson progress directly.';
  end if;
  if has_table_privilege('authenticated', 'public.xp_transactions', 'INSERT') then
    raise exception 'SECURITY FAILURE: authenticated can insert XP directly.';
  end if;
  if has_table_privilege('authenticated', 'public.course_enrollments', 'UPDATE') then
    raise exception 'SECURITY FAILURE: authenticated can update enrollment progress directly.';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'xp_points', 'UPDATE') then
    raise exception 'SECURITY FAILURE: authenticated can update XP points directly.';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') then
    raise exception 'SECURITY FAILURE: safe profile editing was removed.';
  end if;
  raise notice 'PASS: Browser writes to grading, execution audit, and authoritative learning records are blocked.';
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('kaveri.test_student_id'), true);
set local role authenticated;

do $$
declare
  first_result jsonb;
  second_result jsonb;
  starting_xp integer := current_setting('kaveri.test_student_xp')::integer;
  stored_xp integer;
  expected_reward integer;
begin
  begin
    update public.profiles set xp_points = xp_points + 999999 where id = auth.uid();
    raise exception 'SECURITY FAILURE: Student changed XP directly.';
  exception when insufficient_privilege then
    raise notice 'PASS: Direct XP manipulation was blocked.';
  end;

  select public.complete_lesson(current_setting('kaveri.test_lesson_id')::uuid)
  into first_result;
  select greatest(coalesce(xp_reward, 0), 0) into expected_reward
  from public.lessons where id = current_setting('kaveri.test_lesson_id')::uuid;

  if (first_result ->> 'xp_awarded')::integer <> expected_reward then
    raise exception 'SECURITY FAILURE: First completion awarded incorrect XP: %', first_result;
  end if;

  select xp_points into stored_xp from public.profiles where id = auth.uid();
  if stored_xp <> starting_xp + expected_reward then
    raise exception 'SECURITY FAILURE: Stored XP is incorrect after completion.';
  end if;

  select public.complete_lesson(current_setting('kaveri.test_lesson_id')::uuid)
  into second_result;
  if (second_result ->> 'xp_awarded')::integer <> 0 then
    raise exception 'SECURITY FAILURE: Duplicate completion awarded XP: %', second_result;
  end if;

  select xp_points into stored_xp from public.profiles where id = auth.uid();
  if stored_xp <> starting_xp + expected_reward then
    raise exception 'SECURITY FAILURE: Duplicate completion changed stored XP.';
  end if;
  raise notice 'PASS: Lesson completion is atomic and XP is idempotent.';
end;
$$;

do $$
begin
  begin
    perform public.admin_set_user_role(
      current_setting('kaveri.test_admin_id')::uuid,
      'student'
    );
    raise exception 'SECURITY FAILURE: Student used the admin role RPC.';
  exception when insufficient_privilege then
    raise notice 'PASS: Non-admin role assignment was blocked.';
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', current_setting('kaveri.test_admin_id'), true);
set local role authenticated;

do $$
begin
  perform public.admin_set_user_role(current_setting('kaveri.test_student_id')::uuid, 'faculty');
  perform public.admin_set_user_role(current_setting('kaveri.test_student_id')::uuid, 'student');
  perform public.admin_set_user_active(current_setting('kaveri.test_student_id')::uuid, false);
  raise notice 'PASS: Super Admin role and account controls succeeded.';
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', current_setting('kaveri.test_student_id'), true);
set local role authenticated;

do $$
declare
  visible_profiles integer;
begin
  select count(*) into visible_profiles from public.profiles;
  if visible_profiles <> 1 then
    raise exception 'SECURITY FAILURE: Inactive user can see % profiles.', visible_profiles;
  end if;
  raise notice 'PASS: Inactive account visibility is restricted.';
end;
$$;

reset role;
rollback;
'@

Invoke-LocalPsql -Sql $securityTests

Write-Host "`n--- RUNNING APPLICATION QUALITY GATES ---" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed." }
npm run lint -- --quiet
if ($LASTEXITCODE -ne 0) { throw "ESLint check failed." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed." }

Write-Host "`nLOCAL PLATFORM SECURITY AND BUILD GATES PASSED" -ForegroundColor Green
Write-Host "All temporary test changes were rolled back." -ForegroundColor Green
