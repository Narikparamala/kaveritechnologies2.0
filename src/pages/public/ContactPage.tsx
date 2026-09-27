import { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY } from '../../lib/company';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[${COMPANY.brandName}] ${form.subject || 'Enquiry'}${form.name ? ` — ${form.name}` : ''}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`
    );
    window.location.href = `mailto:${COMPANY.email}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Contact Us</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Questions about courses, batches or enrolment? {COMPANY.supportNote}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Info */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Contact Information</h2>
              <div className="space-y-5 mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <Mail size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Email</p>
                    <a href={`mailto:${COMPANY.email}`} className="text-slate-700 dark:text-slate-300 font-medium hover:text-primary-600 dark:hover:text-primary-400 break-all">
                      {COMPANY.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <Phone size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Phone</p>
                    <a href={`tel:${COMPANY.phoneRaw}`} className="text-slate-700 dark:text-slate-300 font-medium hover:text-primary-600 dark:hover:text-primary-400">
                      {COMPANY.phoneDisplay}
                    </a>
                  </div>
                </div>
                {COMPANY.offices.map(office => (
                  <div key={office.name} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                      <MapPin size={18} className="text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{office.name}</p>
                      <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {office.lines.join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Working Hours</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Monday – Saturday: 9:00 AM to 6:00 PM IST</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  We usually respond within one working day.
                </p>
              </div>
            </div>

            {/* Form (opens your email app addressed to us) */}
            <div className="card p-8">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-5">Send a Message</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                Fill in the form and your email app will open with the message ready to send to {COMPANY.email}.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Name</label>
                    <input
                      className="input"
                      placeholder="Your name"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input
                      className="input"
                      type="email"
                      placeholder="your@email.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input
                    className="input"
                    placeholder="How can we help?"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea
                    className="input min-h-[140px] resize-none"
                    placeholder="Tell us about the course or batch you are interested in..."
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                  <Send size={16} /> Compose Email
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
