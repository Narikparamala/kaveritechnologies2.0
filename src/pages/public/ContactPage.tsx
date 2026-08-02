import { useState } from 'react';
import { Mail, Phone, MapPin, Send, CheckCircle } from 'lucide-react';
import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Get in Touch</h1>
            <p className="text-slate-500 dark:text-slate-400">Have questions? We'd love to hear from you.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Info */}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Contact Information</h2>
              <div className="space-y-5 mb-8">
                {[
                  { icon: Mail, label: 'Email', value: 'info@kaveritech.com' },
                  { icon: Phone, label: 'Phone', value: '+91 98765 43210' },
                  { icon: MapPin, label: 'Location', value: 'Bangalore, Karnataka, India' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-slate-700 dark:text-slate-300 font-medium">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Support Hours</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Monday – Saturday: 9 AM to 6 PM IST</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Response within 24 hours</p>
              </div>
            </div>

            {/* Form */}
            <div className="card p-8">
              {submitted ? (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Message Sent!</h3>
                  <p className="text-slate-500 dark:text-slate-400">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Name</label>
                      <input className="input" placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <label className="label">Subject</label>
                    <input className="input" placeholder="How can we help?" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">Message</label>
                    <textarea className="input min-h-[140px] resize-none" placeholder="Tell us more..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required />
                  </div>
                  <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                    <Send size={16} /> Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
