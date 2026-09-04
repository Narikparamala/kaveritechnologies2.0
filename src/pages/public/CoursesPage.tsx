import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, BookOpen, Clock } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getDifficultyColor } from '../../lib/utils';
import type { Course } from '../../types/database';

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'from-emerald-500 to-teal-500',
  intermediate: 'from-primary-500 to-primary-700',
  advanced: 'from-slate-700 to-slate-900',
};

export default function CoursesPage() {
  const { user, profile } = useAuth();
  const { success, error: toastError, info } = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('all');

  useEffect(() => {
    const fetchCourses = async () => {
      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      setCourses((data ?? []) as Course[]);

      if (user) {
        const { data: enrData } = await supabase
          .from('course_enrollments')
          .select('course_id')
          .eq('student_id', user.id);
        setEnrolledIds(new Set((enrData ?? []).map((e: any) => e.course_id)));
      }
      setLoading(false);
    };
    fetchCourses();
  }, [user]);

  const handleEnroll = async (courseId: string) => {
    if (!user || !profile) { navigate('/login'); return; }
    if (profile.role !== 'student') {
      info('Enrollment', 'Only students can enroll in courses.');
      return;
    }
    if (enrolledIds.has(courseId)) {
      navigate('/student/courses');
      return;
    }
    setEnrollingId(courseId);
    const { error: err } = await supabase
      .from('course_enrollments')
      .insert({
        course_id: courseId,
        student_id: user.id,
        access_status: 'active',
        enrollment_source: 'free_enrollment',
      });

    if (err) {
      if (err.code === '23505') {
        setEnrolledIds(prev => new Set([...prev, courseId]));
        navigate('/student/courses');
      } else {
        toastError('Enrollment failed', err.message);
      }
    } else {
      setEnrolledIds(prev => new Set([...prev, courseId]));
      success('Enrolled!', 'Go to My Courses to start learning.');
      setTimeout(() => navigate('/student/courses'), 1200);
    }
    setEnrollingId(null);
  };

  const filtered = courses.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.short_description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchDiff = difficulty === 'all' || c.difficulty === difficulty;
    return matchSearch && matchDiff;
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Our Courses</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Published courses from Kaveri Technologies Academy — programming, full stack, testing, data and more.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-11" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} className="text-slate-400" />
              {['all', 'beginner', 'intermediate', 'advanced'].map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${difficulty === d ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  {d === 'all' ? 'All' : d}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={BookOpen} title="No courses found" description="Try adjusting your search or filters." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(course => {
                const isEnrolled = enrolledIds.has(course.id);
                const isEnrolling = enrollingId === course.id;
                return (
                  <div key={course.id} className="card-hover overflow-hidden group flex flex-col">
                    <Link to={`/courses/${course.slug}`}>
                      <div className={`h-44 bg-gradient-to-br ${DIFFICULTY_COLORS[course.difficulty]} flex items-end p-5 relative overflow-hidden`}>
                        <div className="absolute top-3 right-3">
                          <span className={`badge capitalize ${getDifficultyColor(course.difficulty)}`}>{course.difficulty}</span>
                        </div>
                        <BookOpen size={40} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20 group-hover:text-white/30 transition-colors" />
                      </div>
                    </Link>
                    <div className="p-5 flex flex-col flex-1">
                      <Link to={`/courses/${course.slug}`}>
                        <h3 className="font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-2">
                          {course.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-1 line-clamp-2">{course.short_description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                        <span className="flex items-center gap-1"><Clock size={12} /> {course.duration_hours}h</span>
                      </div>
                      <button
                        onClick={() => handleEnroll(course.id)}
                        disabled={isEnrolling}
                        className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all ${
                          isEnrolled
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200'
                            : 'btn-primary'
                        }`}
                      >
                        {isEnrolling ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enrolling...
                          </span>
                        ) : isEnrolled ? (
                          '✓ Go to Course'
                        ) : user ? (
                          'Enroll Now'
                        ) : (
                          'Sign Up to Enroll'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
