import { Target, MapPin, Mail, MonitorPlay, Code2, Users, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY } from '../../lib/company';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        {/* Hero */}
        <div className="bg-gradient-to-br from-slate-900 to-primary-900 py-20 mb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">About {COMPANY.brandName}</h1>
            <p className="text-xl text-white/70 leading-relaxed">
              An IT training and career-learning platform from {COMPANY.legalName},
              helping learners build practical technology skills and become industry ready.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Who we are */}
          <div className="grid lg:grid-cols-2 gap-16 mb-20 items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-6">Who We Are</h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                {COMPANY.legalName} is an IT training company based in Andhra Pradesh with offices in
                Tirupati and Madanapalle. Through {COMPANY.brandName}, we deliver technology training
                across programming, full stack development, testing, data and automation.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                Our approach combines structured learning journeys, live and recorded classes,
                hands-on coding practice, assignments and quizzes — so learners do not just watch
                content, they build real skills with real feedback.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/courses" className="btn-primary inline-flex items-center gap-2">Browse Courses</Link>
                <Link to="/contact" className="btn-secondary inline-flex items-center gap-2">Contact Us</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: MonitorPlay, label: 'Live & recorded learning' },
                { icon: Code2, label: 'Coding practice' },
                { icon: Users, label: 'Faculty guidance' },
                { icon: BookOpen, label: 'Quizzes & assignments' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="card p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                    <Icon size={22} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Mission */}
          <div className="grid lg:grid-cols-2 gap-8 mb-20">
            <div className="card p-8">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center mb-4">
                <Target size={22} className="text-teal-600 dark:text-teal-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Our Focus</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                Practical, career-oriented IT training. We keep the curriculum organised, the
                practice real, and the next step obvious — from first lesson to finished course.
              </p>
            </div>
            <div className="card p-8">
              <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                <Mail size={22} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Get in Touch</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
                Questions about courses, batches or enrolment? Write to us or call — our team will help you choose the right path.
              </p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href={`mailto:${COMPANY.email}`} className="text-primary-600 dark:text-primary-400 hover:underline break-all">{COMPANY.email}</a>
                </li>
                <li>
                  <a href={`tel:${COMPANY.phoneRaw}`} className="text-primary-600 dark:text-primary-400 hover:underline">{COMPANY.phoneDisplay}</a>
                </li>
              </ul>
            </div>
          </div>

          {/* Offices */}
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white text-center mb-12">Our Offices</h2>
            <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {COMPANY.offices.map(office => (
                <div key={office.name} className="card p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={18} className="text-primary-600 dark:text-primary-400" />
                    <h3 className="font-bold text-slate-900 dark:text-white">{office.name}</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {office.lines.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
