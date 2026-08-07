import { useEffect, useState, useRef } from 'react';
import { Award, Download, Eye } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import type { Certificate, Course } from '../../types/database';

type CertWithCourse = Certificate & { course: Course };

export default function CertificatesPage() {
  const { profile } = useAuth();
  const [certs, setCerts] = useState<CertWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewCert, setViewCert] = useState<CertWithCourse | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('certificates')
      .select('*, course:courses(*)')
      .eq('student_id', profile.id)
      .order('issued_at', { ascending: false })
      .then(({ data }) => {
        setCerts((data ?? []) as any);
        setLoading(false);
      });
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="My Certificates" subtitle="Your earned certificates of completion" icon={Award} />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2].map(i => <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : certs.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Complete a course to earn your first certificate."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {certs.map(cert => (
            <div key={cert.id} className="card-hover overflow-hidden">
              {/* Certificate preview */}
              <div className="h-40 bg-gradient-to-br from-primary-600 via-primary-700 to-teal-600 flex flex-col items-center justify-center p-6 text-white">
                <Award size={32} className="mb-2 text-yellow-300" />
                <p className="font-bold text-center text-sm">{cert.course?.title}</p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-400 font-mono mb-1">ID: {cert.certificate_uid}</p>
                <p className="font-semibold text-slate-900 dark:text-white">{profile.full_name}</p>
                <p className="text-xs text-slate-400 mt-1">Issued: {formatDate(cert.issued_at)}</p>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setViewCert(cert)} className="flex-1 btn-secondary text-xs py-2 flex items-center justify-center gap-1">
                    <Eye size={13} /> View
                  </button>
                  <button onClick={() => window.print()} className="flex-1 btn-primary text-xs py-2 flex items-center justify-center gap-1">
                    <Download size={13} /> Download
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certificate viewer */}
      <Modal open={!!viewCert} onClose={() => setViewCert(null)} title="Certificate Preview" size="xl">
        {viewCert && (
          <div className="bg-gradient-to-br from-slate-900 via-primary-900 to-teal-900 rounded-2xl p-12 text-center text-white">
            <div className="border-4 border-yellow-400/30 rounded-2xl p-10">
              <img src="/assets/images/WhatsApp_Image_2026-06-16_at_10.34.22.jpeg" alt="Logo" className="h-16 mx-auto mb-6 rounded-xl bg-white p-1" />
              <p className="text-teal-300 text-sm font-semibold tracking-widest uppercase mb-3">Certificate of Completion</p>
              <p className="text-white/70 mb-2">This is to certify that</p>
              <h1 className="text-4xl font-extrabold text-yellow-300 mb-2">{profile.full_name}</h1>
              <p className="text-white/70 mb-1">has successfully completed the course</p>
              <h2 className="text-2xl font-bold text-white mb-8">{viewCert.course?.title}</h2>
              <div className="flex justify-between items-end">
                <div className="text-left">
                  <p className="text-white/50 text-xs">Certificate ID</p>
                  <p className="text-white font-mono text-sm">{viewCert.certificate_uid}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Issue Date</p>
                  <p className="text-white text-sm">{formatDate(viewCert.issued_at)}</p>
                </div>
                <div className="text-right">
                  <div className="w-24 border-t border-white/50 mb-1" />
                  <p className="text-white/70 text-xs">Authorized Signature</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
