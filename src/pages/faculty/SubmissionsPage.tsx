import { useEffect, useState } from 'react';
import { MessageSquare, ExternalLink, Github, Star } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate, getStatusColor } from '../../lib/utils';
import type { AssignmentSubmission, Assignment } from '../../types/database';

type SubmissionFull = AssignmentSubmission & { assignment: Assignment; student_profile: { full_name: string; email: string } };

export default function SubmissionsPage() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [submissions, setSubmissions] = useState<SubmissionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<SubmissionFull | null>(null);
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: cf } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
      const cIds = (cf ?? []).map((c: any) => c.course_id);
      if (!cIds.length) { setLoading(false); return; }

      const { data: aData } = await supabase.from('assignments').select('id').in('course_id', cIds);
      const aIds = (aData ?? []).map((a: any) => a.id);
      if (!aIds.length) { setLoading(false); return; }

      const { data } = await supabase
        .from('assignment_submissions')
        .select('*, assignment:assignments(*), student_profile:profiles(full_name, email)')
        .in('assignment_id', aIds)
        .order('submitted_at', { ascending: false });

      setSubmissions((data ?? []) as any);
      setLoading(false);
    };
    load();
  }, [profile]);

  const handleGrade = async () => {
    if (!grading || !profile) return;
    const { error } = await supabase.from('assignment_submissions').update({
      score: Number(gradeForm.score),
      feedback: gradeForm.feedback,
      status: 'graded',
      graded_by: profile.id,
      graded_at: new Date().toISOString(),
    }).eq('id', grading.id);

    if (!error) {
      success('Submission graded!');
      setSubmissions(ss => ss.map(s => s.id === grading.id ? { ...s, score: Number(gradeForm.score), feedback: gradeForm.feedback, status: 'graded' } : s));
      setGrading(null);
    }
  };

  const STATUS_VARIANTS: Record<string, any> = { submitted: 'info', graded: 'success', returned: 'warning', resubmitted: 'teal' };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Student Submissions" subtitle="Review and grade assignment submissions" icon={MessageSquare} />

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : submissions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No submissions yet" />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {submissions.map(sub => (
            <div key={sub.id} className="p-5 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{(sub.student_profile as any)?.full_name ?? 'Student'}</p>
                  <Badge variant={STATUS_VARIANTS[sub.status] ?? 'default'} className="capitalize text-xs">{sub.status}</Badge>
                </div>
                <p className="text-sm text-primary-600 dark:text-primary-400 mb-1">{(sub.assignment as any)?.title}</p>
                <p className="text-xs text-slate-400">Submitted: {formatDate(sub.submitted_at)}</p>
                {sub.submission_text && <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{sub.submission_text}</p>}
                {sub.github_url && (
                  <a href={sub.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 mt-1 hover:underline">
                    <Github size={11} /> GitHub
                  </a>
                )}
                {sub.score !== null && <p className="text-sm font-medium text-emerald-600 mt-1">Score: {sub.score}/{(sub.assignment as any)?.max_marks}</p>}
                {sub.feedback && <p className="text-xs text-slate-500 italic mt-1">{sub.feedback}</p>}
              </div>
              {sub.status !== 'graded' && (
                <button
                  onClick={() => { setGrading(sub); setGradeForm({ score: '', feedback: '' }); }}
                  className="btn-primary text-sm py-2 px-4 flex-shrink-0 self-start"
                >
                  Grade
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!grading} onClose={() => setGrading(null)} title="Grade Submission">
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm">
            <p className="font-medium">{(grading?.student_profile as any)?.full_name}</p>
            <p className="text-slate-500">{(grading?.assignment as any)?.title}</p>
          </div>
          {grading?.submission_text && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-xs font-medium text-slate-500 mb-1">Submission</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{grading.submission_text}</p>
            </div>
          )}
          <div>
            <label className="label">Score (out of {(grading?.assignment as any)?.max_marks})</label>
            <div className="relative">
              <Star size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="number" className="input pl-9" placeholder="0" value={gradeForm.score} onChange={e => setGradeForm(f => ({ ...f, score: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Feedback</label>
            <textarea className="input min-h-[100px] resize-none" placeholder="Provide feedback to the student..." value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setGrading(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleGrade} className="btn-primary">Submit Grade</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
