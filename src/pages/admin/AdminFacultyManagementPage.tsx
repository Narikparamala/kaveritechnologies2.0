import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, UserPlus, MoreVertical, Mail, BookOpen, Users, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  getAllFacultyEmployment, createFacultyEmployment, updateFacultyEmployment,
  getFacultyStats, assignFacultyToCourse, removeFacultyFromCourse,
  promoteUserToFaculty, addCompensationRecord, addPerformanceReview
} from '../../services/companyManagement';
import type { Profile, Course, FacultyEmployment, CourseFaculty } from '../../types/database';

type FacultyWithDetails = Profile & {
  employment?: FacultyEmployment;
  courses?: (CourseFaculty & { course: Course })[];
  stats?: {
    studentCount: number;
    pendingSubmissions: number;
    upcomingSessions: number;
  };
};

const EMPLOYMENT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  probation: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  on_leave: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  inactive: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  terminated: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

export default function AdminFacultyManagementPage() {
  const { profile: admin } = useAuth();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<FacultyWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyWithDetails | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [nonFacultyUsers, setNonFacultyUsers] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employmentData, coursesData, facultyProfiles] = await Promise.all([
        getAllFacultyEmployment(),
        supabase.from('courses').select('*').eq('is_published', true).order('title'),
        supabase.from('profiles').select('*').eq('role', 'faculty').order('full_name'),
      ]);

      setAllCourses((coursesData.data ?? []) as Course[]);

      const facultyWithDetails: FacultyWithDetails[] = await Promise.all(
        (facultyProfiles.data ?? []).map(async (f) => {
          const employment = employmentData.find(e => e.faculty_id === f.id);
          const { data: courseFaculty } = await supabase
            .from('course_faculty')
            .select('*, course:courses(*)')
            .eq('faculty_id', f.id);
          const stats = await getFacultyStats(f.id);
          return { ...f, employment, courses: (courseFaculty ?? []) as any, stats };
        })
      );

      setFaculty(facultyWithDetails);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load faculty:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadNonFacultyUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['student'])
      .eq('is_active', true)
      .order('full_name')
      .limit(50);
    setNonFacultyUsers((data ?? []) as Profile[]);
  };

  const handlePromote = async (userId: string) => {
    setSaving(true);
    try {
      await promoteUserToFaculty(userId);
      setShowPromoteModal(false);
      loadData();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to promote:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignCourse = async (courseId: string) => {
    if (!selectedFaculty) return;
    setSaving(true);
    try {
      await assignFacultyToCourse(courseId, selectedFaculty.id);
      setShowCourseModal(false);
      loadData();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to assign course:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCourse = async (courseId: string) => {
    if (!selectedFaculty) return;
    try {
      await removeFacultyFromCourse(courseId, selectedFaculty.id);
      loadData();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to remove course:', err);
    }
  };

  const handleUpdateStatus = async (facultyId: string, status: string) => {
    try {
      await updateFacultyEmployment(facultyId, { employment_status: status as any });
      loadData();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update status:', err);
    }
  };

  const filteredFaculty = faculty.filter(f => {
    const matchesSearch = !search ||
      f.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      f.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      f.employment?.employment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Faculty Management"
        subtitle="Manage faculty employment, courses, and performance"
      />

      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input w-full sm:w-40"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="on_leave">On Leave</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={() => { loadNonFacultyUsers(); setShowPromoteModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={16} /> Add Faculty
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredFaculty.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No faculty found"
          description={search ? 'Try adjusting your search.' : 'Add your first faculty member.'}
        />
      ) : (
        <div className="space-y-4">
          {filteredFaculty.map(f => (
            <div key={f.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 dark:text-primary-400 font-bold text-lg">
                    {(f.full_name || f.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{f.full_name || 'Unnamed'}</h3>
                    <Badge className={EMPLOYMENT_STATUS_COLORS[f.employment?.employment_status || 'inactive']}>
                      {f.employment?.employment_status || 'No Record'}
                    </Badge>
                    {f.employment?.designation && (
                      <span className="text-xs text-slate-500">{f.employment.designation}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 truncate">{f.email}</p>

                  <div className="flex items-center gap-6 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <BookOpen size={12} />
                      {f.courses?.length || 0} courses
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {f.stats?.studentCount || 0} students
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertCircle size={12} />
                      {f.stats?.pendingSubmissions || 0} pending
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {f.stats?.upcomingSessions || 0} sessions
                    </span>
                  </div>

                  {f.courses && f.courses.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {f.courses.slice(0, 3).map(cf => (
                        <span key={cf.id} className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                          {cf.course?.title}
                        </span>
                      ))}
                      {f.courses.length > 3 && (
                        <span className="text-xs text-slate-400">+{f.courses.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/admin/faculty-management/${f.id}`)}
                    className="btn-ghost text-xs"
                  >
                    View
                  </button>
                  <button
                    onClick={() => { setSelectedFaculty(f); setShowCourseModal(true); }}
                    className="btn-secondary text-xs"
                  >
                    Assign Course
                  </button>
                  <select
                    value={f.employment?.employment_status || ''}
                    onChange={e => handleUpdateStatus(f.id, e.target.value)}
                    className="input text-xs py-1 px-2"
                  >
                    <option value="active">Active</option>
                    <option value="probation">Probation</option>
                    <option value="on_leave">On Leave</option>
                    <option value="inactive">Inactive</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promote Modal */}
      <Modal open={showPromoteModal} onClose={() => setShowPromoteModal(false)} title="Add Faculty Member">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select an existing user to promote to faculty role.
          </p>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {nonFacultyUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <div>
                  <p className="font-medium text-sm text-slate-900 dark:text-white">{u.full_name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <button
                  onClick={() => handlePromote(u.id)}
                  disabled={saving}
                  className="btn-primary text-xs py-1"
                >
                  Promote
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Course Assignment Modal */}
      <Modal open={showCourseModal} onClose={() => setShowCourseModal(false)} title="Assign Course">
        {selectedFaculty && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Managing courses for <strong>{selectedFaculty.full_name}</strong>
            </p>

            {/* Currently assigned */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Currently Assigned</h4>
              <div className="space-y-1">
                {selectedFaculty.courses?.map(cf => (
                  <div key={cf.id} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <span className="text-sm text-slate-900 dark:text-white">{cf.course?.title}</span>
                    <button
                      onClick={() => handleRemoveCourse(cf.course_id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {(!selectedFaculty.courses || selectedFaculty.courses.length === 0) && (
                  <p className="text-xs text-slate-400">No courses assigned</p>
                )}
              </div>
            </div>

            {/* Add new */}
            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Assign New Course</h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {allCourses
                  .filter(c => !selectedFaculty.courses?.some(cf => cf.course_id === c.id))
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleAssignCourse(c.id)}
                      className="w-full text-left p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-sm"
                    >
                      {c.title}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
