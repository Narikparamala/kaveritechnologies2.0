import { useEffect, useState } from 'react';
import { Layers3, BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Shows which batches a student belongs to and every course they are enrolled
 * in (not just the viewer's courses). Used on the faculty and admin student
 * detail pages. Reads respect batch_students / course_enrollments RLS, so a
 * faculty member sees the batches they teach plus the enrollments they are
 * allowed to read; admins see everything.
 */

interface BatchMembership {
  id: string;
  status: string;
  enrolled_at: string;
  batch: {
    id: string;
    name: string;
    status: string;
    course: { id: string; title: string } | null;
  } | null;
}

interface CourseEnrollmentRow {
  id: string;
  progress_percentage: number | null;
  access_status: string;
  course: { id: string; title: string } | null;
}

const accessLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  revoked: { label: 'Revoked', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function StudentBatchesCard({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<BatchMembership[]>([]);
  const [courses, setCourses] = useState<CourseEnrollmentRow[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [batchRes, courseRes] = await Promise.all([
        supabase
          .from('batch_students')
          .select('id, status, enrolled_at, batch:batches(id, name, status, course:courses(id, title))')
          .eq('student_id', studentId)
          .order('enrolled_at', { ascending: false }),
        supabase
          .from('course_enrollments')
          .select('id, progress_percentage, access_status, course:courses(id, title)')
          .eq('student_id', studentId)
          .order('enrolled_at', { ascending: false }),
      ]);
      if (!active) return;
      setBatches((batchRes.data ?? []) as unknown as BatchMembership[]);
      setCourses((courseRes.data ?? []) as unknown as CourseEnrollmentRow[]);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [studentId]);

  if (loading) {
    return (
      <div className="card p-6">
        <h2 className="font-bold text-slate-900 dark:text-white mb-3">Batches & Courses</h2>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading memberships...
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="font-bold text-slate-900 dark:text-white mb-4">Batches & Courses</h2>

      {/* Batches */}
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Batches</p>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-400">Not assigned to any batch.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {batches.map(b => (
              <div
                key={b.id}
                className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20 px-3 py-2"
              >
                <Layers3 size={14} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{b.batch?.name ?? 'Unknown batch'}</p>
                  {b.batch?.course?.title && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{b.batch.course.title}</p>
                  )}
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    b.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Course enrollments */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Course enrollments</p>
        {courses.length === 0 ? (
          <p className="text-sm text-slate-400">Not enrolled in any courses.</p>
        ) : (
          <div className="space-y-2">
            {courses.map(e => {
              const access = accessLabels[e.access_status] ?? accessLabels.active;
              return (
                <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <BookOpen size={14} className="text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{e.course?.title ?? 'Unknown course'}</p>
                    <div className="h-1.5 w-full max-w-[220px] rounded-full bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-500"
                        style={{ width: `${Math.round(e.progress_percentage ?? 0)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{Math.round(e.progress_percentage ?? 0)}%</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${access.className}`}>
                    {access.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
