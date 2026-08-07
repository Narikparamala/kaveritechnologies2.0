import { useEffect, useState } from 'react';
import { BookMarked, Trash2, Edit2, Save, BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../lib/utils';
import type { LessonNote, LessonBookmark, Lesson } from '../../types/database';

type NoteWithLesson = LessonNote & { lesson: Lesson };
type BookmarkWithLesson = LessonBookmark & { lesson: Lesson };

export default function NotesPage() {
  const { profile } = useAuth();
  const { success } = useToast();
  const [notes, setNotes] = useState<NoteWithLesson[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkWithLesson[]>([]);
  const [tab, setTab] = useState<'notes' | 'bookmarks'>('notes');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const [{ data: n }, { data: b }] = await Promise.all([
        supabase.from('lesson_notes').select('*, lesson:lessons(*)').eq('student_id', profile.id).order('updated_at', { ascending: false }),
        supabase.from('lesson_bookmarks').select('*, lesson:lessons(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      ]);
      setNotes((n ?? []) as any);
      setBookmarks((b ?? []) as any);
      setLoading(false);
    };
    load();
  }, [profile]);

  const saveNote = async (noteId: string) => {
    await supabase.from('lesson_notes').update({ content: editContent }).eq('id', noteId);
    setNotes(notes.map(n => n.id === noteId ? { ...n, content: editContent } : n));
    setEditingNote(null);
    success('Note updated!');
  };

  const deleteNote = async (noteId: string) => {
    await supabase.from('lesson_notes').delete().eq('id', noteId);
    setNotes(notes.filter(n => n.id !== noteId));
    success('Note deleted');
  };

  const removeBookmark = async (bId: string, lessonId: string) => {
    await supabase.from('lesson_bookmarks').delete().eq('id', bId);
    setBookmarks(bookmarks.filter(b => b.id !== bId));
    success('Bookmark removed');
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Notes & Bookmarks" subtitle="Your personal study notes and bookmarked lessons" icon={BookMarked} />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['notes', 'bookmarks'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            {t} {t === 'notes' ? `(${notes.length})` : `(${bookmarks.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : tab === 'notes' ? (
        notes.length === 0 ? (
          <EmptyState icon={BookMarked} title="No notes yet" description="Add notes while studying lessons to see them here." />
        ) : (
          <div className="space-y-4">
            {notes.map(note => (
              <div key={note.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mb-0.5">{note.lesson?.title}</p>
                    <p className="text-xs text-slate-400">{formatRelativeTime(note.updated_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingNote(note.id); setEditContent(note.content); }} className="btn-ghost py-1 px-2"><Edit2 size={14} /></button>
                    <button onClick={() => deleteNote(note.id)} className="btn-ghost py-1 px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                  </div>
                </div>
                {editingNote === note.id ? (
                  <div className="space-y-2">
                    <textarea className="input text-sm min-h-[100px] resize-none" value={editContent} onChange={e => setEditContent(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => saveNote(note.id)} className="btn-primary text-sm py-1.5 px-4 flex items-center gap-1"><Save size={13} /> Save</button>
                      <button onClick={() => setEditingNote(null)} className="btn-secondary text-sm py-1.5 px-4">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        bookmarks.length === 0 ? (
          <EmptyState icon={BookOpen} title="No bookmarks yet" description="Bookmark lessons while studying to access them quickly." />
        ) : (
          <div className="space-y-3">
            {bookmarks.map(bm => (
              <div key={bm.id} className="card p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={16} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{bm.lesson?.title}</p>
                  <p className="text-xs text-slate-400">{formatRelativeTime(bm.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`/student/lesson/${bm.lesson_id}`} className="btn-primary text-xs py-1.5 px-3">Open</a>
                  <button onClick={() => removeBookmark(bm.id, bm.lesson_id)} className="btn-ghost py-1.5 px-2 text-red-500"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
