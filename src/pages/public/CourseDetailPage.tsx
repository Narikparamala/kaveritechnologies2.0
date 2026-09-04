import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Award, CheckCircle, ArrowLeft, ChevronDown, ChevronUp, Hourglass, UserPlus, XCircle, LogIn } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { Badge } from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Course, Chapter, Lesson, CourseEnrollment, EnrollmentRequest } from '../../types/database';
import { COMPANY } from '../../lib/company';

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [chapters, setChapters] = useState<(Chapter & { lessons: Lesson[] })[]>([]);
  const [enrollment, setEnrollment] = useState<CourseEnrollment | null>(null);
  const [request, setRequest] = useState<EnrollmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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

      // Check enrollment + any enrollment request
      if (user) {
        const [{ data: enrData }, { data: reqData }] = await Promise.all([
          supabase.from('course_enrollments').select('*').eq('course_id', courseData.id).eq('student_id', user.id).maybeSingle(),
          supabase.from('enrollment_requests').select('*').eq('course_id', courseData.id).eq('student_id', user.id).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        setEnrollment(enrData as CourseEnrollment | null);
        setRequest(reqData as EnrollmentRequest | null);
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
      .insert({
        course_id: course!.id,
        student_id: user.id,
        access_status: 'active',
        enrollment_source: 'free_enrollment',
      });

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

  const handleRequestAccess = async () => {
    if (!user || !profile) { navigate('/login'); return; }
    if (profile.role !== 'student') { info('Request', 'Only student accounts can request course access.'); return; }
    if (enrollment) { navigate('/student/courses'); return; }
    if (request?.status === 'pending') { info('Request', 'You already have a pending request for this course.'); return; }

    setRequesting(true);
    const { data, error: err } = await supabase
      .from('enrollment_requests')
      .insert({ course_id: course!.id, student_id: user.id, status: 'pending' })
      .select()
      .single();
    setRequesting(false);

    if (err) {
      if (err.code === '23505') {
        info('Request pending', 'You already have a pending request for this course.');
        const { data: latest } = await supabase.from('enrollment_requests').select('*').eq('course_id', course!.id).eq('student_id', user.id).order('requested_at', { ascending: false }).limit(1).maybeSingle();
        if (latest) setRequest(latest as EnrollmentRequest);
      } else {
        toastError('Request failed', err.message);
      }
      return;
    }
    setRequest(data as EnrollmentRequest);
    success('Request sent!', 'Our team will review your request. You will get access once it is approved.');
  };

  const handleCancelRequest = async () => {
    if (!request) return;
    setCancelling(true);
    const { error } = await supabase.rpc('cancel_enrollment_request', { p_request_id: request.id });
    setCancelling(false);
    if (error) {
      toastError('Could not cancel request', error.message);
      return;
    }
    setRequest({ ...request, status: 'cancelled' });
    info('Request cancelled', 'You can request access again if you change your mind.');
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
                  {course.certificate_eligible && (
                    <span className="flex items-center gap-2 text-amber-300"><Award size={16} /> Certificate of completion</span>
                  )}
                </div>
              </div>

              {/* Enrol / admissions card */}
              <div className="card p-6 self-start">
                {(() => {
                  const hasActive = Boolean(enrollment && enrollment.access_status === 'active');
                  const isStudent = Boolean(user && profile?.role === 'student');
                  const mode = course.enrollment_mode ?? 'open';

                  if (hasActive) {
                    return (
                      <>
                        <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-4">
                          <CheckCircle size={16} /> You are enrolled in this course
                        </p>
                        <Link to={`/student/course/${course.id}`} className="block w-full py-3 rounded-xl font-semibold text-sm text-center bg-emerald-600 text-white hover:bg-emerald-700 transition-colors mb-4">
                          ✓ Go to Course
                        </Link>
                      </>
                    );
                  }

                  if (!user) {
                    return (
                      <>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          {mode === 'open'
                            ? 'This course has open enrolment. Create a free account (or sign in) and enrol to start learning right away.'
                            : mode === 'approval_required'
                            ? 'This course requires approval before you get access. Sign in to request course access.'
                            : 'Admissions for this course are currently closed. Contact Kaveri to ask about the next batch.'}
                        </p>
                        <Link to="/login" className="block w-full py-3 rounded-xl font-semibold text-sm text-center btn-primary mb-3">
                          <span className="inline-flex items-center gap-2"><LogIn size={15} /> Sign In</span>
                        </Link>
                        <Link to="/register" className="block w-full py-3 rounded-xl font-semibold text-sm text-center btn-secondary">Create an Account</Link>
                      </>
                    );
                  }

                  if (!isStudent) {
                    return (
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Only student accounts can enrol or request access to courses.
                      </p>
                    );
                  }

                  if (mode === 'open') {
                    return (
                      <>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          This course has open enrolment — enrol now and start learning right away.
                        </p>
                        <button
                          onClick={handleEnroll}
                          disabled={enrolling}
                          className="w-full py-3 rounded-xl font-semibold text-sm btn-primary mb-4"
                        >
                          {enrolling ? (
                            <span className="flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Enrolling...
                            </span>
                          ) : (
                            'Enrol Now'
                          )}
                        </button>
                      </>
                    );
                  }

                  if (mode === 'closed') {
                    return (
                      <>
                        <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium mb-3">
                          <XCircle size={16} className="text-slate-400" /> Admissions closed
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          New admissions for this course are currently closed. Contact Kaveri to ask about the next batch.
                        </p>
                        <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent(`Admissions enquiry — ${course.title}`)}`} className="block w-full py-3 rounded-xl font-semibold text-sm text-center btn-secondary">
                          Contact Kaveri
                        </a>
                      </>
                    );
                  }

                  // approval_required
                  if (request?.status === 'pending') {
                    return (
                      <>
                        <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium mb-3">
                          <Hourglass size={16} /> Request pending
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          Your request was sent on {new Date(request.requested_at).toLocaleDateString()}. Our team will review it — you will get course access as soon as it is approved.
                        </p>
                        <button
                          onClick={() => void handleCancelRequest()}
                          disabled={cancelling}
                          className="w-full py-3 rounded-xl font-semibold text-sm btn-secondary mb-1"
                        >
                          {cancelling ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      </>
                    );
                  }

                  if (request?.status === 'approved') {
                    return (
                      <>
                        <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-3">
                          <CheckCircle size={16} /> Request approved
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          Your request was approved. If your course access has not appeared yet, contact Kaveri.
                        </p>
                        <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent(`Enrolment help — ${course.title}`)}`} className="block w-full py-3 rounded-xl font-semibold text-sm text-center btn-secondary">
                          Contact Kaveri
                        </a>
                      </>
                    );
                  }

                  if (request?.status === 'rejected') {
                    return (
                      <>
                        <p className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-medium mb-3">
                          <XCircle size={16} /> Access request was not approved
                        </p>
                        {request.review_note && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            Note from Kaveri: “{request.review_note}”
                          </p>
                        )}
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          Contact Kaveri to discuss other options, or request access again.
                        </p>
                        <div className="flex flex-col gap-2">
                          <button onClick={() => void handleRequestAccess()} disabled={requesting} className="w-full py-3 rounded-xl font-semibold text-sm btn-primary">
                            {requesting ? 'Sending...' : 'Request Again'}
                          </button>
                          <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent(`Enrolment enquiry — ${course.title}`)}`} className="text-center text-sm text-primary-600 dark:text-primary-400 underline">
                            Contact Kaveri
                          </a>
                        </div>
                      </>
                    );
                  }

                  // no request yet (or cancelled) — offer to request
                  return (
                    <>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                        This course requires approval before you get access. Send a request and our team will review it.
                      </p>
                      <button
                        onClick={() => void handleRequestAccess()}
                        disabled={requesting}
                        className="w-full py-3 rounded-xl font-semibold text-sm btn-primary mb-4"
                      >
                        {requesting ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2"><UserPlus size={15} /> Request Course Access</span>
                        )}
                      </button>
                      {request?.status === 'cancelled' && (
                        <p className="text-xs text-slate-400 mb-2">Your earlier request was cancelled. You can request again.</p>
                      )}
                    </>
                  );
                })()}

                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {[
                    `${totalLessons} structured lessons in order`,
                    'Assignments, quizzes & coding practice',
                    'Live classes & recordings (when scheduled)',
                    'Faculty grading & feedback',
                    ...(course.certificate_eligible ? ['Certificate of completion'] : []),
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
                          <BookOpen size={13} className="text-slate-400 flex-shrink-0" />
                          <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">{lesson.title}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{lesson.duration_minutes}m</span>
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
