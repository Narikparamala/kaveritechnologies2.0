// Hard delete client — ADDITIVE ONLY (2026-11-24, feature/hard-delete-user).
//
// Talks to the `admin-delete-user` edge function. The function is the only
// thing that can delete an account: it verifies the caller's JWT, checks
// Super Admin / faculty scope, pre-checks RESTRICT blockers, and calls
// auth.admin.deleteUser(). Payment records are deleted WITH the account
// (user decision 2026-11-24) — the pre-delete export is the retained
// record, so the modal must offer the download before deleting.
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export interface DeletionCount {
  label: string;
  count: number | null;
}

export interface DeletionBlocker {
  table: string;
  column: string;
  label: string;
  count: number;
}

export interface DeletionPreview {
  profile: Profile & { is_test?: boolean };
  counts: Record<string, DeletionCount>;
  total: number;
  blockers: DeletionBlocker[];
  isTest: boolean;
}

export interface DeletionExport extends DeletionPreview {
  filename: string;
  exportedAt: string;
  sections: Record<string, unknown>;
  summaryText: string;
}

export interface DeletionRequest {
  id: string;
  requested_by: string;
  target_user_id: string;
  target_email: string;
  target_name: string | null;
  target_role: string;
  reason: string;
  ai_report: string | null;
  export_summary: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  requested_by_profile?: { id: string; full_name: string | null; email: string } | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', { body });
  if (error) throw new Error(error.message || 'Could not reach the delete service.');
  if (!data || typeof data !== 'object') throw new Error('Unexpected response from the delete service.');
  const payload = data as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'The delete service refused the request.');
  }
  return payload as T;
}

export async function previewUserDeletion(targetUserId: string): Promise<DeletionPreview> {
  return invoke<DeletionPreview>({ action: 'preview', targetUserId });
}

export async function exportUserData(targetUserId: string): Promise<DeletionExport> {
  return invoke<DeletionExport>({ action: 'export', targetUserId });
}

export async function generateDeletionReport(
  targetUserId: string,
  reason: string,
): Promise<{ report: string; aiGenerated: boolean; aiUnavailable?: boolean; model?: string }> {
  return invoke<{ report: string; aiGenerated: boolean; aiUnavailable?: boolean; model?: string }>({
    action: 'generate-report',
    targetUserId,
    reason,
  });
}

export async function deleteUserHard(input: {
  targetUserId: string;
  reason: string;
  report?: string | null;
  exportConfirmed?: boolean;
  exportSkipped?: boolean;
  requestId?: string | null;
}): Promise<{ deleted: boolean; total: number }> {
  return invoke<{ deleted: boolean; total: number }>({
    action: 'delete',
    targetUserId: input.targetUserId,
    reason: input.reason,
    report: input.report ?? null,
    exportConfirmed: input.exportConfirmed ?? false,
    exportSkipped: input.exportSkipped ?? false,
    requestId: input.requestId ?? null,
  });
}

export async function requestUserDeletion(input: {
  targetUserId: string;
  reason: string;
  report?: string | null;
}): Promise<{ request: DeletionRequest }> {
  return invoke<{ request: DeletionRequest }>({
    action: 'request',
    targetUserId: input.targetUserId,
    reason: input.reason,
    report: input.report ?? null,
  });
}

export async function listDeletionRequests(
  status: 'pending' | 'approved' | 'rejected' = 'pending',
): Promise<DeletionRequest[]> {
  const result = await invoke<{ requests: DeletionRequest[] }>({ action: 'list-requests', status });
  return result.requests ?? [];
}

export async function reviewDeletionRequest(input: {
  requestId: string;
  decision: 'approved' | 'rejected';
  reviewNote?: string | null;
}): Promise<{ requestId: string; decision: string; deleted?: boolean }> {
  return invoke<{ requestId: string; decision: string; deleted?: boolean }>({
    action: 'review-request',
    requestId: input.requestId,
    decision: input.decision,
    reviewNote: input.reviewNote ?? null,
  });
}

// --- Browser downloads (client-side only, no server state) ---------------

export function downloadTextFile(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJsonFile(filename: string, value: unknown): void {
  downloadTextFile(filename, JSON.stringify(value, null, 2), 'application/json');
}
