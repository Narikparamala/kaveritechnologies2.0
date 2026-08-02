import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, GraduationCap, BookOpen, CheckCircle, Clock, AlertTriangle, Mail, Award } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { getAllStudents, getStudentSupportRecords, createSupportRecord } from '../../services/companyManagement';
import type { Profile, CourseEnrollment, Course, StudentSupportRecord } from '../../types/database';

type StudentWithDetails = Profile & {
  enrollments?: (CourseEnrollment & { course: Course })[];
  supportRecords?: StudentSupportRecord[];
  progressStats?: {
    completedLessons: number;
    totalLessons: number;
    averageProgress: number;
  };
};

export default function AdminStudentManagementPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithDetails | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsData, coursesData] = await Promise.all([
        getAllStudents(),
        supabase.from('courses').select('*').eq('is_published', true).order('title'),
      ]);

      setAllCourses((coursesData.data ?? []) as Course[]);
      setStudents(studentsData as StudentWithDetails[]);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSupportModal = async (student: StudentWithDetails) => {
    setSelectedStudent(student);
    try {
      const records = await getStudentSupportRecords(student.id);
      setSelectedStudent({ ...student, supportRecords: records });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load support records:', err);
    }
    setShowSupportModal(true);
  };

  const handleCreateSupportRecord = async (input: {
    category: string;
    priority: string;
    notes: string;
  }) => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const record = await createSupportRecord({
        student_id: selectedStudent.id,
        category: input.category as any,
        priority: input.priority as any,
        notes: input.notes,
      });
      setSelectedStudent({
        ...selectedStudent,
        supportRecords: [record, ...(selectedStudent.supportRecords || [])],
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to create support record:', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = !search ||
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchesCourse = courseFilter === 'all' ||
      s.enrollments?.some(e => e.course_id === courseFilter);
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && s.is_active) ||
      (statusFilter === 'inactive' && !s.is_active);
    return matchesSearch && matchesCourse && matchesStatus;
  });

  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.is_active).length;
  const xpLeader = students.sort((a, b) => (b.xp_points || 0) - (a.xp_points || 0))[0];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Student Management"
        subtitle="View and manage all enrolled students"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <GraduationCap className="text-blue-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalStudents}</p>
          <p className="text-xs text-slate-500">Total Students</p>
        </div>
        <div className="card p-4">
          <CheckCircle className="text-emerald-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeStudents}</p>
          <p className="text-xs text-slate-500">Active</p>
        </div>
        <div className="card p-4">
          <Award className="text-amber-500 mb-2" size={20} />
          <p className="text-lg font-bold text-slate-900 dark:text-white">{xpLeader?.full_name?.split(' ')[0] || '-'}</p>
          <p className="text-xs text-slate-500">Top Learner ({xpLeader?.xp_points || 0} XP)</p>
        </div>
        <div className="card p-4">
          <BookOpen className="text-purple-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{allCourses.length}</p>
          <p className="text-xs text-slate-500">Available Courses</p>
        </div>
      </div>

      {/* Filters */}
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
          value={courseFilter}
          onChange={e => setCourseFilter(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="all">All Courses</option>
          {allCourses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input w-full sm:w-32"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
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
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students found"
          description={search ? 'Try adjusting your search filters.' : 'No students enrolled yet.'}
        />
      ) : (
        <div className="space-y-3">
          {filteredStudents.map(student => (
            <div key={student.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 dark:text-primary-400 font-bold text-lg">
                    {(student.full_name || student.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{student.full_name || 'Unnamed'}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${student.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                      {student.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate">{student.email}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <BookOpen size={12} />
                      {student.enrollments?.length || 0} courses
                    </span>
                    <span className="flex items-center gap-1">
                      <Award size={12} />
                      {student.xp_points || 0} XP
                    </span>
                    <span className="flex items-center gap-1">
                      Level {student.level || 1}
                    </span>
                    <span className="flex items-center gap-1">
                      {student.streak_days || 0} day streak
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleOpenSupportModal(student)}
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    <AlertTriangle size={12} /> Support
                  </button>
                  <Link
                    to={`/admin/student-management/${student.id}`}
                    className="btn-primary text-xs"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Support Modal */}
      <Modal open={showSupportModal} onClose={() => setShowSupportModal(false)} title="Student Support Records" size="lg">
        {selectedStudent && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="font-medium text-slate-900 dark:text-white">{selectedStudent.full_name}</p>
              <p className="text-xs text-slate-500">{selectedStudent.email}</p>
            </div>

            {/* Add new record */}
            <form onSubmit={e => { e.preventDefault(); handleCreateSupportRecord({
              category: (e.target as any).category.value,
              priority: (e.target as any).priority.value,
              notes: (e.target as any).notes.value,
            }); (e.target as any).reset(); }}>
              <div className="grid grid-cols-2 gap-2">
                <select name="category" className="input" required>
                  <option value="academic">Academic</option>
                  <option value="attendance">Attendance</option>
                  <option value="behavior">Behavior</option>
                  <option value="payment">Payment</option>
                  <option value="general">General</option>
                </select>
                <select name="priority" className="input" required>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <textarea name="notes" placeholder="Add support note..." className="input mt-2 w-full" rows={2} required />
              <button type="submit" disabled={saving} className="btn-primary text-sm mt-2 w-full">Add Record</button>
            </form>

            {/* Existing records */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">History</h4>
              {!selectedStudent.supportRecords || selectedStudent.supportRecords.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No support records</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedStudent.supportRecords.map(record => (
                    <div key={record.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700 dark:text-slate-300 capitalize">{record.category}</span>
                        <span className={`px-1.5 py-0.5 rounded ${record.status === 'open' ? 'bg-amber-100 text-amber-700' : record.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {record.status}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{record.notes}</p>
                      <p className="text-slate-400 mt-1">{new Date(record.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
