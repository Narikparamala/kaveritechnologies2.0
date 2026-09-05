import { useEffect, useState } from 'react';
import { FileText, ClipboardCheck, CalendarDays, Clock, Award } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type ExamRow = {
  id: string;
  title: string;
  course_id: string | null;
  batch_label: string | null;
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number | null;
  status: string;
  student_instructions: string | null;
  course: { id: string; title: string } | null;
};

type ResultRow = {
  id: string;
  marks_obtained: number | null;
  max_marks: number | null;
  remarks: string | null;
  published_at: string | null;
  exam: ExamRow | null;
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'teal' }> = {
  scheduled: { label: 'Scheduled', variant: 'info' },
  conducted: { label: 'Conducted', variant: 'default' },
  results_pending: { label: 'Results pending', variant: 'warning' },
  results_published: { label: 'Published', variant: 'success' },
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(value: string | null): string {
  if (!value) return '';
  // time column arrives as HH:MM:SS
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function StudentOfflineExamsPage() {
  const { profile } = useAuth();
  const [upcoming, setUpcoming] = useState<ExamRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    (async () => {
      const [{ data: examData, error: examError }, { data: resultData, error: resultError }] = await Promise.all([
        supabase
          .from('offline_exams')
          .select('*, course:courses(id,title)')
          .in('status', ['scheduled', 'conducted', 'results_pending'])
          .order('exam_date', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('offline_exam_results')
          .select('*, exam:offline_exams!inner(*, course:courses(id,title))')
          .eq('student_id', profile.id)
          .eq('status', 'published'),
      ]);
      if (!active) return;
      if (examError || resultError) {
        setErrorMessage((examError ?? resultError)?.message ?? 'Failed to load exams');
        setLoading(false);
        return;
      }
      setUpcoming((examData ?? []) as ExamRow[]);
      setResults((resultData ?? []) as ResultRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [profile]);

  if (loading) return <div className="p-6 lg:p-8"><p className="text-slate-500">Loading offline exams…</p></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="Offline Exams"
        subtitle="Exams conducted on paper at the Kaveri campus. Question papers are distributed during the exam — your results appear here once published."
      />

      {errorMessage && (
        <div className="card p-4 mb-6 text-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-900">
          {errorMessage}
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-indigo-500" /> Upcoming Exams
        </h2>
        {upcoming.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={FileText}
              title="No upcoming offline exams"
              description="When an offline exam is scheduled for your batch it will appear here with its date, duration and maximum marks."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map(exam => (
              <div key={exam.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{exam.title}</h3>
                      <Badge variant={STATUS_BADGE[exam.status]?.variant ?? 'default'}>
                        {STATUS_BADGE[exam.status]?.label ?? exam.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {exam.course?.title ?? 'Course to be announced'}
                      {exam.batch_label ? ` · ${exam.batch_label}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end text-sm text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={14} /> {formatDate(exam.exam_date)}
                      {exam.start_time ? <span>· {formatTime(exam.start_time)}</span> : null}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1 text-xs">
                      <Clock size={13} /> {exam.duration_minutes ? `${exam.duration_minutes} min` : 'Duration TBA'}
                      <span className="mx-1">·</span>
                      Max marks: {exam.max_marks ?? '—'}
                    </span>
                  </div>
                </div>
                {exam.student_instructions ? (
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">
                    {exam.student_instructions}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <ClipboardCheck size={16} className="text-emerald-500" /> Past Results
        </h2>
        {results.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Award}
              title="No published results yet"
              description="Once your faculty publishes an offline exam result, your marks appear here. Only published results are visible to you."
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-3 font-medium">Exam</th>
                    <th className="px-5 py-3 font-medium">Course</th>
                    <th className="px-5 py-3 font-medium">Marks</th>
                    <th className="px-5 py-3 font-medium">Published</th>
                    <th className="px-5 py-3 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(result => (
                    <tr key={result.id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                        {result.exam?.title ?? 'Offline exam'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {result.exam?.course?.title ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {result.marks_obtained ?? '—'}
                        </span>
                        <span className="text-xs text-slate-500"> / {result.exam?.max_marks ?? result.max_marks ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {result.published_at ? new Date(result.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{result.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
