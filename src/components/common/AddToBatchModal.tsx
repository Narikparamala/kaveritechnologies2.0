import { useEffect, useState } from 'react';
import { Users, Check, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import type { Batch } from '../../types/database';

interface AddToBatchModalProps {
  open: boolean;
  onClose: () => void;
  student: { id: string; full_name: string | null; email: string } | null;
  /** Batches offered in the picker (already scoped by RLS to the caller). */
  batches: Batch[];
  /** Existing memberships (batch_id set) used to disable already-joined rows. */
  joinedBatchIds: string[];
  onAdded: (batchId: string, batchName: string) => void;
}

/**
 * Shared "Add to Batch" picker used by both the admin and faculty student
 * lists. Insert goes through batch_students RLS: admins pass via
 * admin_all_*, faculty via the course_faculty scope. Duplicate membership is
 * blocked client-side (unique constraint backs it server-side).
 */
export function AddToBatchModal({ open, onClose, student, batches, joinedBatchIds, onAdded }: AddToBatchModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setError(null); }, [student?.id, open]);

  if (!student) return null;
  const joined = new Set(joinedBatchIds);
  const available = batches.filter(b => !joined.has(b.id));

  const add = async (batch: Batch) => {
    setSubmitting(true);
    setError(null);
    const { error: insertError } = await supabase
      .from('batch_students')
      .insert({ batch_id: batch.id, student_id: student.id, status: 'active' });
    setSubmitting(false);
    if (insertError) { setError(insertError.message); return; }
    onAdded(batch.id, batch.name);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add ${student.full_name || student.email} to Batch`} size="sm">
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            No batches available{available.length === 0 && batches.length === 0 ? '' : ' for this student'}.
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">This student is already in every available batch.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {available.map(b => (
              <button
                key={b.id}
                disabled={submitting}
                onClick={() => add(b)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Users size={15} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{b.name}</p>
                  <p className="text-xs text-slate-400">{b.description || 'No description'}</p>
                </div>
                {submitting ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <span className="text-xs text-primary-600 font-medium">Add</span>}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
          <Check size={11} className="text-emerald-500" />
          Students join with active status immediately and see the batch in their portal.
        </div>
      </div>
    </Modal>
  );
}
