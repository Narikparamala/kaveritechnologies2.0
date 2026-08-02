import { useEffect, useState } from 'react';
import {
  Users, Plus, Calendar, Search, Filter, Loader2, MoreVertical,
  Edit, Trash2, Eye, GraduationCap, UserPlus, Archive, Clock,
  BookOpen, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Batch, Course, Profile, BatchStatus } from '../../types/database';
import BatchDetailView from './BatchDetailView';

const STATUS_CONFIG: Record<BatchStatus, { label: string; variant: 'info' | 'success' | 'warning' | 'default' }> = {
  upcoming: { label: 'Upcoming', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  completed: { label: 'Completed', variant: 'default' },
  archived: { label: 'Archived', variant: 'warning' },
};

interface BatchWithCounts extends Batch {
  student_count: number;
  faculty_count: number;
}

export default function AdminBatchesPage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [batches, setBatches] = useState<BatchWithCounts[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    course_id: '',
    start_date: '',
    end_date: '',
    max_students: 30,
    status: 'upcoming' as BatchStatus,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [batchRes, courseRes] = await Promise.all([
        supabase.from('batches').select('*, course:courses(id, title)').order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title').order('title'),
      ]);

      const batchData = (batchRes.data ?? []) as (Batch & { course?: Course })[];
      const batchIds = batchData.map(b => b.id);

      let studentCounts: Record<string, number> = {};
      let facultyCounts: Record<string, number> = {};

      if (batchIds.length > 0) {
        const [sRes, fRes] = await Promise.all([
          supabase.from('batch_students').select('batch_id').in('batch_id', batchIds).eq('status', 'active'),
          supabase.from('batch_faculty').select('batch_id').in('batch_id', batchIds),
        ]);
        (sRes.data ?? []).forEach((r: any) => { studentCounts[r.batch_id] = (studentCounts[r.batch_id] || 0) + 1; });
        (fRes.data ?? []).forEach((r: any) => { facultyCounts[r.batch_id] = (facultyCounts[r.batch_id] || 0) + 1; });
      }

      setBatches(batchData.map(b => ({
        ...b,
        student_count: studentCounts[b.id] || 0,
        faculty_count: facultyCounts[b.id] || 0,
      })));
      setCourses((courseRes.data ?? []) as Course[]);
    } catch {
      showError('Failed to load batches');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingBatch(null);
    setForm({ name: '', description: '', course_id: '', start_date: '', end_date: '', max_students: 30, status: 'upcoming' });
    setShowModal(true);
  }

  function openEditModal(batch: Batch) {
    setEditingBatch(batch);
    setForm({
      name: batch.name,
      description: batch.description || '',
      course_id: batch.course_id || '',
      start_date: batch.start_date?.split('T')[0] || '',
      end_date: batch.end_date?.split('T')[0] || '',
      max_students: batch.max_students,
      status: batch.status,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { showError('Batch name is required'); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      course_id: form.course_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      max_students: form.max_students,
      status: form.status,
      ...(editingBatch ? {} : { created_by: profile?.id }),
    };

    const { error } = editingBatch
      ? await supabase.from('batches').update(payload).eq('id', editingBatch.id)
      : await supabase.from('batches').insert(payload);

    if (error) {
      showError(error.message);
      return;
    }

    success(editingBatch ? 'Batch updated' : 'Batch created');
    setShowModal(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this batch? All associated students, faculty, and schedules will be removed.')) return;
    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Batch deleted');
    if (selectedBatch === id) setSelectedBatch(null);
    loadData();
  }

  const filtered = batches.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterCourse && b.course_id !== filterCourse) return false;
    if (searchQuery && !b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (selectedBatch) {
    return <BatchDetailView batchId={selectedBatch} onBack={() => { setSelectedBatch(null); loadData(); }} />;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Batch Management"
        subtitle="Create and manage student batches across courses"
        icon={Users}
        action={
          <button onClick={openCreateModal} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} /> New Batch
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(['upcoming', 'active', 'completed', 'archived'] as BatchStatus[]).map(status => {
          const count = batches.filter(b => b.status === status).length;
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className="card p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{count}</p>
              <p className="text-xs text-slate-500 capitalize">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            className="input-field text-sm py-1.5 flex-1"
            placeholder="Search batches..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="input-field text-sm py-1.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <select className="input-field text-sm py-1.5" value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {/* Batch List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-primary-600" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No batches found"
          description={searchQuery || filterStatus || filterCourse ? 'Try adjusting your filters.' : 'Create your first batch to get started.'}
          action={!searchQuery && !filterStatus && !filterCourse ? (
            <button onClick={openCreateModal} className="btn-primary text-sm">Create Batch</button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(batch => (
            <BatchCard
              key={batch.id}
              batch={batch}
              openMenu={openMenu}
              onToggleMenu={id => setOpenMenu(openMenu === id ? null : id)}
              onView={() => setSelectedBatch(batch.id)}
              onEdit={() => { setOpenMenu(null); openEditModal(batch); }}
              onDelete={() => { setOpenMenu(null); handleDelete(batch.id); }}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingBatch ? 'Edit Batch' : 'Create New Batch'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Batch Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Python Batch - July 2026" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this batch..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Course</label>
              <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
                <option value="">No linked course</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Max Students</label>
              <input type="number" className="input" min={1} value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as BatchStatus }))}>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSave} className="btn-primary text-sm">{editingBatch ? 'Update Batch' : 'Create Batch'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BatchCard({ batch, openMenu, onToggleMenu, onView, onEdit, onDelete }: {
  batch: BatchWithCounts;
  openMenu: string | null;
  onToggleMenu: (id: string) => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[batch.status];
  const courseName = (batch as any).course?.title;

  return (
    <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer group" onClick={onView}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          <Users size={20} className="text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{batch.name}</h3>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </div>
          {courseName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
              <BookOpen size={12} /> {courseName}
            </p>
          )}
          {batch.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-1">{batch.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <GraduationCap size={12} />
              {batch.student_count}/{batch.max_students} students
            </span>
            <span className="flex items-center gap-1">
              <UserPlus size={12} />
              {batch.faculty_count} faculty
            </span>
            {batch.start_date && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {new Date(batch.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {batch.end_date && ` - ${new Date(batch.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors" />
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => onToggleMenu(batch.id)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <MoreVertical size={16} className="text-slate-400" />
            </button>
            {openMenu === batch.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => onToggleMenu('')} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50">
                  <button onClick={onView} className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                    <Eye size={14} /> View Details
                  </button>
                  <button onClick={onEdit} className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                    <Edit size={14} /> Edit Batch
                  </button>
                  <hr className="my-1 border-slate-200 dark:border-slate-700" />
                  <button onClick={onDelete} className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                    <Trash2 size={14} /> Delete Batch
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
