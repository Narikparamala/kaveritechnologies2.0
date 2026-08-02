import { useEffect, useState, useCallback } from 'react';
import {
  FileText, ListTree, BookOpen, Code2, HelpCircle, ClipboardList,
  Video, Film, Settings, Plus, Trash2, Edit2, Eye, EyeOff, ArrowUp, ArrowDown,
  ChevronDown, ChevronRight, Check, X, ExternalLink, Lock, Unlock, AlertCircle, Clock,
  Monitor, Mic,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../../components/ui/Modal';
import {
  updateLesson,
  getLessonTopics, createTopic, updateTopic, deleteTopic,
  createSubtopic, updateSubtopic, deleteSubtopic,
  getLessonMaterials, createMaterial, updateMaterial, deleteMaterial,
  getPracticeQuestions, createPracticeQuestion, updatePracticeQuestion, deletePracticeQuestion,
  getLessonQuizzes, getLessonAssignments, getLessonLiveSessions, createQuiz, updateQuiz, deleteQuiz, createAssignment, updateAssignment, deleteAssignment,
} from '../../services/faculty';
import type { Course, Lesson, LessonTopic, LessonSubtopic, LessonResource, LessonResourceType, LessonPracticeQuestion, Quiz, Assignment, LiveSession } from '../../types/database';
import { FileUpload } from '../../components/ui/FileUpload';
import { uploadLessonFile, ACCEPTED_FILE_TYPES } from '../../services/fileUpload';

type TabKey = 'overview' | 'notes' | 'topics' | 'materials' | 'delivery' | 'code' | 'practice' | 'quiz' | 'assignment' | 'settings';

interface Props {
  lesson: Lesson;
  course: Course;
  onRefresh: () => void;
  onEditLesson: () => void;
  onTogglePublish: () => void;
  onDeleteLesson: () => void;
  onMoveLesson: (dir: 'up' | 'down') => void;
}

function getTabs(mode: string): { key: TabKey; label: string; icon: any }[] {
  const base: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'notes', label: 'Notes', icon: BookOpen },
    { key: 'topics', label: 'Topics', icon: ListTree },
    { key: 'materials', label: 'Materials', icon: BookOpen },
  ];
  if (mode === 'live_class') {
    base.push({ key: 'delivery', label: 'Live Class', icon: Video });
  } else {
    base.push({ key: 'delivery', label: 'Recording', icon: Film });
  }
  base.push(
    { key: 'code', label: 'Code', icon: Code2 },
    { key: 'practice', label: 'Practice', icon: HelpCircle },
    { key: 'quiz', label: 'Quiz', icon: HelpCircle },
    { key: 'assignment', label: 'Assignment', icon: ClipboardList },
    { key: 'settings', label: 'Settings', icon: Settings },
  );
  return base;
}

export default function LessonEditorTabs({ lesson, course, onRefresh, onEditLesson, onTogglePublish, onDeleteLesson, onMoveLesson }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const tabs = getTabs(lesson.teaching_mode);

  return (
    <div className="flex flex-col h-full">
      {/* Lesson header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white truncate">{lesson.title}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1"><Clock size={10} /> {lesson.duration_minutes}m</span>
              <span>{lesson.xp_reward} XP</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                lesson.teaching_mode === 'live_class'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
              }`}>
                {lesson.teaching_mode === 'live_class' ? <><Monitor size={9} /> Live Class</> : <><Film size={9} /> Recorded</>}
              </span>
              {lesson.enable_coding_playground && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                  <Code2 size={9} /> Coding
                </span>
              )}
              <span className={`badge text-xs ${lesson.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                {lesson.is_published ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => onMoveLesson('up')} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Move up"><ArrowUp size={14} /></button>
            <button onClick={() => onMoveLesson('down')} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Move down"><ArrowDown size={14} /></button>
            <button onClick={onTogglePublish} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Publish/Unpublish">
              {lesson.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={onEditLesson} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit lesson"><Edit2 size={14} /></button>
            <button onClick={onDeleteLesson} className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete lesson"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && <OverviewTab lesson={lesson} />}
        {activeTab === 'notes' && <NotesTab lesson={lesson} onRefresh={onRefresh} />}
        {activeTab === 'topics' && <TopicsTab lesson={lesson} />}
        {activeTab === 'materials' && <MaterialsTab lesson={lesson} course={course} />}
        {activeTab === 'delivery' && lesson.teaching_mode === 'live_class' && <LiveClassTab lesson={lesson} course={course} />}
        {activeTab === 'delivery' && lesson.teaching_mode === 'recorded_video' && <RecordingTab lesson={lesson} course={course} />}
        {activeTab === 'code' && <CodeTab lesson={lesson} onRefresh={onRefresh} />}
        {activeTab === 'practice' && <PracticeTab lesson={lesson} />}
        {activeTab === 'quiz' && <QuizTab lesson={lesson} course={course} />}
        {activeTab === 'assignment' && <AssignmentTab lesson={lesson} course={course} />}
        {activeTab === 'settings' && <SettingsTab lesson={lesson} onRefresh={onRefresh} />}
      </div>
    </div>
  );
}

// ============================================================
// Overview Tab - shows teaching style summary
// ============================================================
function OverviewTab({ lesson }: { lesson: Lesson }) {
  return (
    <div className="max-w-2xl space-y-4">
      {/* Teaching Style Card */}
      <div className="card p-5 border-l-4 border-l-primary-500">
        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Lesson Setup</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-400 text-xs mb-1">Delivery Method</p>
            <div className="flex items-center gap-1.5">
              {lesson.teaching_mode === 'live_class' ? <Monitor size={14} className="text-blue-500" /> : <Film size={14} className="text-purple-500" />}
              <span className="text-slate-900 dark:text-white font-medium">{lesson.teaching_mode === 'live_class' ? 'Live Class' : 'Recorded Video'}</span>
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Duration</p>
            <p className="text-slate-900 dark:text-white font-medium">{lesson.duration_minutes} min</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">XP Reward</p>
            <p className="text-slate-900 dark:text-white font-medium">{lesson.xp_reward} XP</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Coding Playground</p>
            <p className="text-slate-900 dark:text-white font-medium">{lesson.enable_coding_playground ? 'Enabled' : 'Disabled'}</p>
          </div>
        </div>
      </div>

      {/* What to set up */}
      <div className="card p-5">
        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Content Checklist</h3>
        <div className="space-y-2">
          <ChecklistItem label="Notes / Explanation" done={!!(lesson.notes_markdown || lesson.explanation)} hint="Required. Go to the Notes tab to add." />
          <ChecklistItem label="Topics & Subtopics" done={false} hint="Outline what this lesson covers." />
          {lesson.teaching_mode === 'live_class' ? (
            <ChecklistItem label="Schedule Live Class" done={false} hint="Go to Live Class tab to schedule a Google Meet session." />
          ) : (
            <ChecklistItem label="Add Recording" done={false} hint="Go to Recording tab to add a YouTube/uploaded video." />
          )}
          <ChecklistItem label="Materials (Slides/Files)" done={false} hint="Upload slides, PDFs, or other resources for students." />
          {lesson.enable_coding_playground && (
            <ChecklistItem label="Code Example" done={!!lesson.code_example} hint="Add starter code for the embedded playground." />
          )}
        </div>
      </div>

      {/* Quick info */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p><strong>Notes</strong> are always required -- they're the core lesson content every student sees.</p>
        {lesson.teaching_mode === 'live_class' ? (
          <p><strong>Live Class</strong> mode: You'll conduct the session via Google Meet. Slides and notes can be locked until after the session.</p>
        ) : (
          <p><strong>Recorded Video</strong> mode: Students watch your recording and access notes/slides immediately.</p>
        )}
        {lesson.enable_coding_playground && (
          <p><strong>Coding Playground</strong>: Students get an embedded Python editor alongside the lesson content.</p>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ label, done, hint }: { label: string; done: boolean; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${done ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
        {done ? <Check size={10} className="text-emerald-600" /> : <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

// ============================================================
// Notes Tab - always required
// ============================================================
function NotesTab({ lesson, onRefresh }: { lesson: Lesson; onRefresh: () => void }) {
  const { success, error: toastError } = useToast();
  const [notesMarkdown, setNotesMarkdown] = useState(lesson.notes_markdown ?? '');
  const [explanation, setExplanation] = useState(lesson.explanation ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotesMarkdown(lesson.notes_markdown ?? '');
    setExplanation(lesson.explanation ?? '');
  }, [lesson.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateLesson(lesson.id, { notes_markdown: notesMarkdown || null, explanation: explanation || null });
      success('Notes saved');
      onRefresh();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Lesson Notes</h3>
          <p className="text-xs text-slate-400 mt-0.5">Notes are the core content every student sees, regardless of teaching mode.</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
          Save Notes
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Lesson Overview / Explanation</label>
          <p className="text-xs text-slate-400 mb-2">A brief summary shown at the top of the lesson. Helps students know what they'll learn.</p>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="In this lesson, you will learn..."
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Detailed Notes (Markdown supported)</label>
          <p className="text-xs text-slate-400 mb-2">The main lesson content. Supports Markdown formatting: headings, lists, code blocks, links, etc.</p>
          <textarea
            className="input min-h-[250px] resize-y font-mono text-sm"
            placeholder={`# Introduction\n\nWrite your lesson notes here...\n\n## Key Concepts\n\n- Point 1\n- Point 2\n\n\`\`\`python\nprint("Hello, World!")\n\`\`\``}
            value={notesMarkdown}
            onChange={e => setNotesMarkdown(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Topics & Subtopics Tab
// ============================================================
function TopicsTab({ lesson }: { lesson: Lesson }) {
  const { success, error: toastError } = useToast();
  const [topics, setTopics] = useState<(LessonTopic & { subtopics: LessonSubtopic[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [topicModal, setTopicModal] = useState<{ mode: 'create' | 'edit'; topic?: LessonTopic } | null>(null);
  const [subtopicModal, setSubtopicModal] = useState<{ mode: 'create' | 'edit'; topicId: string; subtopic?: LessonSubtopic } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'topic' | 'subtopic'; id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [topicForm, setTopicForm] = useState({ title: '', description: '' });
  const [subtopicForm, setSubtopicForm] = useState({ title: '', description: '' });

  const load = useCallback(async () => {
    const ts = await getLessonTopics(lesson.id);
    setTopics(ts);
    if (ts.length > 0) setExpanded(new Set([ts[0].id]));
    setLoading(false);
  }, [lesson.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const handleSaveTopic = async () => {
    if (!topicModal) return;
    setSaving(true);
    try {
      if (topicModal.mode === 'create') { await createTopic(lesson.id, topicForm.title, topicForm.description); success('Topic added'); }
      else if (topicModal.topic) { await updateTopic(topicModal.topic.id, { title: topicForm.title, description: topicForm.description }); success('Topic updated'); }
      setTopicModal(null); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleSaveSubtopic = async () => {
    if (!subtopicModal) return;
    setSaving(true);
    try {
      if (subtopicModal.mode === 'create') { await createSubtopic(subtopicModal.topicId, subtopicForm.title, subtopicForm.description); success('Subtopic added'); }
      else if (subtopicModal.subtopic) { await updateSubtopic(subtopicModal.subtopic.id, { title: subtopicForm.title, description: subtopicForm.description }); success('Subtopic updated'); }
      setSubtopicModal(null); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      if (deleteTarget.type === 'topic') await deleteTopic(deleteTarget.id);
      else await deleteSubtopic(deleteTarget.id);
      success('Deleted'); setDeleteTarget(null); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-900 dark:text-white">Topics & Subtopics</h3>
        <button onClick={() => { setTopicForm({ title: '', description: '' }); setTopicModal({ mode: 'create' }); }} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={12} /> Add Topic
        </button>
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No topics yet. Add your first topic.</p>
      ) : (
        <div className="space-y-2">
          {topics.map((t, idx) => (
            <div key={t.id} className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <button onClick={() => toggle(t.id)} className="text-slate-400">{expanded.has(t.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                <span className="text-xs text-slate-400 font-mono">{idx + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{t.title}</p>
                  {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                </div>
                <button onClick={() => { setTopicForm({ title: t.title, description: t.description ?? '' }); setTopicModal({ mode: 'edit', topic: t }); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><Edit2 size={12} /></button>
                <button onClick={() => setDeleteTarget({ type: 'topic', id: t.id, name: t.title })} className="p-1.5 text-red-400 hover:text-red-600 rounded"><Trash2 size={12} /></button>
              </div>
              {expanded.has(t.id) && (
                <div className="ml-8 pb-2 space-y-1">
                  {t.subtopics.map((st, sidx) => (
                    <div key={st.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg">
                      <span className="text-xs text-slate-400 font-mono">{idx + 1}.{sidx + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm text-slate-700 dark:text-slate-300">{st.title}</p>
                        {st.description && <p className="text-xs text-slate-400">{st.description}</p>}
                      </div>
                      <button onClick={() => { setSubtopicForm({ title: st.title, description: st.description ?? '' }); setSubtopicModal({ mode: 'edit', topicId: t.id, subtopic: st }); }} className="p-1 text-slate-400 hover:text-slate-600 rounded"><Edit2 size={10} /></button>
                      <button onClick={() => setDeleteTarget({ type: 'subtopic', id: st.id, name: st.title })} className="p-1 text-red-400 hover:text-red-600 rounded"><Trash2 size={10} /></button>
                    </div>
                  ))}
                  <button onClick={() => { setSubtopicForm({ title: '', description: '' }); setSubtopicModal({ mode: 'create', topicId: t.id }); }} className="text-xs text-primary-600 hover:underline flex items-center gap-1 p-1">
                    <Plus size={10} /> Add Subtopic
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!topicModal} onClose={() => setTopicModal(null)} title={topicModal?.mode === 'edit' ? 'Edit Topic' : 'New Topic'} size="sm">
        <div className="space-y-3">
          <div><label className="label">Title</label><input className="input" value={topicForm.title} onChange={e => setTopicForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Description (optional)</label><textarea className="input min-h-[60px] resize-none" value={topicForm.description} onChange={e => setTopicForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setTopicModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveTopic} disabled={saving || !topicForm.title} className="btn-primary disabled:opacity-50">{topicModal?.mode === 'edit' ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!subtopicModal} onClose={() => setSubtopicModal(null)} title={subtopicModal?.mode === 'edit' ? 'Edit Subtopic' : 'New Subtopic'} size="sm">
        <div className="space-y-3">
          <div><label className="label">Title</label><input className="input" value={subtopicForm.title} onChange={e => setSubtopicForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Description (optional)</label><textarea className="input min-h-[60px] resize-none" value={subtopicForm.description} onChange={e => setSubtopicForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setSubtopicModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveSubtopic} disabled={saving || !subtopicForm.title} className="btn-primary disabled:opacity-50">{subtopicModal?.mode === 'edit' ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete <strong>{deleteTarget?.name}</strong>?</p>
        {deleteTarget?.type === 'topic' && <p className="text-xs text-amber-600 mb-4">All subtopics within this topic will also be deleted.</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Materials Tab - NOW receives course prop for file upload
// ============================================================
function MaterialsTab({ lesson, course }: { lesson: Lesson; course: Course }) {
  const { success, error: toastError } = useToast();
  const [materials, setMaterials] = useState<LessonResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; material?: LessonResource } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonResource | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', resource_type: 'slides' as LessonResourceType, description: '', content_text: '', external_url: '', file_url: '', file_type: '', is_published: true, is_locked: false, unlock_after_session: false });

  const load = useCallback(async () => {
    const all = await getLessonMaterials(lesson.id);
    setMaterials(all.filter(m => m.resource_type !== 'recorded_video'));
    setLoading(false);
  }, [lesson.id]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      if (editModal.mode === 'create') {
        await createMaterial({ lesson_id: lesson.id, ...form, description: form.description || undefined, content_text: form.content_text || undefined, external_url: form.external_url || undefined, file_url: form.file_url || undefined, file_type: form.file_type || undefined });
        success('Material added');
      } else if (editModal.material) {
        await updateMaterial(editModal.material.id, { ...form } as any);
        success('Material updated');
      }
      setEditModal(null); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleToggleLock = async (m: LessonResource) => {
    try { await updateMaterial(m.id, { is_locked: !m.is_locked }); await load(); } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deleteMaterial(deleteTarget.id); success('Deleted'); setDeleteTarget(null); await load(); } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const typeIcons: Record<string, any> = { slides: BookOpen, notes: FileText, code_example: Code2, practice_sheet: HelpCircle, external_resource: ExternalLink };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Materials & Slides</h3>
          <p className="text-xs text-slate-400 mt-0.5">Upload slides, PDFs, documents, or link external resources.</p>
        </div>
        <button onClick={() => { setForm({ title: '', resource_type: 'slides', description: '', content_text: '', external_url: '', file_url: '', file_type: '', is_published: true, is_locked: false, unlock_after_session: false }); setEditModal({ mode: 'create' }); }} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={12} /> Add Material
        </button>
      </div>

      {materials.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No materials yet. Add slides, notes, code examples, or external resources.</p>
      ) : (
        <div className="space-y-2">
          {materials.map(m => {
            const Icon = typeIcons[m.resource_type] ?? FileText;
            return (
              <div key={m.id} className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{m.title}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="capitalize">{m.resource_type.replace('_', ' ')}</span>
                    {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline flex items-center gap-0.5"><FileText size={9} /> File</a>}
                    {m.external_url && <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-0.5"><ExternalLink size={9} /> Link</a>}
                    {m.is_locked && <span className="flex items-center gap-0.5 text-amber-500"><Lock size={9} /> Locked</span>}
                    {m.unlock_after_session && <span className="text-blue-500">Unlocks after live class</span>}
                  </div>
                </div>
                <button onClick={() => handleToggleLock(m)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  {m.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button onClick={() => { setForm({ title: m.title, resource_type: m.resource_type, description: m.description ?? '', content_text: m.content_text ?? '', external_url: m.external_url ?? '', file_url: m.file_url ?? '', file_type: m.file_type ?? '', is_published: m.is_published, is_locked: m.is_locked, unlock_after_session: m.unlock_after_session }); setEditModal({ mode: 'edit', material: m }); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 size={14} /></button>
                <button onClick={() => setDeleteTarget(m)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Material' : 'Add Material'} size="lg">
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div>
            <label className="label">Material Type</label>
            <select className="input" value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value as LessonResourceType }))}>
              <option value="slides">Slides</option>
              <option value="notes">Notes / Document</option>
              <option value="code_example">Code Example</option>
              <option value="practice_sheet">Practice Sheet</option>
              <option value="external_resource">External Resource</option>
            </select>
          </div>
          <div><label className="label">Description (optional)</label><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          {(form.resource_type === 'notes' || form.resource_type === 'code_example' || form.resource_type === 'practice_sheet') && (
            <div><label className="label">Content</label><textarea className="input min-h-[100px] resize-none font-mono text-sm" value={form.content_text} onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} /></div>
          )}
          <div className="space-y-3">
            <FileUpload
              label="Upload File"
              accept={form.resource_type === 'slides' ? ACCEPTED_FILE_TYPES.documents + ',' + ACCEPTED_FILE_TYPES.images : ACCEPTED_FILE_TYPES.all}
              maxSizeMB={100}
              currentUrl={form.file_url || null}
              currentName={form.file_type || null}
              onUpload={async (file) => {
                const result = await uploadLessonFile(course.id, lesson.id, form.resource_type, file);
                setForm(f => ({ ...f, file_url: result.publicUrl, file_type: file.name }));
                return result.publicUrl;
              }}
              onRemove={() => setForm(f => ({ ...f, file_url: '', file_type: '' }))}
              hint="PDF, PPT, DOCX, images, videos up to 100 MB"
              compact
            />
            <div>
              <label className="label">Or External URL (Google Drive, Canva, etc.)</label>
              <input className="input" placeholder="https://..." value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Published</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_locked} onChange={e => setForm(f => ({ ...f, is_locked: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Locked</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.unlock_after_session} onChange={e => setForm(f => ({ ...f, unlock_after_session: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Unlock after live class</span></label>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}{editModal?.mode === 'edit' ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete <strong>{deleteTarget?.title}</strong>?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Code Tab - with inline edit
// ============================================================
function CodeTab({ lesson, onRefresh }: { lesson: Lesson; onRefresh: () => void }) {
  const { success, error: toastError } = useToast();
  const [code, setCode] = useState(lesson.code_example ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCode(lesson.code_example ?? ''); }, [lesson.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateLesson(lesson.id, { code_example: code || null });
      success('Code saved');
      onRefresh();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Code Example</h3>
          <p className="text-xs text-slate-400 mt-0.5">Starter code shown to students. If Coding Playground is enabled, students can edit and run this.</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </div>
      <textarea
        className="input min-h-[300px] resize-y font-mono text-sm bg-slate-900 text-slate-100"
        placeholder="# Write your starter code here..."
        value={code}
        onChange={e => setCode(e.target.value)}
      />
    </div>
  );
}

// ============================================================
// Practice Questions Tab
// ============================================================
function PracticeTab({ lesson }: { lesson: Lesson }) {
  const { success, error: toastError } = useToast();
  const [questions, setQuestions] = useState<LessonPracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; q?: LessonPracticeQuestion } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonPracticeQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ question_text: '', hint: '', expected_output: '', sample_solution: '', show_solution: false, is_published: false });

  const load = useCallback(async () => { setQuestions(await getPracticeQuestions(lesson.id)); setLoading(false); }, [lesson.id]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      if (editModal.mode === 'create') {
        await createPracticeQuestion({ lesson_id: lesson.id, question_text: form.question_text, hint: form.hint || undefined, expected_output: form.expected_output || undefined, sample_solution: form.sample_solution || undefined, show_solution: form.show_solution, is_published: form.is_published });
        success('Question added');
      } else if (editModal.q) {
        await updatePracticeQuestion(editModal.q.id, { question_text: form.question_text, hint: form.hint || null, expected_output: form.expected_output || null, sample_solution: form.sample_solution || null, show_solution: form.show_solution, is_published: form.is_published });
        success('Question updated');
      }
      setEditModal(null); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deletePracticeQuestion(deleteTarget.id); success('Deleted'); setDeleteTarget(null); await load(); } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (q: LessonPracticeQuestion) => {
    try { await updatePracticeQuestion(q.id, { is_published: !q.is_published }); await load(); } catch (e: any) { toastError('Error', e.message); }
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-900 dark:text-white">Practice Questions</h3>
        <button onClick={() => { setForm({ question_text: '', hint: '', expected_output: '', sample_solution: '', show_solution: false, is_published: false }); setEditModal({ mode: 'create' }); }} className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> Add Question</button>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No practice questions yet.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Q{idx + 1}. {q.question_text}</p>
                  {q.hint && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Hint: {q.hint}</p>}
                  {q.expected_output && <p className="text-xs text-slate-400 mt-1">Expected: {q.expected_output}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`badge text-xs ${q.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>{q.is_published ? 'Published' : 'Draft'}</span>
                  <button onClick={() => handleTogglePublish(q)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">{q.is_published ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  <button onClick={() => { setForm({ question_text: q.question_text, hint: q.hint ?? '', expected_output: q.expected_output ?? '', sample_solution: q.sample_solution ?? '', show_solution: q.show_solution, is_published: q.is_published }); setEditModal({ mode: 'edit', q }); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded"><Edit2 size={12} /></button>
                  <button onClick={() => setDeleteTarget(q)} className="p-1.5 text-red-400 hover:text-red-600 rounded"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Question' : 'New Practice Question'} size="lg">
        <div className="space-y-4">
          <div><label className="label">Question</label><textarea className="input min-h-[80px] resize-none" value={form.question_text} onChange={e => setForm(f => ({ ...f, question_text: e.target.value }))} /></div>
          <div><label className="label">Hint (optional)</label><input className="input" value={form.hint} onChange={e => setForm(f => ({ ...f, hint: e.target.value }))} /></div>
          <div><label className="label">Expected Output (optional)</label><input className="input" value={form.expected_output} onChange={e => setForm(f => ({ ...f, expected_output: e.target.value }))} /></div>
          <div><label className="label">Sample Solution (optional)</label><textarea className="input min-h-[80px] resize-none font-mono text-sm bg-slate-900 text-slate-100" value={form.sample_solution} onChange={e => setForm(f => ({ ...f, sample_solution: e.target.value }))} /></div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.show_solution} onChange={e => setForm(f => ({ ...f, show_solution: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Show solution to students</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Published</span></label>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.question_text} className="btn-primary flex items-center gap-2 disabled:opacity-50">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}{editModal?.mode === 'edit' ? 'Update' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete this question?</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Quiz Tab
// ============================================================
function QuizTab({ lesson, course }: { lesson: Lesson; course: Course }) {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; quiz?: Quiz } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [form, setForm] = useState({ title: '', description: '', pass_percentage: 70, time_limit_minutes: '', is_published: false });
  const [saving, setSaving] = useState(false);

  const load = async () => { setQuizzes(await getLessonQuizzes(lesson.id)); setLoading(false); };
  useEffect(() => { load(); }, [lesson.id]);

  const openCreate = () => { setForm({ title: '', description: '', pass_percentage: 70, time_limit_minutes: '', is_published: false }); setEditModal({ mode: 'create' }); };
  const openEdit = (q: Quiz) => { setForm({ title: q.title, description: q.description ?? '', pass_percentage: q.pass_percentage, time_limit_minutes: q.time_limit_minutes?.toString() ?? '', is_published: q.is_published }); setEditModal({ mode: 'edit', quiz: q }); };

  const handleSave = async () => {
    if (!profile || !editModal) return;
    setSaving(true);
    try {
      if (editModal.mode === 'create') {
        await createQuiz({ course_id: course.id, lesson_id: lesson.id, title: form.title, description: form.description || undefined, pass_percentage: form.pass_percentage, time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null, is_published: form.is_published, created_by: profile.id });
        success('Quiz created');
      } else if (editModal.quiz) {
        await updateQuiz(editModal.quiz.id, { title: form.title, description: form.description || null, pass_percentage: form.pass_percentage, time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null, is_published: form.is_published });
        success('Quiz updated');
      }
      setEditModal(null); await load();
    } catch (e: any) { showError('Error', e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deleteQuiz(deleteTarget.id); success('Quiz deleted'); setDeleteTarget(null); await load(); }
    catch (e: any) { showError('Error', e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (q: Quiz) => {
    try { await updateQuiz(q.id, { is_published: !q.is_published }); await load(); }
    catch (e: any) { showError('Error', e.message); }
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-900 dark:text-white">Lesson Quizzes</h3>
        <button onClick={openCreate} className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> Add Quiz</button>
      </div>
      {quizzes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No quizzes for this lesson yet.</p>
      ) : (
        <div className="space-y-2">
          {quizzes.map(q => (
            <div key={q.id} className="card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{q.title}</p>
                <p className="text-xs text-slate-400">Pass: {q.pass_percentage}%{q.time_limit_minutes ? ' | ' + q.time_limit_minutes + 'min' : ''}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={"badge text-xs " + (q.is_published ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-400")}>{q.is_published ? 'Live' : 'Draft'}</span>
                <button onClick={() => handleTogglePublish(q)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{q.is_published ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                <button onClick={() => openEdit(q)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 size={12} /></button>
                <button onClick={() => setDeleteTarget(q)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Quiz' : 'Create Quiz'}>
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Description</label><textarea className="input min-h-[60px] resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Pass Percentage</label><input type="number" className="input" value={form.pass_percentage} onChange={e => setForm(f => ({ ...f, pass_percentage: Number(e.target.value) }))} /></div>
            <div><label className="label">Time Limit (min)</label><input type="number" className="input" placeholder="No limit" value={form.time_limit_minutes} onChange={e => setForm(f => ({ ...f, time_limit_minutes: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span></label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}{editModal?.mode === 'edit' ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Quiz" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete <strong>{deleteTarget?.title}</strong>? All questions and student attempts will also be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Assignment Tab
// ============================================================
function AssignmentTab({ lesson, course }: { lesson: Lesson; course: Course }) {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; assignment?: Assignment } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [form, setForm] = useState({ title: '', description: '', instructions: '', due_date: '', max_marks: 100, is_published: false });
  const [saving, setSaving] = useState(false);

  const load = async () => { setAssignments(await getLessonAssignments(lesson.id)); setLoading(false); };
  useEffect(() => { load(); }, [lesson.id]);

  const openCreate = () => { setForm({ title: '', description: '', instructions: '', due_date: '', max_marks: 100, is_published: false }); setEditModal({ mode: 'create' }); };
  const openEdit = (a: Assignment) => { setForm({ title: a.title, description: a.description ?? '', instructions: a.instructions ?? '', due_date: a.due_date ? new Date(a.due_date).toISOString().slice(0, 16) : '', max_marks: a.max_marks, is_published: a.is_published }); setEditModal({ mode: 'edit', assignment: a }); };

  const handleSave = async () => {
    if (!profile || !editModal) return;
    setSaving(true);
    try {
      if (editModal.mode === 'create') {
        await createAssignment({ course_id: course.id, chapter_id: lesson.chapter_id, lesson_id: lesson.id, title: form.title, description: form.description || undefined, instructions: form.instructions || undefined, due_date: form.due_date || null, max_marks: Number(form.max_marks) || 100, is_published: form.is_published, created_by: profile.id });
        success('Assignment created');
      } else if (editModal.assignment) {
        await updateAssignment(editModal.assignment.id, { title: form.title, description: form.description || null, instructions: form.instructions || null, due_date: form.due_date || null, max_marks: Number(form.max_marks) || 100, is_published: form.is_published });
        success('Assignment updated');
      }
      setEditModal(null); await load();
    } catch (e: any) { showError('Error', e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try { await deleteAssignment(deleteTarget.id); success('Assignment deleted'); setDeleteTarget(null); await load(); }
    catch (e: any) { showError('Error', e.message); }
    setSaving(false);
  };

  const handleTogglePublish = async (a: Assignment) => {
    try { await updateAssignment(a.id, { is_published: !a.is_published }); await load(); }
    catch (e: any) { showError('Error', e.message); }
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-900 dark:text-white">Lesson Assignments</h3>
        <button onClick={openCreate} className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> Add Assignment</button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No assignments for this lesson yet.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="card p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{a.title}</p>
                <p className="text-xs text-slate-400">Max: {a.max_marks} marks{a.due_date ? ' | Due ' + new Date(a.due_date).toLocaleDateString() : ''}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={"badge text-xs " + (a.is_published ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-400")}>{a.is_published ? 'Live' : 'Draft'}</span>
                <button onClick={() => handleTogglePublish(a)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{a.is_published ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                <button onClick={() => openEdit(a)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 size={12} /></button>
                <button onClick={() => setDeleteTarget(a)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={editModal?.mode === 'edit' ? 'Edit Assignment' : 'Create Assignment'}>
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Description</label><textarea className="input min-h-[60px] resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><label className="label">Instructions</label><textarea className="input min-h-[60px] resize-none" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Due Date</label><input type="datetime-local" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            <div><label className="label">Max Marks</label><input type="number" className="input" value={form.max_marks} onChange={e => setForm(f => ({ ...f, max_marks: Number(e.target.value) }))} /></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Publish immediately</span></label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.title} className="btn-primary flex items-center gap-2 disabled:opacity-50">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}{editModal?.mode === 'edit' ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Assignment" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Delete <strong>{deleteTarget?.title}</strong>? All student submissions will also be deleted.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={saving} className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Live Class Tab (delivery mode: live_class)
// ============================================================
function LiveClassTab({ lesson, course }: { lesson: Lesson; course: Course }) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { setSessions(await getLessonLiveSessions(lesson.id)); setLoading(false); })();
  }, [lesson.id]);

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Live Class Sessions</h3>
          <p className="text-xs text-slate-400 mt-0.5">Schedule Google Meet sessions. Students join live and you share your screen (slides, code, etc.).</p>
        </div>
        <a href={`/faculty/live-classes/create?lessonId=${lesson.id}&courseId=${course.id}`} className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> Schedule Session</a>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
        <Monitor size={14} className="flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p><strong>Live Class workflow:</strong></p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Schedule a session with Google Meet link</li>
            <li>Upload slides/materials in the Materials tab (optionally locked until session ends)</li>
            <li>Conduct the live class -- share screen, teach, interact</li>
            <li>Mark session as "Completed" to unlock materials automatically</li>
          </ol>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No live sessions scheduled yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div key={s.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{s.title}</p>
                  <p className="text-xs text-slate-400">{new Date(s.session_date).toLocaleString()} | {s.duration_minutes}min</p>
                </div>
                <span className={`badge text-xs capitalize ${s.status === 'scheduled' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : s.status === 'live' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : s.status === 'completed' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{s.status}</span>
              </div>
              {s.google_meet_url && <a href={s.google_meet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline mt-1 flex items-center gap-1"><Video size={10} /> Join Google Meet</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Recording Tab (delivery mode: recorded_video) - NOW receives course prop
// ============================================================
function RecordingTab({ lesson, course }: { lesson: Lesson; course: Course }) {
  const { success, error: toastError } = useToast();
  const [materials, setMaterials] = useState<LessonResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({ title: '', external_url: '', file_url: '', file_type: '', description: '', is_locked: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const all = await getLessonMaterials(lesson.id);
    setMaterials(all.filter(m => m.resource_type === 'recorded_video'));
    setLoading(false);
  }, [lesson.id]);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await createMaterial({ lesson_id: lesson.id, title: form.title || 'Recorded Video', resource_type: 'recorded_video', external_url: form.external_url || undefined, file_url: form.file_url || undefined, file_type: form.file_type || undefined, description: form.description || undefined, is_published: true, is_locked: form.is_locked, unlock_after_session: false });
      success('Recording added');
      setEditModal(false); setForm({ title: '', external_url: '', file_url: '', file_type: '', description: '', is_locked: false }); await load();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleToggleLock = async (m: LessonResource) => {
    try { await updateMaterial(m.id, { is_locked: !m.is_locked }); await load(); } catch (e: any) { toastError('Error', e.message); }
  };

  const handleDelete = async (m: LessonResource) => {
    try { await deleteMaterial(m.id); success('Recording deleted'); await load(); } catch (e: any) { toastError('Error', e.message); }
  };

  if (loading) return <div className="text-sm text-slate-400">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Recorded Videos</h3>
          <p className="text-xs text-slate-400 mt-0.5">Upload a video file or paste a YouTube/Drive link. Students watch at their own pace.</p>
        </div>
        <button onClick={() => setEditModal(true)} className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> Add Recording</button>
      </div>

      {materials.length === 0 ? (
        <div className="text-center py-8">
          <Film size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No recordings yet. Add your first video.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map(m => (
            <div key={m.id} className="card p-4 flex items-center gap-3">
              <Film size={18} className="text-primary-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{m.title}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  {m.file_url && <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline flex items-center gap-0.5"><FileText size={9} /> File</a>}
                  {m.external_url && <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-0.5"><ExternalLink size={9} /> {m.external_url.length > 40 ? m.external_url.slice(0, 40) + '...' : m.external_url}</a>}
                </div>
              </div>
              <span className={`badge text-xs ${m.is_locked ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>{m.is_locked ? 'Locked' : 'Unlocked'}</span>
              <button onClick={() => handleToggleLock(m)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">{m.is_locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
              <button onClick={() => handleDelete(m)} className="p-1.5 text-red-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Add Recording" size="lg">
        <div className="space-y-4">
          <div><label className="label">Title</label><input className="input" placeholder="e.g. Lesson Recording" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>

          <FileUpload
            label="Upload Video File"
            accept={ACCEPTED_FILE_TYPES.videos}
            maxSizeMB={100}
            currentUrl={form.file_url || null}
            currentName={form.file_type || null}
            onUpload={async (file) => {
              const result = await uploadLessonFile(course.id, lesson.id, 'recorded_video', file);
              setForm(f => ({ ...f, file_url: result.publicUrl, file_type: file.name }));
              return result.publicUrl;
            }}
            onRemove={() => setForm(f => ({ ...f, file_url: '', file_type: '' }))}
            hint="MP4, WebM up to 100 MB"
            compact
          />

          <div>
            <label className="label">Or External URL (YouTube, Google Drive, Vimeo)</label>
            <input className="input" placeholder="https://..." value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} />
          </div>
          <div><label className="label">Description (optional)</label><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded" checked={form.is_locked} onChange={e => setForm(f => ({ ...f, is_locked: e.target.checked }))} /><span className="text-sm text-slate-700 dark:text-slate-300">Locked (students cannot view until unlocked)</span></label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setEditModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || (!form.external_url && !form.file_url)} className="btn-primary flex items-center gap-2 disabled:opacity-50">{saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}Add Recording</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Settings Tab
// ============================================================
function SettingsTab({ lesson, onRefresh }: { lesson: Lesson; onRefresh: () => void }) {
  const { success, error: toastError } = useToast();
  const [saving, setSaving] = useState(false);
  const [teachingMode, setTeachingMode] = useState(lesson.teaching_mode ?? 'live_class');

  const handleUpdate = async (updates: Partial<Lesson>) => {
    setSaving(true);
    try {
      await updateLesson(lesson.id, updates);
      success('Updated');
      onRefresh();
    } catch (e: any) { toastError('Error', e.message); }
    setSaving(false);
  };

  const handleTeachingModeChange = async (mode: 'live_class' | 'recorded_video') => {
    setTeachingMode(mode);
    await handleUpdate({ teaching_mode: mode });
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h3 className="font-bold text-slate-900 dark:text-white">Lesson Settings</h3>

      <div className="card p-5 space-y-5">
        <div>
          <label className="label">Delivery Method</label>
          <p className="text-xs text-slate-400 mb-3">Choose how this lesson will be delivered. This changes the available tabs.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleTeachingModeChange('live_class')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium ${teachingMode === 'live_class' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
            >
              <Monitor size={20} />
              <span>Live Class</span>
              <span className="text-xs font-normal opacity-70">Google Meet + Screen Share</span>
            </button>
            <button
              onClick={() => handleTeachingModeChange('recorded_video')}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium ${teachingMode === 'recorded_video' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
            >
              <Film size={20} />
              <span>Recorded Video</span>
              <span className="text-xs font-normal opacity-70">Upload or YouTube link</span>
            </button>
          </div>
          {teachingMode === 'live_class' && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              Students attend live via Google Meet. You share your screen to present slides or code. Materials can be locked until the session ends.
            </p>
          )}
          {teachingMode === 'recorded_video' && (
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              Students watch your recorded video and access slides and notes immediately. No live session required.
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <label className="label">Coding Playground</label>
          <div className="flex items-start gap-3">
            <label className="flex items-center gap-2 cursor-pointer mt-0.5">
              <input
                type="checkbox"
                className="w-4 h-4 rounded"
                defaultChecked={lesson.enable_coding_playground}
                onChange={e => handleUpdate({ enable_coding_playground: e.target.checked })}
              />
            </label>
            <div>
              <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Enable Coding Playground</p>
              <p className="text-xs text-slate-400 mt-0.5">Students get an embedded Python editor to practice alongside the lesson.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <label className="label">XP Reward</label>
          <div className="flex items-center gap-3">
            <input type="number" className="input flex-1" defaultValue={lesson.xp_reward} onBlur={e => handleUpdate({ xp_reward: Number(e.target.value) })} />
            <span className="text-xs text-slate-400">XP awarded on completion</span>
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <label className="label">Access</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" defaultChecked={lesson.is_free_preview} onChange={e => handleUpdate({ is_free_preview: e.target.checked })} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Allow non-enrolled students to preview</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded" defaultChecked={lesson.is_published} onChange={e => handleUpdate({ is_published: e.target.checked })} />
              <span className="text-sm text-slate-700 dark:text-slate-300">Published (visible to enrolled students)</span>
            </label>
          </div>
        </div>
      </div>
      {saving && <p className="text-xs text-slate-400">Saving...</p>}
    </div>
  );
}
