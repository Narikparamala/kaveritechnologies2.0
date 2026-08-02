import { useState, useEffect } from 'react';
import { Download, FileText, Loader2, ExternalLink, File, Video, Code } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { LessonResource } from '../../types/database';

interface ResourceWithMeta extends LessonResource {
  lessonTitle: string;
  courseTitle: string;
}

const RESOURCE_ICONS: Record<string, typeof FileText> = {
  slides: FileText,
  notes: File,
  code_example: Code,
  recorded_video: Video,
  practice_sheet: FileText,
  external_resource: ExternalLink,
};

export default function DownloadsPage() {
  const { profile } = useAuth();
  const [resources, setResources] = useState<ResourceWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!profile) return;
    loadResources();
  }, [profile]);

  async function loadResources() {
    if (!profile) return;
    setLoading(true);
    try {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('course_id, courses(title)')
        .eq('student_id', profile.id)
        .eq('access_status', 'active');

      if (!enrollments?.length) { setResources([]); return; }

      const courseIds = enrollments.map(e => e.course_id);
      const courseMap = new Map(enrollments.map(e => [e.course_id, (e as any).courses?.title ?? 'Unknown']));

      const { data: lessons } = await supabase
        .from('lessons')
        .select('id, title, course_id')
        .in('course_id', courseIds)
        .eq('is_published', true);

      if (!lessons?.length) { setResources([]); return; }

      const lessonIds = lessons.map(l => l.id);
      const lessonMap = new Map(lessons.map(l => [l.id, { title: l.title, courseId: l.course_id }]));

      const { data: rawResources } = await supabase
        .from('lesson_resources')
        .select('*')
        .in('lesson_id', lessonIds)
        .eq('is_published', true)
        .eq('is_locked', false)
        .order('created_at', { ascending: false });

      const items: ResourceWithMeta[] = (rawResources ?? []).map(r => {
        const lesson = lessonMap.get(r.lesson_id);
        return {
          ...r,
          lessonTitle: lesson?.title ?? 'Unknown',
          courseTitle: lesson ? (courseMap.get(lesson.courseId) ?? 'Unknown') : 'Unknown',
        };
      });

      setResources(items);
    } catch {
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === 'all' ? resources : resources.filter(r => r.resource_type === filter);
  const types = [...new Set(resources.map(r => r.resource_type))];

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <PageHeader title="Downloads" subtitle="Access your downloadable course resources" icon={Download} />

      {resources.length === 0 ? (
        <EmptyState icon={Download} title="No downloads available" description="Enroll in courses to access downloadable resources." />
      ) : (
        <>
          {types.length > 1 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                All ({resources.length})
              </button>
              {types.map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === t ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  {t.replace(/_/g, ' ')} ({resources.filter(r => r.resource_type === t).length})
                </button>
              ))}
            </div>
          )}

          <div className="card divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(r => {
              const Icon = RESOURCE_ICONS[r.resource_type] ?? FileText;
              const url = r.file_url || r.external_url;
              return (
                <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{r.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {r.courseTitle} &middot; {r.lessonTitle} &middot; <span className="capitalize">{r.resource_type.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                    >
                      {r.external_url ? <ExternalLink size={12} /> : <Download size={12} />}
                      {r.external_url ? 'Open' : 'Download'}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
