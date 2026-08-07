import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

const plans = [
  {
    name: 'Free', price: '₹0', period: 'forever',
    features: ['2 free preview lessons per course', 'Python Playground access', 'Community forum', 'Basic progress tracking'],
    cta: 'Get Started', highlighted: false,
  },
  {
    name: 'Pro', price: '₹2,999', period: 'per course',
    features: ['Full course access', 'Certificate of completion', 'Assignment grading', 'Full quiz system', 'Priority support', 'Project reviews', 'Downloadable resources'],
    cta: 'Enroll in a Course', highlighted: true,
  },
  {
    name: 'All Access', price: '₹9,999', period: 'per year',
    features: ['Access to ALL courses', 'All Pro features', '4 mentorship sessions/month', 'Job placement support', 'Resume & LinkedIn review', 'Mock interview sessions', 'Career roadmap'],
    cta: 'Get All Access', highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Simple, Transparent Pricing</h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Start learning for free. Upgrade anytime to unlock the full potential of your Python journey.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-16">
            {plans.map(({ name, price, period, features, cta, highlighted }) => (
              <div key={name} className={`rounded-3xl p-8 border transition-all ${highlighted ? 'bg-primary-600 border-primary-500 shadow-glow-blue scale-105' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                <h3 className={`font-bold text-xl mb-2 ${highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{name}</h3>
                <div className="mb-6">
                  <span className={`text-4xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{price}</span>
                  <span className={`text-sm ml-1.5 ${highlighted ? 'text-white/70' : 'text-slate-400'}`}>/{period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {features.map(f => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${highlighted ? 'text-white/90' : 'text-slate-600 dark:text-slate-400'}`}>
                      <CheckCircle size={16} className={`mt-0.5 flex-shrink-0 ${highlighted ? 'text-teal-300' : 'text-emerald-500'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={`block text-center py-3.5 rounded-2xl font-semibold text-sm transition-all ${highlighted ? 'bg-white text-primary-700 hover:bg-primary-50' : 'btn-primary'}`}>
                  {cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="card p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Need Corporate Training?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">We offer custom batch training programs for companies and colleges.</p>
            <Link to="/contact" className="btn-primary inline-flex">Contact for Enterprise Pricing</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
