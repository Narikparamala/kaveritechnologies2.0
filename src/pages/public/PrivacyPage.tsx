import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY, OFFICE_STRING } from '../../lib/company';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate dark:prose-invert max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Last updated: September 2026</p>
          <p>{COMPANY.legalName} ("we", "us", or "our") operates {COMPANY.brandName} (the "platform") and is committed to protecting your personal information and your right to privacy.</p>
          <h2>Information We Collect</h2>
          <p>We collect information that you provide to us directly, such as when you create an account, enrol in a course, submit assignments or quizzes, or contact us for support. This includes your name, email address, and learning progress data.</p>
          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain our educational platform</li>
            <li>To track your learning progress and issue certificates of completion</li>
            <li>To send you important updates about courses and the platform</li>
            <li>To improve our services based on usage patterns</li>
          </ul>
          <h2>Account Credentials & Passwords</h2>
          <p>Passwords are managed by our authentication provider and are never stored in plaintext or reversible form in our application tables. We never ask you to share your password.</p>
          <h2>Data Security</h2>
          <p>We implement industry-standard security measures to protect your data, including row-level security policies that restrict access to your own learning data.</p>
          <h2>Data Sharing</h2>
          <p>We do not sell your personal information. Your learning data is shared only with faculty and administrators of {COMPANY.legalName} as necessary to teach, grade and support your courses.</p>
          <h2>Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> or {COMPANY.phoneDisplay}. Registered office information: {OFFICE_STRING}.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
