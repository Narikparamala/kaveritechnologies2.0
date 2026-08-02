import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Play, CheckCircle, Clock, Search } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getDifficultyColor } from '../../lib/utils';
import type { Course, CourseEnrollment } from '../../types/database';

type EnrolledCourse = CourseEnrollment & { course: Course };

export default function MyCoursesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('course_enrollments')
      .select('*, course:courses(*)')
      .eq('student_id', profile.id)
      .order('enrolled_at', { ascending: false })
      .then(({ data }) => {
        setEnrollments((data ?? []) as any);
        setLoading(false);
      });
  }, [profile]);

  const filtered = enrollments.filter(e =>
    (e.course?.title ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleContinue = (courseId: string) => {
    navigate(`/student/course/${courseId}`);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="My Courses"
        subtitle={`${enrollments.length} course${enrollments.length !== 1 ? 's' : ''} enrolled`}
        icon={BookOpen}
        action={<Link to="/courses" className="btn-primary text-sm">Browse More Courses</Link>}
      />

      {enrollments.length > 0 && (
        <div className="relative mb-6">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-11"
            placeholder="Search enrolled courses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 && search ? (
        <EmptyState icon={Search} title="No courses match your search" />
      ) : enrollments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses enrolled"
          description="Browse our Python course catalog and start your learning journey today."
          action={<Link to="/courses" className="btn-primary">Browse Courses</Link>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(({ id, course, progress_percentage, enrolled_at, completed_at }) => {
            const pct = Math.round(progress_percentage ?? 0);
            return (
              <div key={id} className="card-hover overflow-hidden flex flex-col">
                <div className="h-36 bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center relative">
                  <BookOpen size={40} className="text-white/20" />
                  <div className="absolute top-3 right-3">
                    <Badge className={`capitalize text-xs ${getDifficultyColor(course.difficulty)}`}>
                      {course.difficulty}
                    </Badge>
                  </div>
                  {completed_at && (
                    <div className="absolute top-3 left-3">
                      <Badge variant="success" className="text-xs flex items-center gap-1">
                        <CheckCircle size={10} /> Completed
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-bold text-slate-900 dark:text-white mb-2 line-clamp-2">{course.title}</h3>
                  <p className="text-xs text-slate-400 mb-4 flex items-center gap-2">
                    <Clock size={11} /> {course.duration_hours}h
                    <span>· Enrolled {new Date(enrolled_at).toLocaleDateString('en-IN')}</span>
                  </p>
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>Progress</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <ProgressBar value={pct} size="sm" />
                  </div>
                  <div className="mt-auto">
                    <button
                      onClick={() => handleContinue(course.id)}
                      className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
                    >
                      <Play size={14} />
                      {pct === 0 ? 'Start Course' : pct === 100 ? 'Review Course' : 'Continue'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
