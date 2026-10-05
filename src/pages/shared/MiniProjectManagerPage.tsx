import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Puzzle, Trash2, Upload, X } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Course } from '../../types/database';

// ---------------------------------------------------------------------------
// Mini Projects manager (admin + faculty).
//
// Manages public.coding_vscode_assignments - the browser "Mini Projects" bank
// (in-editor VS Code, auto-graded by the secure judge). Staff-wide RLS allows
// any kaveri staff member to read/update/delete, so one shared component
// serves both portals. Course association is batch-based: linking a course
// upserts coding_vscode_assignment_batches for every batch of that course.
// ---------------------------------------------------------------------------

type MiniAssignment = {
  id: string;
  assignment_key: string;
  title: string;
  topic: string;
  question: string;
  language: string;
  file_name: string;
  starter_code: string;
  marks: number;
  concepts: string[];
  prerequisite_mode: 'none' | 'all_course_items';
  is_published: boolean;
  created_by: string | null;
  creator?: { full_name: string | null; email: string | null } | null;
  test_count?: number;
  batch_names?: string[];
};

type StaffProfile = { id: string; full_name: string | null; email: string | null };

type TestCase = { input_text: string; expected_output: string; is_hidden: boolean };

type EditForm = {
  title: string;
  topic: string;
  question: string;
  starter_code: string;
  marks: number;
  is_published: boolean;
  concepts: string;
  gate: 'none' | 'all_course_items';
};

const emptyEdit: EditForm = { title: '', topic: 'Mini Projects', question: '', starter_code: '', marks: 10, is_published: false, concepts: '', gate: 'none' };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}

export default function MiniProjectManagerPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();

  const [assignments, setAssignments] = useState<MiniAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pubFilter, setPubFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string; course_id: string | null }[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);

  const [submissionCounts, setSubmissionCounts] = useState<Map<string, number>>(new Map());
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [linkCourseId, setLinkCourseId] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [editing, setEditing] = useState<MiniAssignment | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEdit);
  const [editTests, setEditTests] = useState<TestCase[]>([]);
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<EditForm>(emptyEdit);
  const [createTests, setCreateTests] = useState<TestCase[]>([{ input_text: '', expected_output: '', is_hidden: false }]);
  const [deleting, setDeleting] = useState<MiniAssignment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignmentsRes, coursesRes, batchesRes, staffRes] = await Promise.all([
        supabase
          .from('coding_vscode_assignments')
          .select('*, creator:profiles!coding_vscode_assignments_created_by_fkey(full_name, email)')
          .order('assignment_key'),
        supabase.from('courses').select('id, title').order('title'),
        supabase.from('batches').select('id, name, course_id').order('name'),
        supabase.from('profiles').select('id, full_name, email').in('role', ['faculty', 'super_admin']).order('full_name'),
      ]);
      if (assignmentsRes.error) throw assignmentsRes.error;
      const rows = (assignmentsRes.data ?? []) as MiniAssignment[];

      // Test counts + batch names in two light queries, then stitch.
      const ids = rows.map(r => r.id);
      const [testsRes, batchLinksRes] = await Promise.all([
        ids.length ? supabase.from('coding_vscode_test_cases').select('assignment_id').in('assignment_id', ids) : Promise.resolve({ data: [] as any[], error: null }),
        ids.length ? supabase.from('coding_vscode_assignment_batches').select('assignment_id, batch:batches(name)').in('assignment_id', ids) : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (testsRes.error) throw testsRes.error;
      if (batchLinksRes.error) throw batchLinksRes.error;

      const testCounts = new Map<string, number>();
      for (const t of (testsRes.data ?? []) as { assignment_id: string }[]) {
        testCounts.set(t.assignment_id, (testCounts.get(t.assignment_id) ?? 0) + 1);
      }
      const batchNames = new Map<string, string[]>();
      for (const l of (batchLinksRes.data ?? []) as { assignment_id: string; batch: { name: string } | null }[]) {
        if (!l.batch?.name) continue;
        const list = batchNames.get(l.assignment_id) ?? [];
        list.push(l.batch.name);
        batchNames.set(l.assignment_id, list);
      }

      // Submission counts per assignment (attempts by students).
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: subRows, error: subError } = await supabase
          .from('coding_vscode_submissions')
          .select('assignment_key')
          .in('assignment_key', rows.map(r => r.assignment_key));
        if (subError) throw subError;
        const keyToId = new Map(rows.map(r => [r.assignment_key, r.id]));
        for (const sub of (subRows ?? []) as { assignment_key: string }[]) {
          const id = keyToId.get(sub.assignment_key);
          if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      setSubmissionCounts(counts);

      setAssignments(rows.map(r => ({ ...r, test_count: testCounts.get(r.id) ?? 0, batch_names: batchNames.get(r.id) ?? [] })));
      setCourses((coursesRes.data ?? []) as Course[]);
      setBatches((batchesRes.data ?? []) as { id: string; name: string; course_id: string | null }[]);
      setStaff((staffRes.data ?? []) as StaffProfile[]);
    } catch (e) {
      toastError('Could not load mini projects', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.created_by) map.set(a.created_by, a.creator?.full_name || a.creator?.email || a.created_by.slice(0, 8));
    }
    return [...map.entries()];
  }, [assignments]);

  const filtered = useMemo(() => assignments.filter(a => {
    if (pubFilter === 'published' && !a.is_published) return false;
    if (pubFilter === 'drafts' && a.is_published) return false;
    if (creatorFilter !== 'all' && a.created_by !== creatorFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !(a.title.toLowerCase().includes(q) || a.assignment_key.toLowerCase().includes(q))) return false;
    return true;
  }), [assignments, search, pubFilter, creatorFilter]);

  const allSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(a => a.id)));
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const togglePublish = async (a: MiniAssignment) => {
    const { error } = await supabase
      .from('coding_vscode_assignments')
      .update({ is_published: !a.is_published, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    if (error) toastError('Update failed', error.message);
    else {
      success(a.is_published ? 'Unpublished' : 'Published', a.title);
      void load();
    }
  };

  const openEdit = async (a: MiniAssignment) => {
    setEditing(a);
    setEditForm({
      title: a.title,
      topic: a.topic,
      question: a.question,
      starter_code: a.starter_code,
      marks: a.marks,
      is_published: a.is_published,
      concepts: (a.concepts ?? []).join(', '),
      gate: a.prerequisite_mode ?? 'none',
    });
    const { data, error } = await supabase
      .from('coding_vscode_test_cases')
      .select('input_text, expected_output, is_hidden')
      .eq('assignment_id', a.id)
      .order('position');
    if (error) toastError('Could not load test cases', error.message);
    setEditTests((data ?? []) as TestCase[]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('coding_vscode_assignments')
        .update({
          title: editForm.title.trim(),
          topic: editForm.topic.trim() || 'Mini Projects',
          question: editForm.question,
          starter_code: editForm.starter_code,
          marks: editForm.marks,
          is_published: editForm.is_published,
          concepts: editForm.concepts.split(',').map(c => c.trim()).filter(Boolean).slice(0, 8),
          prerequisite_mode: editForm.gate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id);
      if (error) throw error;
      await supabase.from('coding_vscode_test_cases').delete().eq('assignment_id', editing.id);
      const validTests = editTests.filter(t => t.expected_output.trim() !== '');
      if (validTests.length > 0) {
        const { error: testsError } = await supabase.from('coding_vscode_test_cases').insert(
          validTests.map((t, i) => ({ assignment_id: editing.id, input_text: t.input_text, expected_output: t.expected_output, is_hidden: t.is_hidden, position: i + 1 })),
        );
        if (testsError) throw testsError;
      }
      success('Saved', editForm.title);
      setEditing(null);
      void load();
    } catch (e) {
      toastError('Save failed', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const createAssignment = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const key = createForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'mini-project';
      const { data: inserted, error } = await supabase
        .from('coding_vscode_assignments')
        .insert({
          assignment_key: `${key}-${Date.now().toString(36).slice(-4)}`,
          title: createForm.title.trim(),
          topic: createForm.topic.trim() || 'Mini Projects',
          question: createForm.question,
          language: 'python',
          file_name: 'main.py',
          starter_code: createForm.starter_code,
          marks: createForm.marks,
          concepts: createForm.concepts.split(',').map(c => c.trim()).filter(Boolean).slice(0, 8),
          prerequisite_mode: createForm.gate,
          is_published: createForm.is_published,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      const validTests = createTests.filter(t => t.expected_output.trim() !== '');
      if (validTests.length > 0) {
        const { error: testsError } = await supabase.from('coding_vscode_test_cases').insert(
          validTests.map((t, i) => ({ assignment_id: inserted!.id, input_text: t.input_text, expected_output: t.expected_output, is_hidden: t.is_hidden, position: i + 1 })),
        );
        if (testsError) throw testsError;
      }
      success('Mini project created', createForm.title);
      setCreating(false);
      setCreateForm(emptyEdit);
      setCreateTests([{ input_text: '', expected_output: '', is_hidden: false }]);
      void load();
    } catch (e) {
      toastError('Create failed', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('coding_vscode_assignments').delete().eq('id', deleting.id);
    if (error) toastError('Delete failed', error.message);
    else {
      success('Deleted', deleting.title);
      setSelected(prev => { const n = new Set(prev); n.delete(deleting.id); return n; });
      setDeleting(null);
      void load();
    }
  };

  // Bulk: link every selected assignment to every batch of the chosen course.
  const bulkLinkCourse = async () => {
    if (!linkCourseId || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const courseBatchIds = batches.filter(b => b.course_id === linkCourseId).map(b => b.id);
      if (courseBatchIds.length === 0) {
        toastError('No batches', 'That course has no batches yet - create one first.');
        return;
      }
      const links = courseBatchIds.flatMap(batchId =>
        [...selected].map(assignmentId => ({ assignment_id: assignmentId, batch_id: batchId, is_permanently_released: true })),
      );
      const { error } = await supabase.from('coding_vscode_assignment_batches').upsert(links, { onConflict: 'assignment_id,batch_id', ignoreDuplicates: true });
      if (error) throw error;
      const course = courses.find(c => c.id === linkCourseId);
      success('Course linked', `${selected.size} mini project(s) linked to ${course?.title ?? 'course'} (${courseBatchIds.length} batch${courseBatchIds.length === 1 ? '' : 'es'})`);
      setSelected(new Set());
      void load();
    } catch (e) {
      toastError('Course link failed', errorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk: move ownership of every selected assignment to the chosen staff.
  const bulkReassign = async () => {
    if (!reassignTo || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from('coding_vscode_assignments')
        .update({ created_by: reassignTo, updated_at: new Date().toISOString() })
        .in('id', [...selected]);
      if (error) throw error;
      const target = staff.find(s => s.id === reassignTo);
      success('Ownership moved', `${selected.size} mini project(s) reassigned to ${target?.full_name ?? target?.email ?? 'staff'}`);
      setSelected(new Set());
      void load();
    } catch (e) {
      toastError('Reassign failed', errorMessage(e));
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk: remove every batch link of the selected assignments (un-target them,
  // which hides them from students in all batches until re-linked).
  const bulkUnlink = async () => {
    if (selected.size === 0) return;
    setUnlinkBusy(true);
    try {
      const { error } = await supabase
        .from('coding_vscode_assignment_batches')
        .delete()
        .in('assignment_id', [...selected]);
      if (error) throw error;
      success('Unlinked', `${selected.size} mini project(s) removed from all batches`);
      setSelected(new Set());
      void load();
    } catch (e) {
      toastError('Unlink failed', errorMessage(e));
    } finally {
      setUnlinkBusy(false);
    }
  };

  const testEditor = (tests: TestCase[], setTests: (t: TestCase[]) => void) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Test cases ({tests.length})</p>
        <button type="button" onClick={() => setTests([...tests, { input_text: '', expected_output: '', is_hidden: false }])} className="text-xs font-medium text-primary-600 hover:underline">
          + add test
        </button>
      </div>
      {tests.map((t, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <div className="mb-1 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={t.is_hidden} onChange={e => setTests(tests.map((x, j) => j === i ? { ...x, is_hidden: e.target.checked } : x))} />
              hidden test
            </label>
            {tests.length > 1 && (
              <button type="button" onClick={() => setTests(tests.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:underline">remove</button>
            )}
          </div>
          <textarea
            value={t.input_text}
            onChange={e => setTests(tests.map((x, j) => j === i ? { ...x, input_text: e.target.value } : x))}
            placeholder="stdin input (can be empty)"
            rows={2}
            className="input mb-1 font-mono text-xs"
          />
          <textarea
            value={t.expected_output}
            onChange={e => setTests(tests.map((x, j) => j === i ? { ...x, expected_output: e.target.value } : x))}
            placeholder="expected stdout (required)"
            rows={2}
            className="input font-mono text-xs"
          />
        </div>
      ))}
      <p className="text-xs text-slate-400">Tests with an empty expected output are dropped on save.</p>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Mini Projects"
        subtitle={`${assignments.length} browser-coded, auto-graded projects - ownership, publishing and course links`}
        icon={Puzzle}
        action={<button onClick={() => setCreating(true)} className="btn-primary text-sm"><Plus size={15} /> New mini project</button>}
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}</div>
      ) : assignments.length === 0 ? (
        <EmptyState icon={Puzzle} title="No mini projects yet" description="Create the first one, or generate drafts from Content Import." />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input className="input max-w-xs" placeholder="Search title or key..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input max-w-[11rem]" value={pubFilter} onChange={e => setPubFilter(e.target.value as typeof pubFilter)}>
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="drafts">Drafts</option>
            </select>
            <select className="input max-w-[14rem]" value={creatorFilter} onChange={e => setCreatorFilter(e.target.value)}>
              <option value="all">All creators</option>
              {creators.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <span className="text-sm text-slate-500">{filtered.length} of {assignments.length}</span>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="card mb-4 flex flex-wrap items-end gap-3 border-primary-200 p-4">
              <p className="w-full text-sm font-semibold text-primary-700">{selected.size} selected</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Link to course (adds to all its batches)</label>
                <select className="input max-w-[16rem]" value={linkCourseId} onChange={e => setLinkCourseId(e.target.value)}>
                  <option value="">- choose course -</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <button onClick={bulkLinkCourse} disabled={bulkBusy || !linkCourseId} className="btn-primary text-sm disabled:opacity-50">
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Link course
              </button>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Move ownership to</label>
                <select className="input max-w-[16rem]" value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                  <option value="">- choose staff -</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}{s.id === profile?.id ? ' (you)' : ''}</option>)}
                </select>
              </div>
              <button onClick={bulkReassign} disabled={bulkBusy || !reassignTo} className="btn-secondary text-sm disabled:opacity-50">
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : null} Reassign
              </button>
              <button onClick={bulkUnlink} disabled={unlinkBusy} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950">
                {unlinkBusy ? <Loader2 size={14} className="animate-spin inline" /> : null} Unlink all batches
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-slate-500 hover:text-slate-700">Clear</button>
            </div>
          )}

          {/* Table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <th className="p-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Created by</th>
                  <th className="p-3">Tests</th>
                  <th className="p-3">Submissions</th>
                  <th className="p-3">Batches</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="p-3"><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} /></td>
                    <td className="p-3">
                      <p className="font-medium text-slate-900 dark:text-white">{a.title}</p>
                      <p className="text-xs text-slate-400">{a.assignment_key} - {a.language} - {a.marks} marks</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(a.concepts ?? []).slice(0, 4).map(c => (
                          <span key={c} className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{c}</span>
                        ))}
                        {a.prerequisite_mode === 'all_course_items' && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">gated</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">{a.creator?.full_name || a.creator?.email || '-'}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">{a.test_count}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">{submissionCounts.get(a.id) ?? 0}</td>
                    <td className="p-3 text-xs text-slate-500">{a.batch_names?.length ? a.batch_names.join(', ') : '-'}</td>
                    <td className="p-3">{a.is_published ? <Badge variant="success">Published</Badge> : <Badge variant="warning">Draft</Badge>}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => togglePublish(a)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" title={a.is_published ? 'Unpublish' : 'Publish'}>
                          {a.is_published ? <X size={15} /> : <Upload size={15} />}
                        </button>
                        <button onClick={() => void openEdit(a)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => setDeleting(a)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit: ${editing.title}` : ''} size="lg">
        {editing && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                <input className="input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Marks</label>
                <input type="number" min={1} className="input" value={editForm.marks} onChange={e => setEditForm(f => ({ ...f, marks: Number(e.target.value) || 10 }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Topic</label>
              <input className="input" value={editForm.topic} onChange={e => setEditForm(f => ({ ...f, topic: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Concepts required (comma separated)</label>
                <input className="input" value={editForm.concepts} onChange={e => setEditForm(f => ({ ...f, concepts: e.target.value }))} placeholder="Lists, Loops, Strings" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Prerequisite for students</label>
                <select className="input" value={editForm.gate} onChange={e => setEditForm(f => ({ ...f, gate: e.target.value as 'none' | 'all_course_items' }))}>
                  <option value="none">Always available once released</option>
                  <option value="all_course_items">Unlock only when all course items are completed</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400">The gate applies in every course this project is linked to.</p>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Problem statement</label>
              <textarea className="input font-mono text-xs" rows={8} value={editForm.question} onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Starter code</label>
              <textarea className="input font-mono text-xs" rows={6} value={editForm.starter_code} onChange={e => setEditForm(f => ({ ...f, starter_code: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.is_published} onChange={e => setEditForm(f => ({ ...f, is_published: e.target.checked }))} />
              Published (visible to students)
            </label>
            {testEditor(editTests, setEditTests)}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveEdit} disabled={saving || !editForm.title.trim() || !editForm.question.trim()} className="btn-primary text-sm disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New mini project" size="lg">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
              <input className="input" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="Mini Project 21: ..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Marks</label>
              <input type="number" min={1} className="input" value={createForm.marks} onChange={e => setCreateForm(f => ({ ...f, marks: Number(e.target.value) || 10 }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Topic</label>
            <input className="input" value={createForm.topic} onChange={e => setCreateForm(f => ({ ...f, topic: e.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Concepts required (comma separated)</label>
              <input className="input" value={createForm.concepts} onChange={e => setCreateForm(f => ({ ...f, concepts: e.target.value }))} placeholder="Lists, Loops, Strings" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Prerequisite for students</label>
              <select className="input" value={createForm.gate} onChange={e => setCreateForm(f => ({ ...f, gate: e.target.value as 'none' | 'all_course_items' }))}>
                <option value="none">Always available once released</option>
                <option value="all_course_items">Unlock only when all course items are completed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Problem statement (be exact about input/output format - the judge compares stdout)</label>
            <textarea className="input font-mono text-xs" rows={8} value={createForm.question} onChange={e => setCreateForm(f => ({ ...f, question: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Starter code</label>
            <textarea className="input font-mono text-xs" rows={6} value={createForm.starter_code} onChange={e => setCreateForm(f => ({ ...f, starter_code: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={createForm.is_published} onChange={e => setCreateForm(f => ({ ...f, is_published: e.target.checked }))} />
            Publish immediately
          </label>
          {testEditor(createTests, setCreateTests)}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setCreating(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={createAssignment} disabled={saving || !createForm.title.trim() || !createForm.question.trim()} className="btn-primary text-sm disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Create
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete mini project?" size="sm">
        <p className="text-sm text-slate-600">
          <strong>{deleting?.title}</strong> and its test cases will be removed. Student submissions remain for the record.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setDeleting(null)} className="btn-secondary text-sm">Cancel</button>
          <button onClick={doDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
