# Isolated coding grader v1

## Goal

Move final Python grading and hidden tests out of the browser while keeping local Pyodide runs for fast visible-test practice.

## Data flow

1. The authenticated student saves code through the existing submission tables.
2. The browser invokes the `secure-grade` Supabase Edge Function with only a question/submission identifier and, for practice, the submitted code.
3. The Edge Function validates the Supabase user and resource ownership.
4. A service-role client loads hidden tests; hidden inputs and expected outputs never enter the browser.
5. The function calls a configured Judge0-compatible isolated runner with CPU, wall-time, memory, file-size, and network limits.
6. Only aggregate safe results are written to `secure_grading_runs` and returned to the student.
7. Verified practice results update `coding_question_attempts`; assignment results update per-question marks and the overall submission. Faculty can still review and override assignment grades.

## Required production secrets

- `JUDGE0_URL`: base URL of the trusted isolated Judge0 deployment.
- `JUDGE0_TOKEN`: optional RapidAPI/private runner token.
- `JUDGE0_HOST`: optional RapidAPI host header.
- `LMS_ALLOWED_ORIGINS`: comma-separated exact LMS origins, including preview domains if required.

Do not point production at an untrusted public compiler. The runner must execute each request in an ephemeral restricted sandbox with no platform secrets and no internal-network access.

## Security limits

- Authentication and ownership are checked server-side.
- Maximum 20 KB of Python source.
- Maximum 30 tests per grading request.
- Maximum 10 grading requests per student per five minutes.
- Judge0 receives explicit CPU, wall-clock, memory, output-file, and network restrictions.
- Hidden test bodies and raw hidden outputs are excluded from `public_result`.
- Students receive read-only access to their grading audit records.

## Verification gates

- Apply the migration to a development/branch database first.
- Configure a trusted runner and Edge Function secrets.
- Test invalid JWT, another student's submission ID, oversized code, rate limiting, timeout, compile error, runtime error, wrong answer, and all-passed flows.
- Confirm hidden tests are absent from browser network responses and `public_result`.
- Run TypeScript typecheck, lint, Vite production build, Supabase advisors, and a real student/faculty end-to-end test.

## Rollback

The existing Pyodide visible-test runner and faculty review remain available. If secure grading is unavailable, submissions stay reviewable by faculty. Disable the Edge Function invocation before removing `secure_grading_runs`.
