import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Github, Twitter, Linkedin, Youtube } from 'lucide-react';
import { Logo } from '../ui/Logo';

export function Footer() {
  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Logo size="sm" className="mb-4 [&_span]:text-white [&_.text-primary-600]:text-primary-400" />
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Learn Python. Build Projects. Become Industry Ready. Join thousands of learners transforming their careers.
            </p>
            <div className="flex gap-3">
              {[
                { icon: Github, label: 'GitHub' },
                { icon: Twitter, label: 'Twitter' },
                { icon: Linkedin, label: 'LinkedIn' },
                { icon: Youtube, label: 'YouTube' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-primary-600 flex items-center justify-center transition-colors"
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">Platform</h3>
            <ul className="space-y-3">
              {[
                { label: 'Courses', to: '/courses' },
                { label: 'Pricing', to: '/pricing' },
                { label: 'About Us', to: '/about' },
                { label: 'FAQ', to: '/faq' },
                { label: 'Contact', to: '/contact' },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-slate-400 hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Learning */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">Learning</h3>
            <ul className="space-y-3">
              {[
                'Python Fundamentals',
                'Data Science',
                'Web Development',
                'Automation',
                'AI & ML',
              ].map(label => (
                <li key={label}>
                  <Link to="/courses" className="text-sm text-slate-400 hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-sm text-slate-400">
                <Mail size={15} className="text-primary-400 flex-shrink-0" />
                info@kaveritech.com
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-400">
                <Phone size={15} className="text-primary-400 flex-shrink-0" />
                +91 98765 43210
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-400">
                <MapPin size={15} className="text-primary-400 flex-shrink-0 mt-0.5" />
                Bangalore, Karnataka, India
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Kaveri Technologies Academy. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
