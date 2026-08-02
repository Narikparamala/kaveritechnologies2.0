import { useEffect, useState, useCallback } from 'react';
import { Users, Search, BookOpen, Plus, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { grantEnrollment, revokeEnrollment, getStudentEnrollmentsAdmin } from '../../services/faculty';
import { formatDate } from '../../lib/utils';
import type { Profile, Course, CourseEnrollment } from '../../types/database';

export default function AdminEnrollmentPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [students, setStudents] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [grantModal, setGrantModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [grantForm, setGrantForm] = useState({ course_id: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: sData }, { data: cData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student').order('full_name'),
      supabase.from('courses').select('*').order('title'),
    ]);
    setStudents((sData ?? []) as Profile[]);
    setCourses((cData ?? []) as Course[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadEnrollments = async (student: Profile) => {
    setSelectedStudent(student);
    setLoadingEnrollments(true);
    const data = await getStudentEnrollmentsAdmin(student.id);
    setEnrollments(data);
    setLoadingEnrollments(false);
  };

  const handleGrant = async () => {
    if (!profile || !selectedStudent || !grantForm.course_id) return;
    setSaving(true);
    try {
      await grantEnrollment({ course_id: grantForm.course_id, student_id: selectedStudent.id, granted_by: profile.id, notes: grantForm.notes });
      success('Enrollment granted', `${selectedStudent.full_name} now has access.`);
      setGrantModal(false);
      setGrantForm({ course_id: '', notes: '' });
      await loadEnrollments(selectedStudent);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleRevoke = async () => {
    if (!profile || !revokeTarget) return;
    setSaving(true);
    try {
      await revokeEnrollment({ enrollment_id: revokeTarget.id, revoked_by: profile.id });
      success('Enrollment revoked');
      setRevokeTarget(null);
      if (selectedStudent) await loadEnrollments(selectedStudent);
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const filteredStudents = students.filter(s =>
    !search || (s.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    if (status === 'active') return <span className="badge text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={10} /> Active</span>;
    if (status === 'revoked') return <span className="badge text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1"><X size={10} /> Revoked</span>;
    return <span className="badge text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1"><Clock size={10} /> {status}</span>;
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Enrollment Management" subtitle="Grant and revoke student course access" icon={Users} />

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Student List */}
        <div className="lg:col-span-2 card p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-9 text-sm py-2" />
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}</div>
          ) : filteredStudents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No students found.</p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredStudents.map(s => (
                <button
                  key={s.id}
                  onClick={() => loadEnrollments(s)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${selectedStudent?.id === s.id ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-700 dark:text-primary-400">{s.full_name?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{s.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Enrollment Details */}
        <div className="lg:col-span-3 card p-5">
          {!selectedStudent ? (
            <EmptyState icon={Users} title="Select a student" description="Choose a student from the list to view and manage their course access." />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{selectedStudent.full_name}</h3>
                  <p className="text-sm text-slate-400">{selectedStudent.email}</p>
                </div>
                <button onClick={() => { setGrantForm({ course_id: '', notes: '' }); setGrantModal(true); }} className="btn-primary text-sm flex items-center gap-2">
                  <Plus size={14} /> Grant Access
                </button>
              </div>

              {loadingEnrollments ? (
                <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}</div>
              ) : enrollments.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No course access yet. Click "Grant Access" to enroll this student.</p>
              ) : (
                <div className="space-y-2">
                  {enrollments.map((enr: any) => (
                    <div key={enr.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                      <BookOpen size={16} className="text-primary-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{enr.course?.title ?? 'Unknown Course'}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className="capitalize">{enr.enrollment_source?.replace('_', ' ')}</span>
                          <span>·</span>
                          <span>{formatDate(enr.enrolled_at)}</span>
                          {enr.progress_percentage > 0 && <span>· {Math.round(enr.progress_percentage)}% done</span>}
                        </div>
                        {enr.notes && <p className="text-xs text-slate-500 italic mt-0.5">{enr.notes}</p>}
                      </div>
                      {statusBadge(enr.access_status)}
                      {enr.access_status === 'active' && (
                        <button onClick={() => setRevokeTarget(enr)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Grant Access Modal */}
      <Modal open={grantModal} onClose={() => setGrantModal(false)} title={`Grant Course Access — ${selectedStudent?.full_name}`}>
        <div className="space-y-4">
          <div>
            <label className="label">Course</label>
            <select className="input" value={grantForm.course_id} onChange={e => setGrantForm(f => ({ ...f, course_id: e.target.value }))}>
              <option value="">Select course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title} {!c.is_published ? '(Draft)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <textarea className="input min-h-[60px] resize-none" placeholder="Reason for granting access..." value={grantForm.notes} onChange={e => setGrantForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs flex items-start gap-2">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            <span>Enrollment source will be set to <strong>admin_grant</strong>. Student will have immediate access to all published content in this course.</span>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setGrantModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleGrant} disabled={saving || !grantForm.course_id} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={14} />}
              Grant Access
            </button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation */}
      <Modal open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="Revoke Course Access" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Revoke <strong>{selectedStudent?.full_name}</strong>'s access to <strong>{revokeTarget?.course?.title}</strong>?
          The enrollment record will be preserved but marked as revoked.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setRevokeTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleRevoke} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <X size={14} />}
            Revoke Access
          </button>
        </div>
      </Modal>
    </div>
  );
}
