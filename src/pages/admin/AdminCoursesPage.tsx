import { useEffect, useState } from 'react';
import { BookOpen, Plus, Search, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { getDifficultyColor, slugify } from '../../lib/utils';
import type { Course } from '../../types/database';

export default function AdminCoursesPage() {
  const { success, error: toastError } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', short_description: '', difficulty: 'beginner', duration_hours: 20, category: 'python', enrollment_mode: 'open' });

  useEffect(() => {
    supabase.from('courses').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setCourses((data ?? []) as Course[]); setLoading(false); });
  }, []);

  const handleCreate = async () => {
    const { data, error } = await supabase.from('courses').insert({
      ...form,
      slug: slugify(form.title),
      is_published: false,
    }).select().maybeSingle();
    if (error) { toastError('Error', error.message); return; }
    if (data) { setCourses(cs => [data as Course, ...cs]); success('Course created!'); setShowModal(false); }
  };

  const updateEnrollmentMode = async (id: string, mode: string) => {
    const { error } = await supabase.from('courses').update({ enrollment_mode: mode }).eq('id', id);
    if (error) { toastError('Update failed', error.message); return; }
    setCourses(cs => cs.map(c => c.id === id ? { ...c, enrollment_mode: mode as Course['enrollment_mode'] } : c));
    success('Enrolment mode updated');
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from('courses').update({ is_published: !current }).eq('id', id);
    setCourses(cs => cs.map(c => c.id === id ? { ...c, is_published: !current } : c));
    success(current ? 'Course unpublished' : 'Course published!');
  };

  const filtered = courses.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} total courses`}
        icon={BookOpen}
        action={<button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Course</button>}
      />

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-11" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <BookOpen size={18} className="text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white truncate">{c.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`badge capitalize text-xs ${getDifficultyColor(c.difficulty)}`}>{c.difficulty}</span>
                  <span className="text-xs text-slate-400">{c.enrollment_count} students · {c.duration_hours}h</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.is_published ? 'success' : 'default'}>{c.is_published ? 'Published' : 'Draft'}</Badge>
                <select
                  title="Enrolment mode"
                  aria-label={`Enrolment mode for ${c.title}`}
                  value={c.enrollment_mode ?? 'open'}
                  onChange={e => updateEnrollmentMode(c.id, e.target.value)}
                  className="input !py-1.5 !px-2 text-xs w-36"
                >
                  <option value="open">Open enrolment</option>
                  <option value="approval_required">Approval required</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  onClick={() => togglePublish(c.id, c.is_published)}
                  className="btn-ghost py-1.5 px-3 text-xs flex items-center gap-1"
                >
                  {c.is_published ? <><EyeOff size={12} /> Unpublish</> : <><Eye size={12} /> Publish</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create New Course">
        <div className="space-y-4">
          <div>
            <label className="label">Course Title</label>
            <input className="input" placeholder="e.g. Python Fundamentals" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="label">Short Description</label>
            <textarea className="input min-h-[80px] resize-none" placeholder="Brief course description..." value={form.short_description} onChange={e => setForm(f => ({ ...f, short_description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="label">Duration (hours)</label>
              <input type="number" className="input" value={form.duration_hours} onChange={e => setForm(f => ({ ...f, duration_hours: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="label">Enrolment</label>
            <select className="input" value={form.enrollment_mode} onChange={e => setForm(f => ({ ...f, enrollment_mode: e.target.value }))}>
              <option value="open">Open enrolment — students enrol immediately</option>
              <option value="approval_required">Approval required — admin approves requests</option>
              <option value="closed">Closed — no new students</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} className="btn-primary">Create Course</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
