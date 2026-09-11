import { Link } from 'react-router-dom';
import {
  BookOpen, Code, Award, CheckCircle, ArrowRight,
  Zap, Video, ClipboardList, TrendingUp, ChevronDown, ChevronUp, Map, Presentation
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { supabase } from '../../lib/supabase';
import type { Course } from '../../types/database';

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'from-emerald-500 to-teal-500',
  intermediate: 'from-primary-500 to-primary-700',
  advanced: 'from-slate-700 to-slate-900',
};

const features = [
  { icon: Map, title: 'Structured Journeys', desc: 'Courses organised into chapters and ordered lessons, with clear progress and an obvious next step — no guesswork about what to do next.' },
  { icon: Video, title: 'Live & Recorded Classes', desc: 'Scheduled live classes with recordings and materials released after class, all attached to the course you are learning.' },
  { icon: Presentation, title: 'Slides & Study Resources', desc: 'Lesson slides, notes and downloadable resources that stay with each lesson for revision at your own pace.' },
  { icon: Code, title: 'Hands-on Coding Practice', desc: 'Write and run real code in the browser with automated verification and instant feedback on your work.' },
  { icon: ClipboardList, title: 'Assignments & Quizzes', desc: 'Practice questions, quizzes and faculty-graded assignments that test understanding — not just watching.' },
  { icon: TrendingUp, title: 'Progress Tracking', desc: 'Completion states, XP and level tracking show exactly what you have finished and what comes next in your journey.' },
];

const learningAreas = [
  'Programming',
  'Full Stack Development',
  'Testing & QA',
  'Data & AI',
  'Automation',
  'Career-focused IT skills',
];

const steps = [
  { title: 'Enrol in a course', desc: 'Choose a published course that matches your current level and goal.' },
  { title: 'Follow your journey', desc: 'Work through lessons in order — each completed stage unlocks the next.' },
  { title: 'Learn actively', desc: 'Attend live classes, watch recordings, study slides, and practise with code, quizzes and assignments.' },
  { title: 'Get feedback & grow', desc: 'Faculty review your work. Track your progress and complete the course at your own pace.' },
];

const faqs = [
  { q: 'Do I need prior programming experience?', a: 'It depends on the course. Beginner courses assume no prior knowledge and start from the basics; other courses list their expected level so you can choose the right starting point.' },
  { q: 'What does a course include?', a: 'Published courses can include recorded lessons, live classes with recordings, slides and resources, coding practice, quizzes and assignments — everything you need is inside the course.' },
  { q: 'How do live classes work?', a: 'Faculty schedule live classes with a date and time and a join link. Enrolled students see upcoming and live sessions in the student dashboard. When a class ends, the recording and materials are released through the same session.' },
  { q: 'Can I learn from a mobile phone or tablet?', a: 'Yes. The platform is fully responsive, so lessons, videos and resources work on mobile, tablet and desktop browsers.' },
  { q: 'Do I get a certificate?', a: 'Courses that are set up for certification issue a certificate of completion from Kaveri Technologies Academy when you finish the course requirements. Recognition of any certificate is at the discretion of employers or institutions.' },
  { q: 'How does the XP and level system work?', a: 'You earn XP by completing lessons and passing quizzes. XP builds your level and shows up in progress tracking and the leaderboard.' },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [featured, setFeatured] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(3);
      if (active) {
        setFeatured((data ?? []) as Course[]);
        setCoursesLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-navy-900 via-primary-900 to-teal-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-primary-400 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-teal-400 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-600 blur-3xl opacity-20" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 text-sm mb-8">
                <Zap size={14} className="text-teal-400" />
                IT Training · Programming · Full Stack · Testing · Data & AI
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Learn Technology.<br />
                <span className="text-teal-400">Build Real Projects.</span><br />
                Become Industry Ready.
              </h1>
              <p className="text-lg text-white/70 mb-10 max-w-lg leading-relaxed">
                Kaveri Technologies Academy is an IT training and career-learning platform from
                Kaveri Technologies Private Limited — structured courses, live and recorded classes,
                coding practice, assignments and quizzes to take you from learning to working.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/courses" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-4 rounded-2xl hover:bg-primary-50 transition-all hover:shadow-xl hover:-translate-y-0.5 text-base">
                  Browse Courses
                  <ArrowRight size={18} />
                </Link>
                <Link to="/contact" className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all text-base">
                  Talk to Us
                </Link>
              </div>
              <div className="flex flex-wrap gap-6 mt-10">
                {[
                  { icon: CheckCircle, label: 'Structured learning journeys' },
                  { icon: CheckCircle, label: 'Live & recorded classes' },
                  { icon: CheckCircle, label: 'Coding practice with feedback' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-white/70 text-sm">
                    <Icon size={16} className="text-teal-400 flex-shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Platform preview mock */}
            <div className="hidden lg:block animate-fade-in stagger-2">
              <div className="relative">
                <div className="bg-white/10 backdrop-blur-sm rounded-3xl border border-white/20 p-6 space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex-1 h-6 bg-white/20 rounded-lg" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Lessons done', val: '12', color: 'bg-primary-500' },
                      { label: 'XP Points', val: '640', color: 'bg-teal-500' },
                      { label: 'Level', val: '3', color: 'bg-amber-500' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-white/10 rounded-2xl p-3">
                        <div className={`w-8 h-8 ${color} rounded-lg mb-2`} />
                        <p className="text-white/60 text-xs">{label}</p>
                        <p className="text-white font-bold text-sm">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/10 rounded-2xl p-4">
                    <p className="text-white/60 text-xs mb-2">Course Progress</p>
                    <p className="text-white font-semibold text-sm mb-3">Your current course</p>
                    <div className="w-full bg-white/20 rounded-full h-2 mb-1">
                      <div className="h-2 bg-teal-400 rounded-full" style={{ width: '40%' }} />
                    </div>
                    <p className="text-white/60 text-xs">40% complete</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-xs text-teal-400 font-mono mb-2">next_lesson.py</p>
                    <pre className="text-white/80 text-xs font-mono">
{`def next_step(journey):
    return journey.next_available_lesson()

print(next_step(my_course))`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Learning areas strip */}
      <section className="py-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 text-center mb-4">
            One platform for your IT career — across technologies
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {learningAreas.map(area => (
              <Link
                key={area}
                to="/courses"
                className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {area}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
              A Complete IT Learning Platform
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              Everything you need to learn a technology properly — content, live classes, practice and feedback in one place.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className={`card-hover p-6 animate-slide-up stagger-${Math.min(i + 1, 5)}`}
              >
                <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                  <Icon size={22} className="text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured courses (real published courses from the platform) */}
      {!coursesLoading && featured.length > 0 && (
        <section className="py-20 bg-white dark:bg-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">Our Courses</h2>
                <p className="text-slate-500 dark:text-slate-400">Currently published on the platform</p>
              </div>
              <Link to="/courses" className="hidden sm:flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium hover:gap-3 transition-all">
                View All <ArrowRight size={18} />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map(course => (
                <Link key={course.id} to={`/courses/${course.slug}`} className="card-hover overflow-hidden group flex flex-col">
                  <div className={`h-40 bg-gradient-to-br ${DIFFICULTY_COLORS[course.difficulty]} flex items-end p-5`}>
                    <span className="text-xs font-medium text-white/80 bg-white/20 px-3 py-1 rounded-full capitalize">{course.difficulty}</span>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{course.title}</h3>
                    {course.short_description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 flex-1 line-clamp-2 mb-4">{course.short_description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
                      <span className="flex items-center gap-1"><BookOpen size={13} /> Course</span>
                      {course.duration_hours ? <span>{course.duration_hours}h</span> : null}
                    </div>
                    <span className="block mt-auto text-center btn-primary text-sm py-2.5">
                      View Course
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How learning works */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">How Learning Works Here</h2>
            <p className="text-slate-500 dark:text-slate-400">A clear path from enrolment to completion</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map(({ title, desc }, i) => (
              <div key={title} className="card p-6">
                <div className="w-10 h-10 rounded-2xl bg-primary-600 text-white flex items-center justify-center font-bold text-sm mb-4">
                  {i + 1}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Admissions / contact CTA */}
      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-5">
              <Award size={26} className="text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Admissions & Course Access</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed mb-8">
              Open courses let you enrol and start right away with your account. For paid or
              batch-based courses, our team confirms fees and batch schedules first. Create an
              account to browse courses, or contact us directly — we will guide you to the right
              course and batch.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/courses" className="btn-primary inline-flex items-center gap-2">
                Browse Courses <ArrowRight size={16} />
              </Link>
              <Link to="/register" className="btn-secondary inline-flex items-center gap-2">
                Create an Account
              </Link>
              <Link to="/contact" className="btn-secondary inline-flex items-center gap-2">
                Contact Kaveri
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map(({ q, a }, i) => (
              <div key={i} className="card overflow-hidden">
                <button
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-medium text-slate-900 dark:text-white"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {q}
                  {openFaq === i ? <ChevronUp size={18} className="flex-shrink-0 text-primary-600" /> : <ChevronDown size={18} className="flex-shrink-0 text-slate-400" />}
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-slate-600 dark:text-slate-400 animate-fade-in">
                    {a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 gradient-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Ready to Start Your IT Career?
          </h2>
          <p className="text-white/70 mb-10 max-w-xl mx-auto">
            Create your account, explore our published courses, and talk to our team about the right path for you.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-4 rounded-2xl hover:bg-primary-50 transition-all">
              Create Your Account <ArrowRight size={18} />
            </Link>
            <Link to="/courses" className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all">
              Browse Courses
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
