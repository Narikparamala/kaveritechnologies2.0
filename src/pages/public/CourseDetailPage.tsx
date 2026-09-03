import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Users, Award, CheckCircle, Play, ArrowLeft, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Course, Chapter, Lesson, CourseEnrollment } from '../../types/database';

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<(Chapter & { lessons: Lesson[] })[]>([]);
  const [enrollment, setEnrollment] = useState<CourseEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('slug', slug!)
        .eq('is_published', true)
        .maybeSingle();

      if (!courseData) { setLoading(false); return; }
      setCourse(courseData as Course);

      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('*')
        .eq('course_id', courseData.id)
        .eq('is_published', true)
        .order('order_index');

      const chaps = (chaptersData ?? []) as Chapter[];
      const chaptersWithLessons = await Promise.all(
        chaps.map(async ch => {
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('*')
            .eq('chapter_id', ch.id)
            .eq('is_published', true)
            .order('order_index');
          return { ...ch, lessons: (lessonsData ?? []) as Lesson[] };
        })
      );
      setChapters(chaptersWithLessons);
      if (chaps.length > 0) setOpenChapters(new Set([chaps[0].id]));

      // Check enrollment
      if (user) {
        const { data: enrData } = await supabase
          .from('course_enrollments')
          .select('*')
          .eq('course_id', courseData.id)
          .eq('student_id', user.id)
          .maybeSingle();
        setEnrollment(enrData as CourseEnrollment | null);
      }

      setLoading(false);
    };
    load();
  }, [slug, user]);

  const handleEnroll = async () => {
    if (!user || !profile) { navigate('/login'); return; }
    if (profile.role !== 'student') { info('Enrollment', 'Only student accounts can enroll in courses.'); return; }
    if (enrollment) { navigate('/student/courses'); return; }

    setEnrolling(true);
    const { error: err } = await supabase
      .from('course_enrollments')
      .insert({ course_id: course!.id, student_id: user.id });

    if (err) {
      if (err.code === '23505') {
        // Already enrolled — reload
        const { data } = await supabase.from('course_enrollments').select('*').eq('course_id', course!.id).eq('student_id', user.id).maybeSingle();
        setEnrollment(data as CourseEnrollment | null);
        navigate('/student/courses');
      } else {
        toastError('Enrollment failed', err.message);
      }
    } else {
      success('Enrolled successfully!', 'Opening your course...');
      const { data } = await supabase.from('course_enrollments').select('*').eq('course_id', course!.id).eq('student_id', user.id).maybeSingle();
      setEnrollment(data as CourseEnrollment | null);
      setTimeout(() => navigate('/student/courses'), 1000);
    }
    setEnrolling(false);
  };

  const toggleChapter = (chapterId: string) => {
    setOpenChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  if (loading) return <><PublicNav /><PageLoader /></>;

  if (!course) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900">
        <PublicNav />
        <div className="pt-24 text-center py-20">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Course Not Found</h2>
          <p className="text-slate-500 mb-6">This course doesn't exist or isn't published yet.</p>
          <Link to="/courses" className="btn-primary">Browse Courses</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const totalLessons = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0);
  const freeLessons = chapters.reduce((sum, ch) => sum + ch.lessons.filter(l => l.is_free_preview).length, 0);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-16">
        {/* Hero */}
        <div className="bg-gradient-to-br from-slate-900 to-primary-900 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link to="/courses" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition-colors">
              <ArrowLeft size={16} /> Back to Courses
            </Link>
            <div className="grid lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2">
                <Badge variant="info" className="mb-4 capitalize">{course.difficulty}</Badge>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">{course.title}</h1>
                <p className="text-white/70 text-lg mb-6 leading-relaxed">{course.short_description}</p>
                <div className="flex flex-wrap gap-6 text-white/70 text-sm">
                  <span className="flex items-center gap-2"><Clock size={16} /> {course.duration_hours}h</span>
                  <span className="flex items-center gap-2"><BookOpen size={16} /> {totalLessons} lessons</span>
                  <span className="flex items-center gap-2"><Users size={16} /> {course.enrollment_count.toLocaleString()} students</span>
                  {freeLessons > 0 && <span className="flex items-center gap-2 text-teal-300"><Play size={16} /> {freeLessons} free preview lessons</span>}
                  {course.certificate_eligible && (
                    <span className="flex items-center gap-2 text-amber-300"><Award size={16} /> Certificate included</span>
                  )}
                </div>
              </div>

              {/* Enroll card */}
              <div className="card p-6 self-start">
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">
                  {course.price === 0 ? 'Free' : `₹${course.price}`}
                </div>

                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all mb-4 ${
                    enrollment
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'btn-primary'
                  }`}
                >
                  {enrolling ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enrolling...
                    </span>
                  ) : enrollment ? (
                    '✓ Go to Course'
                  ) : user ? (
                    'Enroll Now — It\'s Free'
                  ) : (
                    'Sign Up to Enroll'
                  )}
                </button>

                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
                  {[
                    'Lifetime access to course content',
                    `${totalLessons} structured lessons`,
                    'Certificate of completion',
                    'Course assignments & quizzes',
                    'Faculty grading & feedback',
                  ].map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Course description */}
        {course.description && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">About This Course</h2>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{course.description}</p>
          </div>
        )}

        {/* Curriculum */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Course Curriculum</h2>
            <p className="text-sm text-slate-500">{chapters.length} chapters · {totalLessons} lessons</p>
          </div>
          {chapters.length === 0 ? (
            <div className="card p-8 text-center text-slate-400">
              <BookOpen size={32} className="mx-auto mb-3" />
              <p>Lessons are being prepared. Check back soon!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chapters.map(chapter => (
                <div key={chapter.id} className="card overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary-600 dark:text-primary-400">{chapter.order_index}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{chapter.title}</p>
                        <p className="text-xs text-slate-400">{chapter.lessons.length} lessons</p>
                      </div>
                    </div>
                    {openChapters.has(chapter.id)
                      ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
                      : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                    }
                  </button>

                  {openChapters.has(chapter.id) && (
                    <div className="border-t border-slate-100 dark:border-slate-700">
                      {chapter.lessons.map(lesson => (
                        <div key={lesson.id} className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            {lesson.is_free_preview
                              ? <Play size={11} className="text-primary-600" />
                              : <Lock size={11} className="text-slate-400" />
                            }
                          </div>
                          <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{lesson.title}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lesson.is_free_preview && (
                              <Badge variant="success" className="text-xs">Free Preview</Badge>
                            )}
                            <span className="text-xs text-slate-400">{lesson.duration_minutes}m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
