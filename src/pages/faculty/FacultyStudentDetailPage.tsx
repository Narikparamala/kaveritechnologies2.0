import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, BookOpen, Award, CheckCircle, Clock, AlertTriangle, Plus, MessageSquare } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getStudentSupportRecords, createSupportRecord, updateSupportRecord } from '../../services/companyManagement';
import type { Profile, CourseEnrollment, Course, LessonProgress, AssignmentSubmission, StudentSupportRecord } from '../../types/database';

export default function FacultyStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile: faculty } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<(CourseEnrollment & { course: Course })[]>([]);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [supportRecords, setSupportRecords] = useState<StudentSupportRecord[]>([]);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignedCourseIds, setAssignedCourseIds] = useState<string[]>([]);

  useEffect(() => {
    if (!studentId || !faculty) return;
    loadData();
  }, [studentId, faculty]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get faculty's assigned courses
      const { data: courseFaculty } = await supabase
        .from('course_faculty')
        .select('course_id')
        .eq('faculty_id', faculty!.id);
      const courseIds = (courseFaculty ?? []).map(cf => cf.course_id);
      setAssignedCourseIds(courseIds);

      // Get student profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single();
      setProfile(profileData as Profile);

      // Get student's enrollments (only in faculty's courses)
      const { data: enrollmentsData } = await supabase
        .from('course_enrollments')
        .select('*, course:courses(*)')
        .eq('student_id', studentId)
        .in('course_id', courseIds);
      setEnrollments((enrollmentsData ?? []) as any);

      // Get lesson progress for these courses
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', studentId)
        .in('course_id', courseIds);
      setProgress((progressData ?? []) as LessonProgress[]);

      // Get submissions for assignments in these courses
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select('id')
        .in('course_id', courseIds);
      const assignmentIds = (assignmentsData ?? []).map(a => a.id);

      if (assignmentIds.length > 0) {
        const { data: submissionsData } = await supabase
          .from('assignment_submissions')
          .select('*, assignment:assignments(title)')
          .eq('student_id', studentId)
          .in('assignment_id', assignmentIds)
          .order('submitted_at', { ascending: false });
        setSubmissions((submissionsData ?? []) as any);
      }

      // Get support records
      const records = await getStudentSupportRecords(studentId!);
      setSupportRecords(records.filter(r => r.faculty_id === faculty!.id || !r.faculty_id));
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
    if (!studentId || !faculty) return;
    setSaving(true);
    try {
      const record = await createSupportRecord({
        student_id: studentId,
        faculty_id: faculty.id,
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

  const handleUpdateSupportStatus = async (id: string, status: 'open' | 'in_progress' | 'resolved') => {
    try {
      await updateSupportRecord(id, { status });
      setSupportRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update support record:', err);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (!profile) return <div className="p-8 text-center text-slate-500">Student not found or not in your courses</div>;

  const completedLessons = progress.filter(p => p.completed).length;
  const pendingSubmissions = submissions.filter(s => s.status === 'submitted').length;

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
              <Badge className="bg-emerald-100 text-emerald-700">Student</Badge>
              <span className="text-sm text-slate-500">Level {profile.level} - {profile.xp_points} XP</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSupportModal(true)} className="btn-secondary text-sm">
            <AlertTriangle size={14} className="mr-1" /> Add Support Record
          </button>
          <button onClick={() => setShowFeedbackModal(true)} className="btn-primary text-sm">
            <MessageSquare size={14} className="mr-1" /> Send Feedback
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
              <p className="text-xs text-slate-500">Your Courses</p>
            </div>
            <div className="card p-4 text-center">
              <CheckCircle className="text-emerald-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{completedLessons}</p>
              <p className="text-xs text-slate-500">Completed</p>
            </div>
            <div className="card p-4 text-center">
              <Clock className="text-amber-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{pendingSubmissions}</p>
              <p className="text-xs text-slate-500">Pending Review</p>
            </div>
            <div className="card p-4 text-center">
              <Award className="text-purple-600 mx-auto mb-2" size={20} />
              <p className="text-xl font-bold text-slate-900 dark:text-white">{profile.streak_days || 0}</p>
              <p className="text-xs text-slate-500">Day Streak</p>
            </div>
          </div>

          {/* Enrolled in Your Courses */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Enrolled in Your Courses</h2>
            {enrollments.length === 0 ? (
              <p className="text-sm text-slate-400">Not enrolled in any of your courses.</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map(e => (
                  <div key={e.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{e.course?.title}</p>
                      <p className="text-xs text-slate-500">Enrolled {new Date(e.enrolled_at).toLocaleDateString()}</p>
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
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {(s as any).assignment?.title || 'Assignment'}
                      </p>
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
              <button onClick={() => setShowSupportModal(true)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            {supportRecords.length === 0 ? (
              <p className="text-sm text-slate-400">No support records.</p>
            ) : (
              <div className="space-y-3">
                {supportRecords.map(record => (
                  <div key={record.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={record.category === 'academic' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}>
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
                    <p className="text-xs text-slate-400 mt-2">{new Date(record.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Contact */}
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
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">XP Points</span>
                <span className="font-medium text-slate-900 dark:text-white">{profile.xp_points}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Level</span>
                <span className="font-medium text-slate-900 dark:text-white">{profile.level}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Streak</span>
                <span className="font-medium text-slate-900 dark:text-white">{profile.streak_days || 0} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Last Active</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {profile.last_active_date ? new Date(profile.last_active_date).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
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

      {/* Feedback Modal */}
      <Modal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="Send Academic Feedback">
        <form onSubmit={e => { e.preventDefault(); handleCreateSupportRecord({
          category: 'academic',
          priority: 'low',
          notes: `[Feedback] ${(e.target as any).feedback.value}`,
        }); setShowFeedbackModal(false); }}>
          <div className="space-y-4">
            <textarea name="feedback" placeholder="Write academic feedback for this student..." className="input w-full" rows={4} required />
            <button type="submit" disabled={saving} className="btn-primary w-full">Send Feedback</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
