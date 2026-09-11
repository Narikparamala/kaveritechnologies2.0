import { Link } from 'react-router-dom';
import { BookOpen, Phone, Mail, ArrowRight } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY } from '../../lib/company';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Course Access & Enrolment</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
              Course fees and batch schedules are confirmed by our team based on the course you
              choose. Creating an account is free — and our team will guide you through course
              selection and enrolment.
            </p>
          </div>

          {/* How enrolment works */}
          <div className="grid sm:grid-cols-3 gap-6 mb-14">
            {[
              { step: '1', title: 'Browse published courses', desc: 'See the courses currently available on the platform and pick the one that matches your level and goal.' },
              { step: '2', title: 'Create your account', desc: 'Sign up with email or Google — no payment details needed to create an account.' },
              { step: '3', title: 'Start learning', desc: 'Open courses (marked free) let you enrol and start right away. For paid or batch-based courses, our team confirms fees and the schedule before access.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="card p-6">
                <div className="w-10 h-10 rounded-2xl bg-primary-600 text-white flex items-center justify-center font-bold mb-4">{step}</div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-14">
            <Link to="/courses" className="btn-primary inline-flex items-center gap-2">
              <BookOpen size={16} /> Browse Courses <ArrowRight size={16} />
            </Link>
            <Link to="/contact" className="btn-secondary inline-flex items-center gap-2">
              Ask About a Course
            </Link>
            <Link to="/register" className="btn-secondary inline-flex items-center gap-2">
              Create an Account
            </Link>
          </div>

          {/* Contact info */}
          <div className="card p-8 mb-14">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 text-center">Talk to Us About Fees & Batches</h2>
            <div className="flex flex-col sm:flex-row justify-center gap-6 text-center">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5"><Phone size={13} /> Phone</p>
                <a href={`tel:${COMPANY.phoneRaw}`} className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">{COMPANY.phoneDisplay}</a>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5"><Mail size={13} /> Email</p>
                <a href={`mailto:${COMPANY.email}`} className="text-primary-600 dark:text-primary-400 font-semibold hover:underline break-all">{COMPANY.email}</a>
              </div>
            </div>
          </div>

          {/* Corporate training */}
          <div className="card p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Corporate & Institutional Training</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              We offer custom batch training programs for companies and colleges. Contact us to discuss your requirements.
            </p>
            <Link to="/contact" className="btn-primary inline-flex">Contact for Corporate Training</Link>
          </div>

          <p className="text-center text-xs text-slate-400 mt-10">
            {COMPANY.brandName} is the learning platform of {COMPANY.legalName}.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
