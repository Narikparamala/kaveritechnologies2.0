import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

const faqs = [
  { category: 'Getting Started', q: 'Do I need prior programming experience?', a: 'No! Our Python Fundamentals course starts from absolute zero. We assume no prior coding knowledge.' },
  { category: 'Getting Started', q: 'What technology do I need?', a: 'Just a computer with a modern browser. Our Python Playground works entirely in the browser — no installation needed.' },
  { category: 'Courses', q: 'Are the certificates industry-recognized?', a: 'Our certificates are issued by Kaveri Technologies Academy and recognized by numerous tech companies across India.' },
  { category: 'Courses', q: 'Can I access courses on mobile?', a: 'Yes! Our platform is fully responsive and optimized for mobile, tablet, and desktop.' },
  { category: 'Courses', q: 'How long do I have access?', a: 'Once enrolled, you have lifetime access to course materials, including all future updates.' },
  { category: 'Platform', q: 'What is the Python Playground?', a: 'A browser-based Monaco editor where you write Python code, see syntax highlighting, and save your snippets.' },
  { category: 'Platform', q: 'How does the XP system work?', a: 'You earn XP (experience points) by completing lessons, passing quizzes, and submitting assignments. XP determines your level and leaderboard rank.' },
  { category: 'Support', q: 'What if I need help?', a: 'You can reach our support team via the contact page. Enrolled students also get access to faculty office hours and the community forum.' },
  { category: 'Support', q: 'Is there a refund policy?', a: 'We offer a 7-day refund policy on Pro courses if you are not satisfied. Contact us within 7 days of purchase.' },
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
            <p className="text-slate-500 dark:text-slate-400">Everything you need to know about Kaveri Technologies Academy.</p>
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
