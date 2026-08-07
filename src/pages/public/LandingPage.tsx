import { Link } from 'react-router-dom';
import {
  BookOpen, Code, Award, Users, TrendingUp, CheckCircle, Play, Star,
  ArrowRight, Zap, Shield, Globe, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { useState } from 'react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { ProgressBar } from '../../components/ui/ProgressBar';

const stats = [
  { label: 'Students Enrolled', value: '12,500+' },
  { label: 'Courses', value: '25+' },
  { label: 'Hours of Content', value: '500+' },
  { label: 'Completion Rate', value: '87%' },
];

const features = [
  { icon: Code, title: 'Python Playground', desc: 'Write and run Python code directly in your browser with our Monaco-powered code editor.' },
  { icon: Award, title: 'Certificates', desc: 'Earn industry-recognized certificates upon course completion to boost your career.' },
  { icon: TrendingUp, title: 'Track Progress', desc: 'Detailed analytics and XP system to keep you motivated and on track.' },
  { icon: Users, title: 'Expert Faculty', desc: 'Learn from experienced Python developers and industry professionals.' },
  { icon: Zap, title: 'Project-Based', desc: 'Build real projects that go into your portfolio from day one.' },
  { icon: Globe, title: 'Learn Anywhere', desc: 'Fully responsive platform — learn on mobile, tablet, or desktop.' },
];

const roadmap = [
  { step: 1, title: 'Python Basics', topics: ['Variables', 'Data Types', 'Operators', 'Conditionals', 'Loops'], done: true },
  { step: 2, title: 'Core Python', topics: ['Functions', 'Lists', 'Dictionaries', 'OOP', 'File Handling'], done: false },
  { step: 3, title: 'Advanced Topics', topics: ['Decorators', 'Generators', 'Async', 'Testing', 'Packaging'], done: false },
  { step: 4, title: 'Real Projects', topics: ['Web APIs', 'Data Analysis', 'Automation', 'Flask/FastAPI', 'Deploy'], done: false },
];

const testimonials = [
  { name: 'Priya Sharma', role: 'Data Analyst @ TCS', text: 'Kaveri Academy transformed my career. The Python Fundamentals course was incredibly well-structured and the projects gave me real experience.', rating: 5 },
  { name: 'Arjun Nair', role: 'Backend Developer', text: 'Best Python learning platform I\'ve used. The code sandbox is amazing, and the faculty are super responsive and knowledgeable.', rating: 5 },
  { name: 'Meera Iyer', role: 'ML Engineer @ Infosys', text: 'The structured curriculum and certificate really helped me land my dream job. Highly recommend for anyone serious about Python.', rating: 5 },
];

const courses = [
  { title: 'Python Fundamentals', level: 'Beginner', lessons: 45, hours: 40, students: 1250, color: 'from-emerald-500 to-teal-500' },
  { title: 'Python Intermediate: OOP & Data', level: 'Intermediate', lessons: 62, hours: 60, students: 890, color: 'from-primary-500 to-primary-700' },
  { title: 'Python for Data Science & Web', level: 'Advanced', lessons: 78, hours: 80, students: 445, color: 'from-slate-700 to-slate-900' },
];

const faqs = [
  { q: 'Do I need any prior programming experience?', a: 'No! Our Python Fundamentals course starts from absolute zero. We assume no prior coding knowledge.' },
  { q: 'Are the certificates industry-recognized?', a: 'Our certificates are issued by Kaveri Technologies Academy and are recognized by numerous tech companies across India.' },
  { q: 'Can I access the courses on mobile?', a: 'Yes! Our platform is fully responsive and optimized for mobile, tablet, and desktop devices.' },
  { q: 'What is the Python Playground?', a: 'The Python Playground is a browser-based code editor where you can write and execute Python code without installing anything.' },
  { q: 'How long do I have access to the courses?', a: 'Once enrolled, you have lifetime access to course materials, including future updates.' },
];

const pricingPlans = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    features: ['2 free preview lessons', 'Python Playground access', 'Community forum', 'Basic progress tracking'],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '₹2,999',
    period: 'per course',
    features: ['Full course access', 'Certificate of completion', 'Assignment grading', 'Quiz system', 'Priority support', 'Project reviews'],
    cta: 'Enroll Now',
    highlighted: true,
  },
  {
    name: 'All Access',
    price: '₹9,999',
    period: 'per year',
    features: ['Access to all courses', 'All Pro features', 'Mentorship sessions', 'Job placement support', 'Resume review', 'Mock interviews'],
    cta: 'Get All Access',
    highlighted: false,
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
                Python · Data Science · Web Development
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
                Learn Python.<br />
                <span className="text-teal-400">Build Projects.</span><br />
                Become Industry Ready.
              </h1>
              <p className="text-lg text-white/70 mb-10 max-w-lg leading-relaxed">
                Join 12,500+ learners mastering Python with structured courses, hands-on projects, expert mentorship, and industry-recognized certificates.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-4 rounded-2xl hover:bg-primary-50 transition-all hover:shadow-xl hover:-translate-y-0.5 text-base">
                  Start Learning Free
                  <ArrowRight size={18} />
                </Link>
                <Link to="/courses" className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all text-base">
                  <Play size={18} />
                  Explore Courses
                </Link>
              </div>

              {/* Demo buttons */}
              <div className="mt-6">
                <p className="text-white/50 text-xs mb-3">Explore without signing up:</p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/demo/student" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-xs font-medium transition-all">
                    <Shield size={12} /> Student Demo
                  </Link>
                  <Link to="/demo/faculty" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-xs font-medium transition-all">
                    <Shield size={12} /> Faculty Demo
                  </Link>
                  <Link to="/demo/admin" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-xs font-medium transition-all">
                    <Shield size={12} /> Admin Demo
                  </Link>
                </div>
                <p className="text-white/30 text-xs mt-2">Demo mode is read-only. Create an account to save progress.</p>
              </div>
              <div className="flex flex-wrap gap-6 mt-10">
                {[
                  { icon: CheckCircle, label: 'No prior experience needed' },
                  { icon: CheckCircle, label: 'Lifetime course access' },
                  { icon: CheckCircle, label: 'Real projects & certificates' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-white/70 text-sm">
                    <Icon size={16} className="text-teal-400 flex-shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Mock dashboard preview */}
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
                      { label: 'Lessons', val: '24/45', color: 'bg-primary-500' },
                      { label: 'XP Points', val: '2,400', color: 'bg-teal-500' },
                      { label: 'Streak', val: '7 days', color: 'bg-amber-500' },
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
                    <p className="text-white font-semibold text-sm mb-3">Python Fundamentals</p>
                    <div className="w-full bg-white/20 rounded-full h-2 mb-1">
                      <div className="h-2 bg-teal-400 rounded-full" style={{ width: '53%' }} />
                    </div>
                    <p className="text-white/60 text-xs">53% complete</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-xs text-teal-400 font-mono mb-2">python_basics.py</p>
                    <pre className="text-white/80 text-xs font-mono">
{`def greet(name):
    return f"Hello, {name}!"

print(greet("Kaveri"))`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-extrabold text-primary-600 dark:text-primary-400">{value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">
              Everything You Need to Master Python
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              A complete learning ecosystem built for serious learners who want real results.
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

      {/* Featured Courses */}
      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">Featured Courses</h2>
              <p className="text-slate-500 dark:text-slate-400">Structured learning paths from beginner to advanced</p>
            </div>
            <Link to="/courses" className="hidden sm:flex items-center gap-2 text-primary-600 dark:text-primary-400 font-medium hover:gap-3 transition-all">
              View All <ArrowRight size={18} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(({ title, level, lessons, hours, students, color }) => (
              <div key={title} className="card-hover overflow-hidden">
                <div className={`h-40 bg-gradient-to-br ${color} flex items-end p-5`}>
                  <span className="text-xs font-medium text-white/80 bg-white/20 px-3 py-1 rounded-full">{level}</span>
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
                    <span className="flex items-center gap-1"><BookOpen size={13} /> {lessons} lessons</span>
                    <span>{hours}h</span>
                    <span className="flex items-center gap-1"><Users size={13} /> {students.toLocaleString()}</span>
                  </div>
                  <ProgressBar value={0} showLabel={false} size="sm" />
                  <Link to="/courses" className="block mt-4 text-center btn-primary text-sm py-2">
                    Enroll Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning Roadmap */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Your Python Learning Path</h2>
            <p className="text-slate-500 dark:text-slate-400">A clear, structured roadmap from beginner to professional</p>
          </div>
          <div className="space-y-6">
            {roadmap.map(({ step, title, topics, done }, i) => (
              <div key={step} className="flex gap-6 animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${done ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                    {step}
                  </div>
                  {i < roadmap.length - 1 && <div className="w-px flex-1 mt-3 bg-slate-200 dark:bg-slate-700" />}
                </div>
                <div className="card p-5 flex-1 mb-0">
                  <h3 className="font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
                  <div className="flex flex-wrap gap-2">
                    {topics.map(t => (
                      <span key={t} className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">What Our Students Say</h2>
            <p className="text-slate-500 dark:text-slate-400">Real stories from learners who transformed their careers</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map(({ name, role, text, rating }) => (
              <div key={name} className="card p-6">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} size={16} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-700 dark:text-primary-400">{name[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-slate-500 dark:text-slate-400">Start free. Upgrade when you're ready.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {pricingPlans.map(({ name, price, period, features, cta, highlighted }) => (
              <div
                key={name}
                className={`rounded-3xl p-8 border transition-all ${highlighted ? 'bg-primary-600 border-primary-500 shadow-glow-blue scale-105' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
              >
                <h3 className={`font-bold text-lg mb-1 ${highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{name}</h3>
                <div className="mb-5">
                  <span className={`text-3xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{price}</span>
                  <span className={`text-sm ml-1 ${highlighted ? 'text-white/70' : 'text-slate-400'}`}>/{period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {features.map(f => (
                    <li key={f} className={`flex items-center gap-2 text-sm ${highlighted ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'}`}>
                      <CheckCircle size={16} className={highlighted ? 'text-teal-300' : 'text-emerald-500'} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`block text-center py-3 rounded-2xl font-semibold text-sm transition-all ${highlighted ? 'bg-white text-primary-700 hover:bg-primary-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-slate-900">
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

      {/* CTA */}
      <section className="py-20 gradient-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Ready to Start Your Python Journey?
          </h2>
          <p className="text-white/70 mb-10 max-w-xl mx-auto">
            Join 12,500+ learners and start building your Python career today. Free to start.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-8 py-4 rounded-2xl hover:bg-primary-50 transition-all">
              Get Started Free <ArrowRight size={18} />
            </Link>
            <Link to="/courses" className="inline-flex items-center gap-2 border border-white/30 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all">
              Browse Courses
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <Link to="/demo/student" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-sm font-medium transition-all">
              <Eye size={14} /> Student Demo
            </Link>
            <Link to="/demo/faculty" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-sm font-medium transition-all">
              <Eye size={14} /> Faculty Demo
            </Link>
            <Link to="/demo/admin" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 hover:text-white text-sm font-medium transition-all">
              <Eye size={14} /> Admin Demo
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
