import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, GraduationCap, BookOpen, Award, AlertTriangle, CheckCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Profile, CourseEnrollment, Course, LessonProgress } from '../../types/database';

type StudentWithProgress = Profile & {
  enrollments?: (CourseEnrollment & { course: Course })[];
  progress?: LessonProgress[];
  completedLessons?: number;
  totalLessons?: number;
};

export default function FacultyStudentsPage() {
  const { profile: faculty } = useAuth();
  const [students, setStudents] = useState<StudentWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [assignedCourses, setAssignedCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (!faculty) return;
    loadData();
  }, [faculty]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get faculty's assigned courses
      const { data: courseFaculty } = await supabase
        .from('course_faculty')
        .select('course_id, course:courses(*)')
        .eq('faculty_id', faculty!.id);

      const courses = (courseFaculty ?? []).map(cf => cf.course as Course);
      setAssignedCourses(courses);
      const courseIds = courses.map(c => c.id);

      if (courseIds.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Get students enrolled in these courses
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('*, course:courses(*), student:profiles(*)')
        .in('course_id', courseIds);

      // Group by student
      const studentMap = new Map<string, StudentWithProgress>();
      for (const e of (enrollments ?? [])) {
        const student = e.student as Profile;
        if (!studentMap.has(student.id)) {
          studentMap.set(student.id, { ...student, enrollments: [], progress: [] });
        }
        const existing = studentMap.get(student.id)!;
        existing.enrollments = [...(existing.enrollments || []), e as any];
      }

      // Get lesson progress for these students
      const studentIds = Array.from(studentMap.keys());
      const { data: progressData } = await supabase
        .from('lesson_progress')
        .select('*')
        .in('student_id', studentIds)
        .in('course_id', courseIds);

      for (const p of (progressData ?? [])) {
        const student = studentMap.get(p.student_id);
        if (student) {
          student.progress = [...(student.progress || []), p];
        }
      }

      // Calculate stats
      for (const student of studentMap.values()) {
        student.completedLessons = student.progress?.filter(p => p.completed).length || 0;
        // This is an approximation - actual total would require counting lessons in enrolled courses
        student.totalLessons = student.progress?.length || 0;
      }

      setStudents(Array.from(studentMap.values()));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = !search ||
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchesCourse = courseFilter === 'all' ||
      s.enrollments?.some(e => e.course_id === courseFilter);
    return matchesSearch && matchesCourse;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="My Students"
        subtitle="Students enrolled in your assigned courses"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <GraduationCap className="text-blue-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{students.length}</p>
          <p className="text-xs text-slate-500">Total Students</p>
        </div>
        <div className="card p-4">
          <BookOpen className="text-purple-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{assignedCourses.length}</p>
          <p className="text-xs text-slate-500">Assigned Courses</p>
        </div>
        <div className="card p-4">
          <Award className="text-amber-500 mb-2" size={20} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {students.filter(s => s.completedLessons && s.completedLessons > 0).length}
          </p>
          <p className="text-xs text-slate-500">Active Learners</p>
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
          {assignedCourses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
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
          title={assignedCourses.length === 0 ? 'No courses assigned' : 'No students found'}
          description={assignedCourses.length === 0 ? 'You need to be assigned to courses first.' : 'No students match your search.'}
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
                      {student.enrollments?.filter(e => assignedCourses.some(c => c.id === e.course_id)).length || 0} of your courses
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle size={12} />
                      {student.completedLessons || 0} lessons completed
                    </span>
                    <span className="flex items-center gap-1">
                      <Award size={12} />
                      {student.xp_points || 0} XP
                    </span>
                  </div>
                  {student.enrollments && student.enrollments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {student.enrollments
                        .filter(e => assignedCourses.some(c => c.id === e.course_id))
                        .slice(0, 3)
                        .map(e => (
                          <span key={e.id} className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                            {e.course?.title}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <Link
                    to={`/faculty/students/${student.id}`}
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
    </div>
  );
}
