import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Globe } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { COMPANY } from '../../lib/company';

export function Footer() {
  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Logo size="sm" className="mb-4 [&_span]:text-white [&_.text-primary-600]:text-primary-400" />
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              {COMPANY.tagline} {COMPANY.brandName} is the learning platform of {COMPANY.legalName}.
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Globe size={15} className="text-primary-400 flex-shrink-0" />
              <a
                href={COMPANY.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                {COMPANY.website}
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">Platform</h3>
            <ul className="space-y-3">
              {[
                { label: 'Courses', to: '/courses' },
                { label: 'About Us', to: '/about' },
                { label: 'Contact', to: '/contact' },
                { label: 'FAQ', to: '/faq' },
                { label: 'Privacy Policy', to: '/privacy' },
                { label: 'Terms of Service', to: '/terms' },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link to={to} className="text-sm text-slate-400 hover:text-white transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Learning areas */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm">What We Teach</h3>
            <ul className="space-y-3">
              {[
                'Programming',
                'Full Stack Development',
                'Testing & QA',
                'Data & AI',
                'Automation',
                'Career-focused IT skills',
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
                <a href={`mailto:${COMPANY.email}`} className="hover:text-white transition-colors break-all">{COMPANY.email}</a>
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-400">
                <Phone size={15} className="text-primary-400 flex-shrink-0" />
                <a href={`tel:${COMPANY.phoneRaw}`} className="hover:text-white transition-colors">{COMPANY.phoneDisplay}</a>
              </li>
              {COMPANY.offices.map(office => (
                <li key={office.name} className="flex items-start gap-3 text-sm text-slate-400">
                  <MapPin size={15} className="text-primary-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium text-slate-300">{office.name}: </span>
                    {office.lines.join(' ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
