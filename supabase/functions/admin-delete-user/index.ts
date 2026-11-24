// =====================================================================
// admin-delete-user — Hard delete for students / faculty / admins.
//
//   ADDITIVE ONLY (2026-11-24, feature/hard-delete-user). No existing
//   table, RPC, policy, or edge function is changed by this file.
//
//   Why an edge function, not an RPC: the `profiles_delete` RLS policy
//   was dropped in 20260901102000 and never recreated, so no client-side
//   profile delete can succeed; and only a service-role client can call
//   `auth.admin.deleteUser()`. Deleting the auth.users row cascades to
//   the profile row (`profiles.id REFERENCES auth.users(id) ON DELETE
//   CASCADE`) and to every CASCADE dependent — enrolments, submissions,
//   XP, certificates, payment orders/transactions, etc.
//
//   Actions (POST JSON, verify_jwt = false; auth is verified inside,
//   exactly like the payment functions):
//     preview         — counts of what would be deleted + RESTRICT blockers
//     export          — full pre-delete download (JSON sections + summary)
//     generate-report — AI reason report (Gemini path, editable, fallback
//                       to a deterministic template when no AI key exists)
//     delete          — Super Admin only; guards + RESTRICT pre-check +
//                       storage cleanup + audit row + auth.admin.deleteUser
//     request         — faculty: file a deletion request (never deletes)
//     list-requests   — Super Admin: pending deletion requests
//     review-request  — Super Admin: approve (deletes) or reject a request
//
//   Guards (fail closed): caller must be super_admin to delete; faculty
//   may only preview/export/request for students in their own courses;
//   self-delete, last active super_admin, and the synthetic Preview
//   Student (00000000-...-0001, not a DB row) are always rejected.
//   Payment records are deleted WITH the student (user decision
//   2026-11-24) — the pre-delete export is the retained record.
//
//   Secrets: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//   (injected by the Supabase runtime) and GEMINI_API_KEY (platform AI
//   fallback, via the shared generation helpers — a faculty member's own
//   AI connection is used first, exactly like generate-questions).
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError, initStaffRequest, type StaffRequestContext } from "../_shared/ai/connections.ts";
import { runGeneration, stripCodeFences } from "../_shared/ai/generation.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PREVIEW_USER_ID = "00000000-0000-0000-0000-000000000001";
const EXPORT_ROW_LIMIT = 200;

type AdminClient = ReturnType<typeof createClient>;
type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAdminClient(): AdminClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { db: { schema: "public" } });
}

// ---------------------------------------------------------------------
// Table maps — column names verified against the migrations.
// ---------------------------------------------------------------------

// Rows that vanish with the profile (ON DELETE CASCADE). `column` is the
// FK column that points at profiles(id).
const CASCADE_SPECS: Array<{ table: string; column: string; label: string }> = [
  { table: "course_enrollments", column: "student_id", label: "Course enrolments" },
  { table: "course_faculty", column: "faculty_id", label: "Faculty course assignments" },
  { table: "lesson_progress", column: "student_id", label: "Lesson progress rows" },
  { table: "lesson_notes", column: "student_id", label: "Lesson notes" },
  { table: "lesson_bookmarks", column: "student_id", label: "Lesson bookmarks" },
  { table: "assignment_submissions", column: "student_id", label: "Assignment submissions" },
  { table: "quiz_attempts", column: "student_id", label: "Quiz attempts" },
  { table: "project_submissions", column: "student_id", label: "Project submissions" },
  { table: "certificates", column: "student_id", label: "Certificates" },
  { table: "user_achievements", column: "student_id", label: "Achievements" },
  { table: "xp_transactions", column: "student_id", label: "XP transactions" },
  { table: "coding_question_attempts", column: "student_id", label: "Coding practice attempts" },
  { table: "enrollment_requests", column: "student_id", label: "Enrolment requests" },
  { table: "batch_students", column: "student_id", label: "Batch memberships" },
  { table: "session_attendance", column: "student_id", label: "Session attendance rows" },
  { table: "student_support_records", column: "student_id", label: "Support records" },
  { table: "job_applications", column: "student_id", label: "Job applications" },
  { table: "offline_exam_results", column: "student_id", label: "Offline exam results" },
  { table: "payment_orders", column: "student_id", label: "Payment orders" },
  { table: "faculty_employment", column: "faculty_id", label: "Faculty employment record" },
  { table: "faculty_compensation_history", column: "faculty_id", label: "Compensation records" },
  { table: "faculty_performance_reviews", column: "faculty_id", label: "Performance reviews" },
  { table: "faculty_ai_connections", column: "faculty_id", label: "Saved AI connections" },
  { table: "faculty_work_requests", column: "faculty_id", label: "Faculty work requests" },
  { table: "push_subscriptions", column: "user_id", label: "Push subscriptions" },
  { table: "saved_code_snippets", column: "user_id", label: "Saved code snippets" },
  { table: "notification_outbox", column: "recipient_user_id", label: "Queued notifications" },
];

// Rows that BLOCK the delete (ON DELETE RESTRICT). These must be cleaned
// or reassigned first; the delete fails closed and names them.
const RESTRICT_SPECS: Array<{ table: string; column: string; label: string }> = [
  { table: "faculty_teaching_work", column: "faculty_id", label: "Teaching-work rows" },
  { table: "qp_question_bank", column: "created_by", label: "Question-bank items created" },
  { table: "qp_papers", column: "created_by", label: "Question papers created" },
  { table: "qp_papers", column: "finalized_by", label: "Question papers finalised" },
  { table: "qp_papers", column: "archived_by", label: "Question papers archived" },
  { table: "qp_sets", column: "created_by", label: "Question-paper sets created" },
  { table: "qp_question_assets", column: "created_by", label: "Question-paper assets created" },
  { table: "qp_paper_versions", column: "finalized_by", label: "Paper versions finalised" },
  { table: "qp_print_history", column: "performed_by", label: "Print-history rows" },
  { table: "qp_ai_generations", column: "requested_by", label: "AI generation requests" },
  { table: "qp_ai_feedback", column: "created_by", label: "AI feedback rows" },
  { table: "qp_audit_log", column: "performed_by", label: "Question-paper audit rows" },
];

// Rows included in the pre-delete export. faculty_ai_connections is
// deliberately excluded (it holds encrypted API keys — counts only).
const EXPORT_SPECS: Array<{ table: string; column: string; select: string }> = [
  { table: "course_enrollments", column: "student_id", select: "*, course:courses(title)" },
  { table: "course_faculty", column: "faculty_id", select: "*, course:courses(title)" },
  { table: "lesson_progress", column: "student_id", select: "id, course_id, lesson_id, completed, completed_at, created_at" },
  { table: "assignment_submissions", column: "student_id", select: "id, assignment_id, status, marks_obtained, submitted_at, created_at" },
  { table: "quiz_attempts", column: "student_id", select: "id, quiz_id, score, total_marks, submitted_at, created_at" },
  { table: "project_submissions", column: "student_id", select: "id, project_id, status, submitted_at, created_at" },
  { table: "certificates", column: "student_id", select: "id, course_id, certificate_url, issued_at, created_at" },
  { table: "user_achievements", column: "student_id", select: "id, achievement_id, earned_at, created_at" },
  { table: "xp_transactions", column: "student_id", select: "id, amount, reason, created_at" },
  { table: "coding_question_attempts", column: "student_id", select: "id, question_id, status, attempts_count, last_attempted_at" },
  { table: "enrollment_requests", column: "student_id", select: "id, course_id, status, created_at" },
  { table: "batch_students", column: "student_id", select: "id, batch_id, created_at" },
  { table: "session_attendance", column: "student_id", select: "id, session_id, status, created_at" },
  { table: "student_support_records", column: "student_id", select: "id, category, priority, status, notes, created_at" },
  { table: "payment_orders", column: "student_id", select: "id, course_id, amount, currency, gateway, gateway_order_id, status, created_at" },
  { table: "faculty_employment", column: "faculty_id", select: "id, designation, employment_status, created_at" },
  { table: "faculty_compensation_history", column: "faculty_id", select: "id, amount, created_at" },
  { table: "faculty_performance_reviews", column: "faculty_id", select: "id, rating, created_at" },
];

async function countRows(admin: AdminClient, table: string, column: string, value: string): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

type CountMap = Record<string, { label: string; count: number | null }>;

async function collectCounts(admin: AdminClient, targetId: string): Promise<{ counts: CountMap; total: number }> {
  const counts: CountMap = {};
  let total = 0;
  for (const spec of CASCADE_SPECS) {
    const count = await countRows(admin, spec.table, spec.column, targetId);
    counts[spec.table] = { label: spec.label, count };
    if (typeof count === "number") total += count;
  }
  // payment_transactions hang off payment_orders, not the profile.
  try {
    const { data: orders } = await admin
      .from("payment_orders")
      .select("id")
      .eq("student_id", targetId)
      .limit(500);
    const orderIds = (orders ?? []).map((o) => (o as JsonRecord).id as string);
    if (orderIds.length > 0) {
      const txCount = await countRowsIn(admin, "payment_transactions", "payment_order_id", orderIds);
      counts["payment_transactions"] = { label: "Payment transactions", count: txCount };
      if (typeof txCount === "number") total += txCount;
    } else {
      counts["payment_transactions"] = { label: "Payment transactions", count: 0 };
    }
  } catch {
    counts["payment_transactions"] = { label: "Payment transactions", count: null };
  }
  return { counts, total };
}

async function countRowsIn(admin: AdminClient, table: string, column: string, values: string[]): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

type Blocker = { table: string; column: string; label: string; count: number };

async function collectBlockers(admin: AdminClient, targetId: string): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  for (const spec of RESTRICT_SPECS) {
    const count = await countRows(admin, spec.table, spec.column, targetId);
    if (typeof count === "number" && count > 0) {
      blockers.push({ table: spec.table, column: spec.column, label: spec.label, count });
    }
  }
  return blockers;
}

async function loadTarget(admin: AdminClient, targetId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, is_active, is_test, xp_points, level, created_at")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new HttpError(500, "Could not load the user.");
  if (!data) throw new HttpError(404, "User not found.");
  return data as JsonRecord;
}

async function facultyMayAccessTarget(admin: AdminClient, facultyId: string, target: JsonRecord): Promise<boolean> {
  if (target.role !== "student") return false;
  const { data: assignments } = await admin
    .from("course_faculty")
    .select("course_id")
    .eq("faculty_id", facultyId);
  const courseIds = (assignments ?? []).map((r) => (r as JsonRecord).course_id as string);
  if (courseIds.length === 0) return false;
  const { count } = await admin
    .from("course_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", target.id as string)
    .in("course_id", courseIds);
  return (count ?? 0) > 0;
}

async function authorizeTarget(
  ctx: StaffRequestContext,
  admin: AdminClient,
  targetId: string,
  opts: { superAdminOnly?: boolean } = {},
): Promise<{ caller: JsonRecord; target: JsonRecord; isSuperAdmin: boolean }> {
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", ctx.facultyId)
    .maybeSingle();
  const caller = (callerProfile ?? { id: ctx.facultyId, role: ctx.role }) as JsonRecord;
  const isSuperAdmin = caller.role === "super_admin";
  if (opts.superAdminOnly && !isSuperAdmin) {
    throw new HttpError(403, "Only a Super Admin can do this.");
  }
  if (targetId === PREVIEW_USER_ID) {
    throw new HttpError(400, "The Preview Student is a demo account and cannot be deleted.");
  }
  const target = await loadTarget(admin, targetId);
  if (!isSuperAdmin) {
    const allowed = await facultyMayAccessTarget(admin, ctx.facultyId, target);
    if (!allowed) {
      throw new HttpError(403, "You can only act on students enrolled in your own courses.");
    }
  }
  return { caller, target, isSuperAdmin };
}

async function requireSuperAdmin(admin: AdminClient, ctx: StaffRequestContext): Promise<JsonRecord> {
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", ctx.facultyId)
    .maybeSingle();
  const caller = (callerProfile ?? { id: ctx.facultyId, role: ctx.role }) as JsonRecord;
  if (caller.role !== "super_admin") {
    throw new HttpError(403, "Only a Super Admin can do this.");
  }
  return caller;
}

function buildSummaryText(profile: JsonRecord, counts: CountMap, total: number, blockers: Blocker[]): string {
  const lines: string[] = [
    `Account record for ${profile.full_name ?? "Unnamed user"} (${profile.email})`,
    `Role: ${profile.role} | Account created: ${profile.created_at ?? "unknown"} | XP: ${profile.xp_points ?? 0}`,
    ``,
    `The following records belong to this account and will be permanently deleted with it (${total} rows counted):`,
  ];
  for (const [table, entry] of Object.entries(counts)) {
    if (typeof entry.count === "number" && entry.count > 0) {
      lines.push(`- ${entry.label}: ${entry.count} (${table})`);
    }
  }
  if (blockers.length > 0) {
    lines.push(``, `BLOCKED — the following records prevent deletion until they are cleaned or reassigned:`);
    for (const b of blockers) lines.push(`- ${b.label}: ${b.count} (${b.table}.${b.column})`);
  }
  lines.push(``, `Payment orders and transactions are deleted with the account. This export is the retained record.`);
  return lines.join("\n");
}

function buildTemplateReport(profile: JsonRecord, counts: CountMap, reason: string): string {
  const name = (profile.full_name as string | null) ?? "Student";
  const enrolments = counts["course_enrollments"]?.count ?? 0;
  const payments = counts["payment_orders"]?.count ?? 0;
  return [
    `Hello ${name},`,
    ``,
    `We are writing to let you know that your Kaveri Academy account (${profile.email}) has been removed.`,
    ``,
    `Reason: ${reason}`,
    ``,
    `What was removed: your profile, ${enrolments} course enrolment(s), your learning progress, submissions, XP and achievements, and ${payments} payment record(s). Any courses or lessons you created will remain available, without your name attached.`,
    ``,
    `If you think this was a mistake, please reply to this message and our team will look into it.`,
    ``,
    `Thank you for learning with us.`,
    `Kaveri Academy team`,
  ].join("\n");
}

async function removeUserStorage(admin: AdminClient, targetId: string): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  for (const bucket of ["profile-avatars", "project-submissions"]) {
    let count = 0;
    try {
      const { data: root } = await admin.storage.from(bucket).list("", { limit: 100 });
      const rootPaths = (root ?? [])
        .map((f) => f.name)
        .filter((name) => name.includes(targetId));
      const { data: folder } = await admin.storage.from(bucket).list(targetId, { limit: 100 });
      const folderPaths = (folder ?? []).map((f) => `${targetId}/${f.name}`);
      const paths = [...rootPaths, ...folderPaths];
      if (paths.length > 0) {
        const { data } = await admin.storage.from(bucket).remove(paths);
        count = data?.length ?? 0;
      }
    } catch {
      count = 0;
    }
    removed[bucket] = count;
  }
  return removed;
}

async function deleteUserInternal(
  admin: AdminClient,
  caller: JsonRecord,
  target: JsonRecord,
  opts: { reason: string; report: string | null; requestId?: string | null },
): Promise<{ counts: CountMap; total: number; storageRemoved: Record<string, number> }> {
  const targetId = target.id as string;
  if (targetId === (caller.id as string)) {
    throw new HttpError(403, "A Super Admin cannot delete their own account.");
  }
  if (target.role === "super_admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      throw new HttpError(403, "You cannot delete the last active Super Admin.");
    }
  }
  const { counts, total } = await collectCounts(admin, targetId);
  const blockers = await collectBlockers(admin, targetId);
  if (blockers.length > 0) {
    const detail = blockers.map((b) => `${b.label} (${b.count})`).join(", ");
    throw new HttpError(409, `This account cannot be deleted yet: ${detail}. Clean up or reassign those records first.`);
  }
  const storageRemoved = await removeUserStorage(admin, targetId);

  // Audit trail first — the profile row (and its CASCADE dependents) are
  // about to disappear, so the deletion itself is recorded now.
  try {
    await admin.from("activity_logs").insert({
      user_id: caller.id as string,
      action: "user_hard_deleted",
      entity_type: "profile",
      entity_id: targetId,
      metadata: {
        target_email: target.email,
        target_name: target.full_name,
        target_role: target.role,
        reason: opts.reason,
        report: opts.report,
        deleted_counts: counts,
        deleted_total: total,
        storage_removed: storageRemoved,
        deletion_request_id: opts.requestId ?? null,
      },
    });
  } catch (e) {
    console.error("admin-delete-user audit insert failed:", e instanceof Error ? e.message : e);
  }

  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      throw new HttpError(409, "This account cannot be deleted yet: other records still reference it. Clean up or reassign those records first.");
    }
    throw new HttpError(500, "Could not delete the account. Please try again.");
  }
  return { counts, total, storageRemoved };
}

// ---------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------

async function handlePreview(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const targetId = String(body.targetUserId ?? "").trim();
  if (!targetId) throw new HttpError(400, "targetUserId is required.");
  const { target } = await authorizeTarget(ctx, admin, targetId);
  const { counts, total } = await collectCounts(admin, targetId);
  const blockers = await collectBlockers(admin, targetId);
  return json({
    ok: true,
    profile: target,
    counts,
    total,
    blockers,
    isTest: (target as JsonRecord).is_test === true,
  });
}

async function handleExport(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const targetId = String(body.targetUserId ?? "").trim();
  if (!targetId) throw new HttpError(400, "targetUserId is required.");
  const { target } = await authorizeTarget(ctx, admin, targetId);
  const { counts, total } = await collectCounts(admin, targetId);
  const blockers = await collectBlockers(admin, targetId);

  const sections: Record<string, unknown> = { profile: target };
  for (const spec of EXPORT_SPECS) {
    try {
      const { data, error } = await admin
        .from(spec.table)
        .select(spec.select)
        .eq(spec.column, targetId)
        .order("created_at", { ascending: false })
        .limit(EXPORT_ROW_LIMIT);
      if (error) {
        sections[spec.table] = { unavailable: true };
      } else {
        sections[spec.table] = data ?? [];
      }
    } catch {
      sections[spec.table] = { unavailable: true };
    }
  }
  // Payment transactions hang off payment_orders.
  try {
    const { data: orders } = await admin
      .from("payment_orders")
      .select("id")
      .eq("student_id", targetId)
      .limit(500);
    const orderIds = (orders ?? []).map((o) => (o as JsonRecord).id as string);
    if (orderIds.length > 0) {
      const { data } = await admin
        .from("payment_transactions")
        .select("id, payment_order_id, gateway, event_type, gateway_status, amount, currency, created_at")
        .in("payment_order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(EXPORT_ROW_LIMIT);
      sections["payment_transactions"] = data ?? [];
    } else {
      sections["payment_transactions"] = [];
    }
  } catch {
    sections["payment_transactions"] = { unavailable: true };
  }

  const summaryText = buildSummaryText(target, counts, total, blockers);
  const exportedAt = new Date().toISOString();
  const safeEmail = String(target.email ?? "user").replace(/[^a-zA-Z0-9@._-]/g, "_");
  return json({
    ok: true,
    filename: `kaveri-user-export-${safeEmail}-${exportedAt.slice(0, 10)}.json`,
    exportedAt,
    profile: target,
    counts,
    total,
    blockers,
    sections,
    summaryText,
  });
}

async function handleGenerateReport(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const targetId = String(body.targetUserId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!targetId) throw new HttpError(400, "targetUserId is required.");
  if (reason.length < 3) throw new HttpError(400, "Type a short reason first — for example, inactive for 6 months.");
  const { target } = await authorizeTarget(ctx, admin, targetId);
  const { counts } = await collectCounts(admin, targetId);
  const template = buildTemplateReport(target, counts, reason);

  const system = [
    "You write short, polite account-closure notices for a teaching platform.",
    "Use ONLY the facts given. Do not invent dates, amounts, course names, or promises.",
    "Keep it under 120 words, plain language, no jargon. Structure: greeting, what happened, the reason in one sentence, what was removed, what to do if it was a mistake, sign-off as 'Kaveri Academy team'.",
    "Return the notice text only — no subject line, no markdown fences.",
  ].join("\n");
  const user = [
    `Student: ${target.full_name ?? "Unnamed user"} (${target.email}), role ${target.role}.`,
    `Reason given by staff: ${reason}`,
    `Removed with the account: ${counts["course_enrollments"]?.count ?? 0} course enrolment(s), ${counts["payment_orders"]?.count ?? 0} payment order(s), ${counts["certificates"]?.count ?? 0} certificate(s), ${counts["xp_transactions"]?.count ?? 0} XP transaction(s).`,
  ].join("\n");

  try {
    const result = await runGeneration({
      ctx,
      kind: "deletion-report",
      scope: { topic: "account deletion report" },
      compose: () => ({ system, user, temperature: 0.3, maxOutputTokens: 600 }),
      maxToolRounds: 0,
    });
    const report = stripCodeFences(result.text);
    if (!report) return json({ ok: true, report: template, aiGenerated: false, aiUnavailable: true });
    return json({ ok: true, report, aiGenerated: true, model: result.model });
  } catch (e) {
    // The AI is a convenience, never a blocker: fall back to the
    // deterministic template so the admin can edit and continue.
    console.error("admin-delete-user report generation failed:", e instanceof Error ? e.message : e);
    return json({ ok: true, report: template, aiGenerated: false, aiUnavailable: true });
  }
}

async function handleDelete(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const targetId = String(body.targetUserId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const report = typeof body.report === "string" ? body.report : null;
  const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : null;
  if (!targetId) throw new HttpError(400, "targetUserId is required.");
  if (reason.length < 3) throw new HttpError(400, "A reason is required before deleting an account.");
  if (body.exportConfirmed !== true && body.exportSkipped !== true) {
    throw new HttpError(400, "Download the user's data first, or confirm you are skipping the download.");
  }
  const { caller, target } = await authorizeTarget(ctx, admin, targetId, { superAdminOnly: true });
  const result = await deleteUserInternal(admin, caller, target, { reason, report, requestId });
  if (requestId) {
    await admin
      .from("user_deletion_requests")
      .update({ status: "approved", reviewed_by: caller.id as string, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", requestId);
  }
  return json({ ok: true, deleted: true, profile: target, ...result });
}

async function handleRequest(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const targetId = String(body.targetUserId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const report = typeof body.report === "string" ? body.report : null;
  if (!targetId) throw new HttpError(400, "targetUserId is required.");
  if (reason.length < 3) throw new HttpError(400, "A reason is required before requesting a deletion.");
  const { caller, target } = await authorizeTarget(ctx, admin, targetId);
  if (caller.role === "super_admin") {
    throw new HttpError(400, "Super Admins delete directly — a request is only for faculty.");
  }
  const { data: existing } = await admin
    .from("user_deletion_requests")
    .select("id")
    .eq("target_user_id", targetId)
    .eq("status", "pending")
    .limit(1);
  if (existing && existing.length > 0) {
    throw new HttpError(409, "A deletion request for this student is already waiting for review.");
  }
  const { counts } = await collectCounts(admin, targetId);
  const { data, error } = await admin
    .from("user_deletion_requests")
    .insert({
      requested_by: caller.id as string,
      target_user_id: targetId,
      target_email: target.email as string,
      target_name: (target.full_name as string | null) ?? null,
      target_role: target.role as string,
      reason,
      ai_report: report,
      export_summary: { counts },
      status: "pending",
    })
    .select("id, status, created_at")
    .single();
  if (error) throw new HttpError(500, "Could not save the deletion request. Please try again.");
  return json({ ok: true, request: data });
}

async function handleListRequests(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  await requireSuperAdmin(admin, ctx);
  const status = typeof body.status === "string" ? body.status : "pending";
  const { data, error } = await admin
    .from("user_deletion_requests")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, "Could not load deletion requests.");
  const rows = (data ?? []) as JsonRecord[];
  const requesterIds = [...new Set(rows.map((r) => r.requested_by as string))];
  const { data: requesters } = requesterIds.length > 0
    ? await admin.from("profiles").select("id, full_name, email").in("id", requesterIds)
    : { data: [] as JsonRecord[] };
  const byId = new Map((requesters ?? []).map((p) => [(p as JsonRecord).id as string, p as JsonRecord]));
  return json({ ok: true, requests: rows.map((r) => ({ ...r, requested_by_profile: byId.get(r.requested_by as string) ?? null })) });
}

async function handleReviewRequest(ctx: StaffRequestContext, admin: AdminClient, body: JsonRecord) {
  const requestId = String(body.requestId ?? "").trim();
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : null;
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote : null;
  if (!requestId || !decision) throw new HttpError(400, "requestId and a decision (approved/rejected) are required.");
  const caller = await requireSuperAdmin(admin, ctx);
  const { data: request, error: loadError } = await admin
    .from("user_deletion_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError || !request) throw new HttpError(404, "Deletion request not found.");
  const req = request as JsonRecord;
  if (req.status !== "pending") throw new HttpError(409, `This request was already ${req.status}.`);

  if (decision === "rejected") {
    await admin
      .from("user_deletion_requests")
      .update({ status: "rejected", reviewed_by: caller.id as string, reviewed_at: new Date().toISOString(), review_note: reviewNote, updated_at: new Date().toISOString() })
      .eq("id", requestId);
    return json({ ok: true, requestId, decision: "rejected" });
  }

  // Approved: run the same guarded delete as a direct delete. If the
  // delete is blocked (RESTRICT rows, last admin, ...), the request
  // stays pending so the admin can clean up and approve again.
  const { target } = await authorizeTarget(ctx, admin, req.target_user_id as string, { superAdminOnly: true });
  const result = await deleteUserInternal(admin, caller, target, {
    reason: req.reason as string,
    report: (req.ai_report as string | null) ?? null,
    requestId,
  });
  await admin
    .from("user_deletion_requests")
    .update({ status: "approved", reviewed_by: caller.id as string, reviewed_at: new Date().toISOString(), review_note: reviewNote, updated_at: new Date().toISOString() })
    .eq("id", requestId);
  return json({ ok: true, requestId, decision: "approved", deleted: true, profile: target, ...result });
}

// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  let body: JsonRecord;
  try {
    const parsed: unknown = await req.json();
    if (!isRecord(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  try {
    const ctx = await initStaffRequest(req.headers.get("Authorization") ?? "");
    const admin = getAdminClient();
    switch (action) {
      case "preview":
        return await handlePreview(ctx, admin, body);
      case "export":
        return await handleExport(ctx, admin, body);
      case "generate-report":
        return await handleGenerateReport(ctx, admin, body);
      case "delete":
        return await handleDelete(ctx, admin, body);
      case "request":
        return await handleRequest(ctx, admin, body);
      case "list-requests":
        return await handleListRequests(ctx, admin, body);
      case "review-request":
        return await handleReviewRequest(ctx, admin, body);
      default:
        return json({ ok: false, error: `Unknown action: ${action || "(none)"}.` }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ ok: false, error: e.message }, e.status);
    }
    console.error("admin-delete-user failed:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "Request failed. Please try again." }, 500);
  }
});
