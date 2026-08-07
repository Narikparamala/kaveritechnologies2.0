import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate dark:prose-invert max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Last updated: January 2025</p>
          <p>Kaveri Technologies Academy ("we", "us", or "our") is committed to protecting your personal information and your right to privacy.</p>
          <h2>Information We Collect</h2>
          <p>We collect information that you provide to us directly, such as when you create an account, enroll in a course, or contact us for support. This includes your name, email address, and learning progress data.</p>
          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain our educational platform</li>
            <li>To track your learning progress and issue certificates</li>
            <li>To send you important updates about courses and the platform</li>
            <li>To improve our services based on usage patterns</li>
          </ul>
          <h2>Data Security</h2>
          <p>We implement industry-standard security measures to protect your data. Your data is stored securely in our Supabase database with row-level security policies.</p>
          <h2>Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at info@kaveritech.com.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
