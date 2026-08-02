import { useEffect, useState } from 'react';
import { Award, Plus } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { Certificate, Profile, Course } from '../../types/database';

type CertFull = Certificate & { student: Profile; course: Course };

export default function AdminCertificatesPage() {
  const { success } = useToast();
  const [certs, setCerts] = useState<CertFull[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ student_id: '', course_id: '' });

  useEffect(() => {
    const load = async () => {
      const [{ data: c }, { data: s }, { data: co }] = await Promise.all([
        supabase.from('certificates').select('*, student:profiles(*), course:courses(*)').order('issued_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'student'),
        supabase.from('courses').select('*').eq('is_published', true),
      ]);
      setCerts((c ?? []) as any);
      setStudents((s ?? []) as Profile[]);
      setCourses((co ?? []) as Course[]);
      setLoading(false);
    };
    load();
  }, []);

  const issueCert = async () => {
    if (!form.student_id || !form.course_id) return;
    const { data, error } = await supabase.from('certificates').insert({
      student_id: form.student_id, course_id: form.course_id,
    }).select('*, student:profiles(*), course:courses(*)').maybeSingle();
    if (!error && data) {
      setCerts(cs => [data as any, ...cs]);
      setShowModal(false);
      success('Certificate issued!');
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Certificates"
        subtitle={`${certs.length} certificates issued`}
        icon={Award}
        action={<button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Issue Certificate</button>}
      />

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {certs.map(cert => (
            <div key={cert.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Award size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white truncate">{(cert.student as any)?.full_name}</p>
                <p className="text-xs text-slate-400">{(cert.course as any)?.title}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono text-slate-500">{cert.certificate_uid}</p>
                <p className="text-xs text-slate-400">{formatDate(cert.issued_at)}</p>
              </div>
            </div>
          ))}
          {certs.length === 0 && <p className="py-12 text-center text-slate-400">No certificates issued yet.</p>}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Issue Certificate">
        <div className="space-y-4">
          <div>
            <label className="label">Student</label>
            <select className="input" value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}>
              <option value="">Select student...</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Course</label>
            <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
              <option value="">Select course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={issueCert} className="btn-primary">Issue Certificate</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
