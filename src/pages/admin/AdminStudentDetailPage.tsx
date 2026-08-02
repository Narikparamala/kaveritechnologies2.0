import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, BookOpen, Award, Calendar, CheckCircle, Clock, AlertTriangle, Trophy, FileText, Video, TrendingUp, Send } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { supabase } from '../../lib/supabase';
import { getStudentWithDetails, createSupportRecord, updateSupportRecord, getStudentSupportRecords } from '../../services/companyManagement';
import type { Profile, CourseEnrollment, Course, LessonProgress, StudentSupportRecord, Certificate, AssignmentSubmission } from '../../types/database';

export default function AdminStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<(CourseEnrollment & { course: Course })[]>([]);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [supportRecords, setSupportRecords] = useState<StudentSupportRecord[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    load();
  }, [studentId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getStudentWithDetails(studentId!);
      setProfile(data.profile);
      setEnrollments(data.enrollments as any);
      setProgress(data.progress);
      setSupportRecords(data.supportRecords);

      const [certData, subData] = await Promise.all([
        supabase.from('certificates').select('*').eq('student_id', studentId),
        supabase.from('assignment_submissions').select('*').eq('student_id', studentId).order('submitted_at', { ascending: false }).limit(10),
      ]);

      setCertificates((certData.data ?? []) as Certificate[]);
      setSubmissions((subData.data ?? []) as AssignmentSubmission[]);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load student:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupportRecord = async (input: {
    category: string;
    priority: string;
    notes: string;
  }) => {
    if (!studentId) return;
    setSaving(true);
    try {
      const record = await createSupportRecord({
        student_id: studentId,
        category: input.category as any,
        priority: input.priority as any,
        notes: input.notes,
      });
      setSupportRecords(prev => [record, ...prev]);
      setShowSupportModal(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to create support record:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendNotification = async (title: string, message: string) => {
    if (!studentId) return;
    setSaving(true);
    try {
      await supabase.from('notifications').insert({
        user_id: studentId,
        title,
        message,
        type: 'info',
      });
      setShowNotificationModal(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to send notification:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSupportStatus = async (id: string, status: 'open' | 'in_progress' | 'resolved') => {
    try {
      await updateSupportRecord(id, { status });
      setSupportRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update support record:', err);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (!profile) return <div className="p-8 text-center text-slate-500">Student not found</div>;

  const completedLessons = progress.filter(p => p.completed).length;
  const activeCourses = enrollments.filter(e => !e.completed_at).length;
  const completedCourses = enrollments.filter(e => e.completed_at).length;
  const avgProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress_percentage || 0), 0) / enrollments.length)
    : 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-4 flex items-center gap-1">
        <ArrowLeft size={14} /> Back to Students
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-600">
              {(profile.full_name || profile.email)[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{profile.full_name}</h1>
            <p className="text-slate-500">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={profile.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <span className="text-sm text-slate-500">Level {profile.level} - {profile.xp_points} XP</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNotificationModal(true)} className="btn-secondary text-sm">
            <Send size={14} className="mr-1" /> Send Notification
          </button>
          <button onClick={() => setShowSupportModal(true)} className="btn-primary text-sm">
            <AlertTriangle size={14} className="mr-1" /> Add Support Record
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card p-4 text-center">
              <BookOpen className="text-blue-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{enrollments.length}</p>
              <p className="text-xs text-slate-500">Enrolled</p>
            </div>
            <div className="card p-4 text-center">
              <TrendingUp className="text-emerald-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{activeCourses}</p>
              <p className="text-xs text-slate-500">In Progress</p>
            </div>
            <div className="card p-4 text-center">
              <CheckCircle className="text-purple-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{completedCourses}</p>
              <p className="text-xs text-slate-500">Completed</p>
            </div>
            <div className="card p-4 text-center">
              <Award className="text-amber-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{certificates.length}</p>
              <p className="text-xs text-slate-500">Certificates</p>
            </div>
          </div>

          {/* Enrolled Courses */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Enrolled Courses</h2>
            {enrollments.length === 0 ? (
              <p className="text-sm text-slate-400">Not enrolled in any courses.</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map(e => (
                  <div key={e.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{e.course?.title}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Enrolled {new Date(e.enrolled_at).toLocaleDateString()}
                        {e.completed_at && ` - Completed ${new Date(e.completed_at).toLocaleDateString()}`}
                      </p>
                      <ProgressBar value={e.progress_percentage || 0} size="sm" className="mt-2" />
                    </div>
                    <span className="text-xs text-slate-500">{Math.round(e.progress_percentage || 0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Submissions */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Recent Submissions</h2>
            {submissions.length === 0 ? (
              <p className="text-sm text-slate-400">No submissions yet.</p>
            ) : (
              <div className="space-y-2">
                {submissions.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div>
                      <p className="text-sm text-slate-900 dark:text-white">{s.submission_text?.slice(0, 50) || 'No description'}</p>
                      <p className="text-xs text-slate-500">{new Date(s.submitted_at).toLocaleDateString()}</p>
                    </div>
                    <Badge className={s.status === 'graded' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Support Records */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 dark:text-white">Support Records</h2>
              <span className="text-xs text-slate-500">{supportRecords.filter(r => r.status !== 'resolved').length} open</span>
            </div>
            {supportRecords.length === 0 ? (
              <p className="text-sm text-slate-400">No support records.</p>
            ) : (
              <div className="space-y-3">
                {supportRecords.map(record => (
                  <div key={record.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={record.category === 'academic' ? 'bg-blue-100 text-blue-700' : record.category === 'attendance' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>
                          {record.category}
                        </Badge>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${record.status === 'open' ? 'bg-red-100 text-red-700' : record.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {record.status}
                        </span>
                      </div>
                      <select
                        value={record.status}
                        onChange={e => handleUpdateSupportStatus(record.id, e.target.value as any)}
                        className="input text-xs py-1 px-2"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{record.notes}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {record.faculty?.full_name ? `Assigned to ${record.faculty.full_name} - ` : ''}
                      {new Date(record.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Contact Info */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Contact</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400" />
                <a href={`mailto:${profile.email}`} className="text-primary-600 hover:underline">{profile.email}</a>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400" />
                  <a href={`tel:${profile.phone}`} className="text-primary-600 hover:underline">{profile.phone}</a>
                </div>
              )}
            </div>
          </div>

          {/* Learning Stats */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Learning Stats</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">XP Points</span>
                  <span className="font-medium text-slate-900 dark:text-white">{profile.xp_points}</span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Current Level</span>
                <span className="font-medium text-slate-900 dark:text-white">Level {profile.level}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Streak</span>
                <span className="font-medium text-slate-900 dark:text-white">{profile.streak_days || 0} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Lessons Completed</span>
                <span className="font-medium text-slate-900 dark:text-white">{completedLessons}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Avg Progress</span>
                <span className="font-medium text-slate-900 dark:text-white">{avgProgress}%</span>
              </div>
            </div>
          </div>

          {/* Certificates */}
          {certificates.length > 0 && (
            <div className="card p-6">
              <h2 className="font-bold text-slate-900 dark:text-white mb-4">Certificates</h2>
              <div className="space-y-2">
                {certificates.map(cert => (
                  <div key={cert.id} className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
                    <p className="font-medium text-amber-800 dark:text-amber-200">{cert.certificate_uid}</p>
                    <p className="text-amber-600 dark:text-amber-400">{new Date(cert.issued_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Support Modal */}
      <Modal open={showSupportModal} onClose={() => setShowSupportModal(false)} title="Add Support Record">
        <form onSubmit={e => { e.preventDefault(); handleCreateSupportRecord({
          category: (e.target as any).category.value,
          priority: (e.target as any).priority.value,
          notes: (e.target as any).notes.value,
        }); }}>
          <div className="space-y-4">
            <select name="category" className="input w-full" required>
              <option value="">Select Category</option>
              <option value="academic">Academic</option>
              <option value="attendance">Attendance</option>
              <option value="behavior">Behavior</option>
              <option value="payment">Payment</option>
              <option value="general">General</option>
            </select>
            <select name="priority" className="input w-full" required>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <textarea name="notes" placeholder="Support notes..." className="input w-full" rows={3} required />
            <button type="submit" disabled={saving} className="btn-primary w-full">Save</button>
          </div>
        </form>
      </Modal>

      {/* Notification Modal */}
      <Modal open={showNotificationModal} onClose={() => setShowNotificationModal(false)} title="Send Notification">
        <form onSubmit={e => { e.preventDefault(); handleSendNotification(
          (e.target as any).title.value,
          (e.target as any).message.value
        ); }}>
          <div className="space-y-4">
            <input name="title" placeholder="Notification title" className="input w-full" required />
            <textarea name="message" placeholder="Message" className="input w-full" rows={3} required />
            <button type="submit" disabled={saving} className="btn-primary w-full">Send to Student</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
