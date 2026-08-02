import { Users, Target, Award, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

const team = [
  { name: 'Dr. Kavitha Murthy', role: 'Founder & Lead Instructor', bio: '15+ years in Python & Data Science. Former Principal Engineer at a leading tech company.' },
  { name: 'Rajesh Kumar', role: 'Senior Python Instructor', bio: '10 years teaching Python. Specializes in web development with Flask and FastAPI.' },
  { name: 'Preethi Sharma', role: 'Data Science Instructor', bio: 'Data Scientist with expertise in ML, Pandas, NumPy, and scikit-learn.' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        {/* Hero */}
        <div className="bg-gradient-to-br from-slate-900 to-primary-900 py-20 mb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">About Kaveri Technologies Academy</h1>
            <p className="text-xl text-white/70 leading-relaxed">
              We are on a mission to make high-quality Python education accessible to every aspiring developer in India.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mission */}
          <div className="grid lg:grid-cols-2 gap-16 mb-20 items-center">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-6">Our Mission</h2>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                Kaveri Technologies Academy was founded with a singular vision: to bridge the gap between learning Python and becoming industry-ready. We combine structured curriculum, real projects, and expert mentorship.
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
                Our courses are designed by practitioners who have worked in top tech companies and understand exactly what skills employers look for.
              </p>
              <Link to="/courses" className="btn-primary inline-flex">Start Learning Today</Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Users, label: 'Students', value: '12,500+', color: 'bg-primary-50 dark:bg-primary-900/30', iconColor: 'text-primary-600' },
                { icon: BookOpen, label: 'Courses', value: '25+', color: 'bg-teal-50 dark:bg-teal-900/30', iconColor: 'text-teal-600' },
                { icon: Award, label: 'Certificates', value: '8,200+', color: 'bg-amber-50 dark:bg-amber-900/30', iconColor: 'text-amber-600' },
                { icon: Target, label: 'Placement Rate', value: '87%', color: 'bg-emerald-50 dark:bg-emerald-900/30', iconColor: 'text-emerald-600' },
              ].map(({ icon: Icon, label, value, color, iconColor }) => (
                <div key={label} className="card p-6 text-center">
                  <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mx-auto mb-3`}>
                    <Icon size={24} className={iconColor} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Team */}
          <div className="mb-20">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white text-center mb-12">Meet Our Faculty</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {team.map(({ name, role, bio }) => (
                <div key={name} className="card p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl font-extrabold text-primary-700 dark:text-primary-400">{name[0]}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{name}</h3>
                  <p className="text-sm text-primary-600 dark:text-primary-400 mb-3">{role}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{bio}</p>
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
