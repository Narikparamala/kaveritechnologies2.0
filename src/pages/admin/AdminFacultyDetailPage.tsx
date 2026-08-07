import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Calendar, BookOpen, Users, TrendingUp, DollarSign, Plus, Edit2, AlertTriangle, CheckCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getFacultyWithDetails, getFacultyStats, updateFacultyEmployment,
  getFacultyCompensationHistory, getFacultyPerformanceReviews,
  addCompensationRecord, addPerformanceReview
} from '../../services/companyManagement';
import type { Profile, FacultyEmployment, FacultyCompensationHistory, FacultyPerformanceReview, CourseFaculty, Course } from '../../types/database';

export default function AdminFacultyDetailPage() {
  const { facultyId } = useParams<{ facultyId: string }>();
  const { profile: admin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employment, setEmployment] = useState<FacultyEmployment | null>(null);
  const [courses, setCourses] = useState<(CourseFaculty & { course: Course })[]>([]);
  const [compensationHistory, setCompensationHistory] = useState<FacultyCompensationHistory[]>([]);
  const [performanceReviews, setPerformanceReviews] = useState<FacultyPerformanceReview[]>([]);
  const [stats, setStats] = useState({ studentCount: 0, pendingSubmissions: 0, upcomingSessions: 0 });

  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!facultyId) return;
    load();
  }, [facultyId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getFacultyWithDetails(facultyId!);
      setProfile(data.profile);
      setEmployment(data.employment);
      setCourses(data.courses as any);
      setPerformanceReviews(data.recentReviews);

      const [compData, statsData] = await Promise.all([
        getFacultyCompensationHistory(facultyId!),
        getFacultyStats(facultyId!),
      ]);
      setCompensationHistory(compData);
      setStats(statsData as any);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load faculty:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompensation = async (input: {
    change_type: string;
    amount?: number;
    percentage?: number;
    effective_date: string;
    reason?: string;
  }) => {
    if (!facultyId) return;
    setSaving(true);
    try {
      const record = await addCompensationRecord({ faculty_id: facultyId, ...input } as any);
      setCompensationHistory(prev => [record, ...prev]);
      setShowCompensationModal(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to add compensation:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddReview = async (input: {
    review_period: string;
    rating?: number;
    strengths?: string;
    improvements?: string;
    goals?: string;
    review_date: string;
  }) => {
    if (!facultyId || !admin) return;
    setSaving(true);
    try {
      const review = await addPerformanceReview({
        faculty_id: facultyId,
        reviewer_id: admin.id,
        ...input,
      });
      setPerformanceReviews(prev => [review, ...prev]);
      setShowReviewModal(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to add review:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmployment = async (input: Partial<FacultyEmployment>) => {
    if (!facultyId) return;
    setSaving(true);
    try {
      const updated = await updateFacultyEmployment(facultyId, input);
      setEmployment(updated);
      setShowEditModal(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update employment:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (!profile) return <div className="p-8 text-center text-slate-500">Faculty not found</div>;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-4 flex items-center gap-1">
        <ArrowLeft size={14} /> Back to Faculty
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
              {employment?.designation && (
                <span className="text-sm text-slate-600">{employment.designation}</span>
              )}
              {employment?.department && (
                <span className="text-sm text-slate-500">- {employment.department}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEditModal(true)} className="btn-secondary text-sm">
            <Edit2 size={14} className="mr-1" /> Edit Info
          </button>
          <button onClick={() => setShowCompensationModal(true)} className="btn-secondary text-sm">
            <DollarSign size={14} className="mr-1" /> Add Compensation
          </button>
          <button onClick={() => setShowReviewModal(true)} className="btn-primary text-sm">
            <Plus size={14} className="mr-1" /> Add Review
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <BookOpen className="text-primary-600 mx-auto mb-2" size={24} />
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{courses.length}</p>
              <p className="text-xs text-slate-500">Courses</p>
            </div>
            <div className="card p-4 text-center">
              <Users className="text-emerald-600 mx-auto mb-2" size={24} />
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.studentCount}</p>
              <p className="text-xs text-slate-500">Students</p>
            </div>
            <div className="card p-4 text-center">
              <AlertTriangle className="text-amber-600 mx-auto mb-2" size={24} />
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pendingSubmissions}</p>
              <p className="text-xs text-slate-500">Pending</p>
            </div>
          </div>

          {/* Assigned Courses */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Assigned Courses</h2>
            {courses.length === 0 ? (
              <p className="text-sm text-slate-400">No courses assigned.</p>
            ) : (
              <div className="space-y-2">
                {courses.map(cf => (
                  <div key={cf.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{cf.course?.title}</p>
                      <p className="text-xs text-slate-500">Assigned {new Date(cf.assigned_at).toLocaleDateString()}</p>
                    </div>
                    <Link to={`/admin/course-assignments/${cf.course_id}`} className="text-xs text-primary-600 hover:underline">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compensation History */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 dark:text-white">Compensation History</h2>
              <button onClick={() => setShowCompensationModal(true)} className="text-xs text-primary-600 hover:underline">
                Add Entry
              </button>
            </div>
            {compensationHistory.length === 0 ? (
              <p className="text-sm text-slate-400">No compensation records.</p>
            ) : (
              <div className="space-y-2">
                {compensationHistory.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div>
                      <span className="text-xs font-medium text-slate-900 dark:text-white capitalize">{c.change_type}</span>
                      <p className="text-xs text-slate-500">{new Date(c.effective_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      {c.amount && <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.amount)}
                      </p>}
                      {c.percentage && <p className="text-xs text-emerald-600">+{c.percentage}%</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Performance Reviews */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 dark:text-white">Performance Reviews</h2>
              <button onClick={() => setShowReviewModal(true)} className="text-xs text-primary-600 hover:underline">
                Add Review
              </button>
            </div>
            {performanceReviews.length === 0 ? (
              <p className="text-sm text-slate-400">No performance reviews.</p>
            ) : (
              <div className="space-y-3">
                {performanceReviews.map(r => (
                  <div key={r.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{r.review_period}</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className={`w-4 h-4 rounded-full ${i <= (r.rating || 0) ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{new Date(r.review_date).toLocaleDateString()}</p>
                    {r.strengths && <p className="text-xs text-slate-600 mt-2"><strong>Strengths:</strong> {r.strengths}</p>}
                    {r.improvements && <p className="text-xs text-slate-600 mt-1"><strong>Areas:</strong> {r.improvements}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Employment Info */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Employment Details</h2>
            {employment ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <Badge className={employment.employment_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                    {employment.employment_status}
                  </Badge>
                </div>
                {employment.employee_code && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Employee Code:</span>
                    <span className="text-slate-900 dark:text-white">{employment.employee_code}</span>
                  </div>
                )}
                {employment.joining_date && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Joining Date:</span>
                    <span className="text-slate-900 dark:text-white">{new Date(employment.joining_date).toLocaleDateString()}</span>
                  </div>
                )}
                {employment.base_salary && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base Salary:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(employment.base_salary)}
                    </span>
                  </div>
                )}
                {employment.manager_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reports To:</span>
                    <span className="text-slate-900 dark:text-white">{employment.manager?.full_name || 'N/A'}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No employment record.</p>
            )}
          </div>

          {/* Contact */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Contact</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-slate-400" />
                <a href={`mailto:${profile.email}`} className="text-primary-600 hover:underline">{profile.email}</a>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-slate-400" />
                  <a href={`tel:${profile.phone}`} className="text-primary-600 hover:underline">{profile.phone}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compensation Modal */}
      <Modal open={showCompensationModal} onClose={() => setShowCompensationModal(false)} title="Add Compensation Entry">
        <form onSubmit={e => { e.preventDefault(); handleAddCompensation({
          change_type: (e.target as any).change_type.value,
          amount: parseFloat((e.target as any).amount?.value) || undefined,
          percentage: parseFloat((e.target as any).percentage?.value) || undefined,
          effective_date: (e.target as any).effective_date.value,
          reason: (e.target as any).reason?.value || undefined,
        }); }}>
          <div className="space-y-4">
            <select name="change_type" className="input w-full" required>
              <option value="salary">Salary</option>
              <option value="incentive">Incentive</option>
              <option value="hike">Hike</option>
              <option value="bonus">Bonus</option>
              <option value="deduction">Deduction</option>
              <option value="benefit">Benefit</option>
            </select>
            <input type="number" name="amount" placeholder="Amount (INR)" className="input w-full" step="0.01" />
            <input type="number" name="percentage" placeholder="Percentage %" className="input w-full" step="0.01" />
            <input type="date" name="effective_date" className="input w-full" required />
            <textarea name="reason" placeholder="Reason / Notes" className="input w-full" rows={2} />
            <button type="submit" disabled={saving} className="btn-primary w-full">Save</button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal open={showReviewModal} onClose={() => setShowReviewModal(false)} title="Add Performance Review">
        <form onSubmit={e => { e.preventDefault(); handleAddReview({
          review_period: (e.target as any).review_period.value,
          rating: parseFloat((e.target as any).rating?.value) || undefined,
          strengths: (e.target as any).strengths?.value || undefined,
          improvements: (e.target as any).improvements?.value || undefined,
          goals: (e.target as any).goals?.value || undefined,
          review_date: (e.target as any).review_date.value,
        }); }}>
          <div className="space-y-4">
            <input name="review_period" placeholder="Review Period (e.g., Q1 2024)" className="input w-full" required />
            <input type="number" name="rating" placeholder="Rating (1-5)" min="0" max="5" step="0.5" className="input w-full" />
            <textarea name="strengths" placeholder="Strengths" className="input w-full" rows={2} />
            <textarea name="improvements" placeholder="Areas for Improvement" className="input w-full" rows={2} />
            <textarea name="goals" placeholder="Goals for Next Period" className="input w-full" rows={2} />
            <input type="date" name="review_date" className="input w-full" required />
            <button type="submit" disabled={saving} className="btn-primary w-full">Save</button>
          </div>
        </form>
      </Modal>

      {/* Edit Employment Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Employment Info">
        <form onSubmit={e => { e.preventDefault(); handleUpdateEmployment({
          employee_code: (e.target as any).employee_code?.value || undefined,
          employment_status: (e.target as any).employment_status?.value,
          joining_date: (e.target as any).joining_date?.value || undefined,
          department: (e.target as any).department?.value || undefined,
          designation: (e.target as any).designation?.value || undefined,
          base_salary: parseFloat((e.target as any).base_salary?.value) || undefined,
          notes: (e.target as any).notes?.value || undefined,
        }); }}>
          <div className="space-y-4">
            <input name="employee_code" placeholder="Employee Code" defaultValue={employment?.employee_code || ''} className="input w-full" />
            <select name="employment_status" defaultValue={employment?.employment_status || 'active'} className="input w-full">
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="on_leave">On Leave</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
            <input type="date" name="joining_date" defaultValue={employment?.joining_date || ''} className="input w-full" />
            <input name="department" placeholder="Department" defaultValue={employment?.department || ''} className="input w-full" />
            <input name="designation" placeholder="Designation" defaultValue={employment?.designation || ''} className="input w-full" />
            <input type="number" name="base_salary" placeholder="Base Salary (INR)" defaultValue={employment?.base_salary || ''} className="input w-full" step="0.01" />
            <textarea name="notes" placeholder="Notes" defaultValue={employment?.notes || ''} className="input w-full" rows={2} />
            <button type="submit" disabled={saving} className="btn-primary w-full">Save Changes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
