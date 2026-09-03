# Isolated coding grader v1

## Goal

Run sample input, custom input, and final tests through the self-hosted Judge0 service. The browser discovers the runtimes that are actually installed, while protected hidden tests stay server-side.

## Data flow

1. The authenticated student selects an installed Judge0 runtime and writes a solution in the full-screen coding workspace.
2. The browser invokes the `secure-grade` Supabase Edge Function for language discovery, sample tests, custom input, or final submission.
3. The Edge Function validates the Supabase user and resource ownership.
4. A service-role client loads hidden tests; hidden inputs and expected outputs never enter the browser.
5. The function calls the self-hosted Judge0 API on the private Docker network with CPU, wall-time, memory, process, output, and network limits.
6. Safe per-test results are written to `secure_grading_runs` and returned to the student. Visible tests include input, expected output, actual output, runtime, and memory. Hidden tests include only pass/fail status, runtime, and memory.
7. Verified practice results update `coding_question_attempts`; assignment results update per-question marks and the overall submission. Faculty can still review and override assignment grades.

## Required production secrets

- `JUDGE0_URL`: server-only base URL of the trusted self-hosted Judge0 deployment.
- `JUDGE0_AUTHN_HEADER` / `JUDGE0_AUTHN_TOKEN`: optional Judge0 authentication pair, detected from the local Judge0 container.
- `JUDGE0_AUTHZ_HEADER` / `JUDGE0_AUTHZ_TOKEN`: optional Judge0 authorization pair when configured.
- `LMS_ALLOWED_ORIGINS`: comma-separated exact LMS origins, including preview domains if required.

Do not point production at an untrusted public compiler. The runner must execute each request in an ephemeral restricted sandbox with no platform secrets and no internal-network access.

## Security limits

- Authentication and ownership are checked server-side.
- Maximum 20 KB of source code and 20 KB of custom input.
- Maximum 30 tests per grading request.
- Maximum 10 grading requests per student per five minutes.
- Maximum 30 sample/custom runs per student per five minutes.
- Judge0 receives explicit CPU, wall-clock, memory, process, output, and network restrictions.
- Hidden test bodies and raw hidden outputs are excluded from `public_result`.
- Students receive read-only access to their grading audit records.

## Student result experience

- The question solver occupies the full viewport instead of inheriting the student dashboard navigation.
- The problem and editor panes have a pointer- and keyboard-accessible horizontal divider.
- The language selector is populated from `GET /languages/` on the local Judge0 server.
- **Run Sample Tests** executes every visible example through the authenticated Edge Function and Judge0.
- **Run Input** sends custom standard input to the same isolated runtime.
- Every visible result shows its input, expected output, and the student's output whether it passes or fails.
- **Submit** runs the complete visible and hidden set in the isolated server-side runner.
- The final summary separately reports visible and hidden pass counts, score, peak runtime, and peak memory.
- Hidden cases show their pass/fail and resource measurements without exposing assessment data.

## Verification gates

- Apply the migration to a development/branch database first.
- Configure a trusted runner and Edge Function secrets.
- Test invalid JWT, another student's submission ID, oversized code, rate limiting, timeout, compile error, runtime error, wrong answer, and all-passed flows.
- Confirm hidden tests are absent from browser network responses and `public_result`.
- Run TypeScript typecheck, lint, Vite production build, Supabase advisors, and a real student/faculty end-to-end test.

For the complete local authenticated runner check on Windows PowerShell, run:

```powershell
.\scripts\start-local-secure-grading.ps1
```

To start Docker Desktop, Supabase, Judge0, the Edge Function, and the LMS from one Windows PowerShell, run:

```powershell
.\scripts\start-local-platform.ps1
```

The Judge0 server container is attached to the local Supabase Docker network. Its internal URL and authentication tokens are supplied only to the Edge Function and never entered into a browser environment variable.

## Rollback

Faculty review remains available if automated grading is unavailable. Disable the Edge Function invocation before removing `secure_grading_runs` or `coding_execution_requests`.
