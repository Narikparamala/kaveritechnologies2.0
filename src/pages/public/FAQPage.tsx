import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY } from '../../lib/company';

const faqs = [
  { category: 'Getting Started', q: 'How do I create an account?', a: 'Click "Get Started" on the top of any page and sign up with your email address or your Google account. No payment details are required to create an account.' },
  { category: 'Getting Started', q: 'Do I need prior programming experience?', a: 'It depends on the course. Beginner courses start from the basics and assume no prior knowledge; other courses state their expected level so you can choose the right starting point.' },
  { category: 'Getting Started', q: 'What technology do I need?', a: 'Just a computer, tablet or phone with a modern browser and an internet connection. Coding practice runs in the browser — nothing to install.' },
  { category: 'Courses & Access', q: 'How do I get access to a course?', a: 'Browse the published courses, create an account and enrol. If you are not sure which course fits you, contact us and our team will guide you to the right course and batch.' },
  { category: 'Courses & Access', q: 'What does a course include?', a: 'Published courses can include recorded lessons, live classes with recordings, slides and resources, coding practice, quizzes and assignments. What is available depends on how each course is built by the faculty.' },
  { category: 'Courses & Access', q: 'Can I learn on mobile?', a: 'Yes. The platform is fully responsive and works in mobile, tablet and desktop browsers.' },
  { category: 'Courses & Access', q: 'How long do I have access?', a: 'Access is tied to your enrolment and batch. If you have a question about your specific course access period, contact us and we will confirm the details for your course.' },
  { category: 'Learning', q: 'How do live classes work?', a: 'Faculty schedule live classes with a date, time and join link. Enrolled students see upcoming and live sessions in their dashboard and can join during the class window. After the class ends, the recording and released materials appear on the same session.' },
  { category: 'Learning', q: 'What happens after I complete a lesson?', a: 'Completed lessons are marked done, you earn XP, and the next stage of your course journey becomes available. Your progress is tracked automatically.' },
  { category: 'Learning', q: 'Do I get a certificate?', a: 'Courses set up for certification issue a certificate of completion from Kaveri Technologies Academy when you finish the course requirements. Recognition of any certificate is at the discretion of employers or institutions.' },
  { category: 'Learning', q: 'What is the XP system?', a: 'You earn XP by completing lessons and passing quizzes. XP builds your level, which appears in progress tracking and the leaderboard.' },
  { category: 'Support', q: 'What if I need help?', a: `Contact us at ${COMPANY.email} or ${COMPANY.phoneDisplay}, or use the contact page. Enrolled learners can also reach faculty through their courses.` },
];

const categories = [...new Set(faqs.map(f => f.category))];

export default function FAQPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Frequently Asked Questions</h1>
            <p className="text-slate-500 dark:text-slate-400">Everything you need to know about {COMPANY.brandName}.</p>
          </div>

          {categories.map(cat => (
            <div key={cat} className="mb-10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-4">{cat}</h2>
              <div className="space-y-3">
                {faqs.filter(f => f.category === cat).map(({ q, a }, i) => {
                  const idx = faqs.findIndex(f => f.q === q);
                  return (
                    <div key={i} className="card overflow-hidden">
                      <button
                        className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 font-medium text-slate-900 dark:text-white"
                        onClick={() => setOpen(open === idx ? null : idx)}
                      >
                        {q}
                        {open === idx ? <ChevronUp size={16} className="text-primary-600 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
                      </button>
                      {open === idx && (
                        <div className="px-6 pb-4 text-sm text-slate-600 dark:text-slate-400 animate-fade-in">{a}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
