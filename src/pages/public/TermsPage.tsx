import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate dark:prose-invert max-w-none">
          <h1>Terms and Conditions</h1>
          <p className="text-slate-400 text-sm">Last updated: January 2025</p>
          <p>By accessing and using Kaveri Technologies Academy, you accept and agree to be bound by the following terms and conditions.</p>
          <h2>Use of the Platform</h2>
          <p>You agree to use our platform for educational purposes only. You must not share your account credentials with others. Each enrollment is for individual use only.</p>
          <h2>Intellectual Property</h2>
          <p>All course content, materials, and videos are the intellectual property of Kaveri Technologies Academy. You may not redistribute or resell any course content.</p>
          <h2>Refund Policy</h2>
          <p>We offer a 7-day refund policy on Pro course enrollments. Refund requests must be submitted within 7 days of purchase. All-Access plans are non-refundable after 7 days.</p>
          <h2>Certificates</h2>
          <p>Certificates are issued upon successful completion of course requirements including minimum 80% lesson completion and passing the final assessment.</p>
          <h2>Account Termination</h2>
          <p>We reserve the right to terminate accounts that violate these terms, engage in academic dishonesty, or misuse the platform.</p>
          <h2>Contact</h2>
          <p>For questions about these terms, contact us at info@kaveritech.com.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
