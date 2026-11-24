// DeleteUserModal — ADDITIVE ONLY (2026-11-24, feature/hard-delete-user).
//
// One modal for both flows:
//   mode="delete"  — Super Admin hard-deletes the account (profile, login,
//                    enrolments, submissions, XP, certificates AND payment
//                    records — user decision 2026-11-24).
//   mode="request" — faculty files a deletion request for a student in
//                    their own courses; a Super Admin approves/rejects it.
//
// Order inside the modal is deliberate: preview what will vanish, then
// download the user's data (that download is the retained record),
// then type a reason, optionally let the AI draft a short report for
// the student (fully editable), then type the user's email to confirm.
// Nothing is deleted until every step is done.
import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import type { Profile } from '../../types/database';
import {
  deleteUserHard,
  downloadJsonFile,
  downloadTextFile,
  exportUserData,
  generateDeletionReport,
  previewUserDeletion,
  requestUserDeletion,
  type DeletionExport,
  type DeletionPreview,
} from '../../services/userDeletion';

interface DeleteUserModalProps {
  open: boolean;
  onClose: () => void;
  target: Profile | null;
  mode: 'delete' | 'request';
  onDeleted?: (target: Profile) => void;
  onRequested?: (target: Profile) => void;
}

export function DeleteUserModal({ open, onClose, target, mode, onDeleted, onRequested }: DeleteUserModalProps) {
  const { success } = useToast();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exportData, setExportData] = useState<DeletionExport | null>(null);
  const [exportDownloaded, setExportDownloaded] = useState(false);
  const [exportSkipped, setExportSkipped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reason, setReason] = useState('');
  const [report, setReport] = useState('');
  const [reportTouched, setReportTouched] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setPreview(null);
    setPreviewError(null);
    setExportData(null);
    setExportDownloaded(false);
    setExportSkipped(false);
    setReason('');
    setReport('');
    setReportTouched(false);
    setAiNote(null);
    setConfirmEmail('');
    setSubmitError(null);
    setLoadingPreview(true);
    previewUserDeletion(target.id)
      .then(setPreview)
      .catch((err: unknown) => setPreviewError(err instanceof Error ? err.message : 'Could not load the account.'))
      .finally(() => setLoadingPreview(false));
  }, [open, target]);

  if (!target) return null;

  const nonZeroCounts = preview
    ? Object.entries(preview.counts).filter(([, entry]) => typeof entry.count === 'number' && entry.count > 0)
    : [];
  const unknownCounts = preview
    ? Object.entries(preview.counts).filter(([, entry]) => entry.count === null)
    : [];
  const hasBlockers = (preview?.blockers.length ?? 0) > 0;
  const canSubmit =
    !!preview &&
    !busy &&
    reason.trim().length >= 3 &&
    (exportDownloaded || exportSkipped) &&
    confirmEmail.trim() === target.email &&
    !(mode === 'delete' && hasBlockers);

  const handleDownloadExport = async () => {
    setExporting(true);
    setSubmitError(null);
    try {
      const data = exportData ?? (await exportUserData(target.id));
      setExportData(data);
      downloadJsonFile(data.filename, { exportedAt: data.exportedAt, profile: data.profile, counts: data.counts, sections: data.sections });
      downloadTextFile(data.filename.replace(/\.json$/, '-summary.txt'), data.summaryText);
      setExportDownloaded(true);
      success('Download ready', 'The full record and a readable summary were downloaded. Keep them — the data is deleted with the account.');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not download the data.');
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateReport = async () => {
    if (reason.trim().length < 3) {
      setSubmitError('Type a short reason first — for example, inactive for 6 months.');
      return;
    }
    setGeneratingReport(true);
    setSubmitError(null);
    try {
      const result = await generateDeletionReport(target.id, reason.trim());
      setReport(result.report);
      setReportTouched(true);
      setAiNote(
        result.aiGenerated
          ? `Drafted by AI${result.model ? ` (${result.model})` : ''} — edit anything before sending.`
          : 'AI is not connected, so here is a ready-made report — edit anything before sending.',
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not draft the report. You can type it yourself below.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !target) return;
    setBusy(true);
    setSubmitError(null);
    try {
      if (mode === 'delete') {
        await deleteUserHard({
          targetUserId: target.id,
          reason: reason.trim(),
          report: report.trim() ? report.trim() : null,
          exportConfirmed: exportDownloaded,
          exportSkipped,
        });
        success('Account deleted', `${target.full_name ?? target.email} and all of their data were permanently removed.`);
        onDeleted?.(target);
      } else {
        await requestUserDeletion({ targetUserId: target.id, reason: reason.trim(), report: report.trim() ? report.trim() : null });
        success('Request sent', 'A Super Admin will review the deletion request.');
        onRequested?.(target);
      }
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={mode === 'delete' ? 'Delete account permanently' : 'Request account deletion'}
      size="lg"
    >
      <div className="space-y-5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
          <p className="font-medium text-slate-900 dark:text-white">{target.full_name || 'Unnamed user'}</p>
          <p className="text-xs text-slate-500">{target.email} · {target.role.replace('_', ' ')}</p>
          {preview?.isTest && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Test / QA account.</p>
          )}
        </div>

        {loadingPreview && (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading what will be removed…</p>
        )}
        {previewError && (
          <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{previewError}</p>
        )}

        {preview && (
          <>
            <div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                This will permanently delete {preview.total} record{preview.total === 1 ? '' : 's'} — this cannot be undone
              </h4>
              {nonZeroCounts.length === 0 ? (
                <p className="text-sm text-slate-500">No enrolments, submissions, XP, certificates, or payments on this account — only the profile and login.</p>
              ) : (
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 max-h-40 overflow-y-auto">
                  {nonZeroCounts.map(([table, entry]) => (
                    <li key={table} className="flex justify-between gap-2">
                      <span>{entry.label}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {unknownCounts.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">Some counts could not be read ({unknownCounts.map(([t]) => t).join(', ')}) — the delete will still remove whatever exists.</p>
              )}
              <p className="text-xs text-slate-500 mt-2">
                Payment orders and transactions are deleted with the account. Download the data below first — that file is the record you keep.
              </p>
            </div>

            {hasBlockers && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={15} /> Cannot delete yet</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.blockers.map(b => (
                    <li key={`${b.table}.${b.column}`}>· {b.label}: {b.count} — clean up or reassign these first.</li>
                  ))}
                </ul>
                {mode === 'request' && (
                  <p className="mt-1 text-xs">You can still send the request — the Super Admin will see these blockers when reviewing it.</p>
                )}
              </div>
            )}

            <div className="border rounded-xl p-3 space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">1. Download their data first</h4>
              <p className="text-xs text-slate-500">Profile, enrolments, progress, submissions, XP, certificates, and payment records — as a full file plus a readable summary.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void handleDownloadExport()} disabled={exporting} className="btn-secondary text-sm flex items-center gap-2">
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {exportDownloaded ? 'Download again' : 'Download full record'}
                </button>
                {exportDownloaded && <span className="text-xs text-emerald-600">Downloaded — keep this file.</span>}
                <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={exportSkipped} onChange={e => setExportSkipped(e.target.checked)} />
                  Skip the download — I don&apos;t need a copy
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">2. Why is this account being removed?</h4>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Type the reason in plain words — e.g. inactive for 6 months, duplicate account, asked to leave…"
                className="input w-full"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">3. Report for the student (editable)</h4>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void handleGenerateReport()} disabled={generatingReport || reason.trim().length < 3} className="btn-secondary text-sm flex items-center gap-2">
                  {generatingReport ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Draft with AI
                </button>
                <span className="text-xs text-slate-400">Or type the report yourself below. The AI only uses the reason and the counts above — it invents nothing.</span>
              </div>
              {aiNote && <p className="text-xs text-slate-500">{aiNote}</p>}
              <textarea
                value={report}
                onChange={e => { setReport(e.target.value); setReportTouched(true); }}
                placeholder="The report sent to the student — who, what was removed, why, and what to do if it was a mistake…"
                className="input w-full"
                rows={6}
              />
              {reportTouched && report.trim().length === 0 && (
                <p className="text-xs text-slate-400">Empty report — the student will only get the reason you typed above.</p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">4. Confirm — type the user&apos;s email</h4>
              <input
                type="text"
                value={confirmEmail}
                onChange={e => setConfirmEmail(e.target.value)}
                placeholder={target.email}
                className="input w-full"
                autoComplete="off"
              />
            </div>

            {submitError && (
              <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{submitError}</p>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              {mode === 'delete' ? 'Delete account permanently' : 'Send deletion request'}
            </button>
            {mode === 'delete' && !hasBlockers && !canSubmit && (
              <p className="text-xs text-slate-400 text-center">Complete steps 1–4 above to enable the delete button.</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
