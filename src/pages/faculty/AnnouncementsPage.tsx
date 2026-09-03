import { useEffect, useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../lib/utils';
import type { Announcement, Course } from '../../types/database';

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', course_id: '' });

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: cf } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
      const cIds = (cf ?? []).map((c: any) => c.course_id);

      const [{ data: ann }, { data: cData }] = await Promise.all([
        supabase.from('announcements').select('*').eq('author_id', profile.id).order('created_at', { ascending: false }),
        cIds.length ? supabase.from('courses').select('*').in('id', cIds) : { data: [] },
      ]);
      setAnnouncements((ann ?? []) as Announcement[]);
      setCourses((cData ?? []) as Course[]);
    };
    load();
  }, [profile]);

  const handleCreate = async () => {
    if (!profile || !form.title || !form.content) return;
    const { data, error } = await supabase.from('announcements').insert({
      title: form.title,
      content: form.content,
      author_id: profile.id,
      course_id: form.course_id || null,
      is_global: false,
    }).select().maybeSingle();
    if (!error && data) {
      setAnnouncements(a => [data as Announcement, ...a]);
      setForm({ title: '', content: '', course_id: '' });
      setShowModal(false);
      success('Announcement posted!');
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    setAnnouncements(a => a.filter(x => x.id !== id));
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader
        title="Announcements"
        subtitle="Post announcements for your course students"
        icon={Megaphone}
        action={<button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Announcement</button>}
      />

      {announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements" description="Create an announcement to inform your students." action={<button onClick={() => setShowModal(true)} className="btn-primary">Create Announcement</button>} />
      ) : (
        <div className="space-y-4">
          {announcements.map(ann => (
            <div key={ann.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 dark:text-white mb-1">{ann.title}</h3>
                  <p className="text-xs text-slate-400 mb-3">{formatRelativeTime(ann.created_at)}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{ann.content}</p>
                </div>
                <button onClick={() => handleDelete(ann.id)} className="btn-ghost py-1.5 px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Announcement">
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="Announcement title..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Course (optional)</label>
            <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
              <option value="">All enrolled students</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Content</label>
            <textarea className="input min-h-[120px] resize-none" placeholder="Write your announcement..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} className="btn-primary">Post Announcement</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
