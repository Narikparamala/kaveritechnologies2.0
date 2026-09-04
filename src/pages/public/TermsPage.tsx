import { PublicNav } from '../../components/common/PublicNav';
import { Footer } from '../../components/common/Footer';
import { COMPANY, OFFICE_STRING } from '../../lib/company';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <PublicNav />
      <div className="pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate dark:prose-invert max-w-none">
          <h1>Terms and Conditions</h1>
          <p className="text-slate-400 text-sm">Last updated: September 2026</p>
          <p>By accessing and using {COMPANY.brandName}, operated by {COMPANY.legalName}, you accept and agree to be bound by the following terms and conditions.</p>
          <h2>Use of the Platform</h2>
          <p>You agree to use our platform for educational purposes only. You must not share your account credentials with others. Each enrolment is for individual use only.</p>
          <h2>Account Security</h2>
          <p>You are responsible for keeping your password confidential. Your password is managed by our authentication provider and is never stored by us in plaintext. If you believe your account has been compromised, reset your password or contact us immediately.</p>
          <h2>Enrolment & Access</h2>
          <p>Course access is granted through enrolment on the platform or through arrangements confirmed by our team. Access periods and course content follow the details confirmed for your enrolment or batch.</p>
          <h2>Intellectual Property</h2>
          <p>All course content, materials, and videos are the intellectual property of {COMPANY.legalName}. You may not redistribute or resell any course content.</p>
          <h2>Certificates</h2>
          <p>Certificates of completion are issued by {COMPANY.brandName} when a course set up for certification is completed according to its published requirements. Recognition of any certificate is at the discretion of employers or institutions.</p>
          <h2>Fees & Refunds</h2>
          <p>Course fees, where applicable, are confirmed by our team before enrolment. Any refund or cancellation terms are communicated at the time of enrolment for the specific course or batch.</p>
          <h2>Account Termination</h2>
          <p>We reserve the right to terminate accounts that violate these terms, engage in academic dishonesty, or misuse the platform.</p>
          <h2>Contact</h2>
          <p>For questions about these terms, contact us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> or {COMPANY.phoneDisplay}. Registered office information: {OFFICE_STRING}.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
