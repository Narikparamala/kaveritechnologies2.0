import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, Circle, BookOpen, Clock, Zap, PanelLeftClose, Video, FileText, Code, Monitor } from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';

export function CourseSidebar() {
  const { course, chapters, currentLesson, progress, courseProgress, selectLesson, toggleSidebar, sidebarCollapsed } = useWorkspace();
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
    if (!currentLesson) return new Set();
    return new Set([currentLesson.chapter_id]);
  });

  if (!course) return null;

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const completedCount = chapters.reduce((s, ch) => s + ch.lessons.filter(l => progress.has(l.id)).length, 0);
  const totalCount = chapters.reduce((s, ch) => s + ch.lessons.length, 0);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800">
      {/* Course header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-2">{course.title}</h2>
          <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 flex-shrink-0 hidden lg:flex" title="Collapse sidebar">
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span>{completedCount}/{totalCount} lessons</span>
          <span className="text-slate-300">|</span>
          <span>{Math.round(courseProgress)}% complete</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-teal-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(courseProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* Chapters & Lessons */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {chapters.map(chapter => {
          const isExpanded = expandedChapters.has(chapter.id);
          const chCompleted = chapter.lessons.filter(l => progress.has(l.id)).length;
          const isCurrentChapter = currentLesson?.chapter_id === chapter.id;

          return (
            <div key={chapter.id}>
              <button
                onClick={() => toggleChapter(chapter.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isCurrentChapter ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}
              >
                {isExpanded ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{chapter.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{chCompleted}/{chapter.lessons.length} completed</p>
                </div>
                {chCompleted === chapter.lessons.length && chapter.lessons.length > 0 && (
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="pb-1">
                  {chapter.lessons.map(lesson => {
                    const isActive = currentLesson?.id === lesson.id;
                    const isCompleted = progress.has(lesson.id);

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => selectLesson(lesson.id)}
                        className={`w-full text-left pl-9 pr-3 py-2 flex items-center gap-2.5 transition-all group ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <CheckCircle size={14} className="text-emerald-500" />
                          ) : isActive ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-500 bg-primary-500/20" />
                          ) : (
                            <Circle size={14} className="text-slate-300 dark:text-slate-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs leading-relaxed truncate ${
                              isActive ? 'font-semibold text-primary-700 dark:text-primary-400' :
                              isCompleted ? 'text-slate-500 dark:text-slate-400' :
                              'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                            }`}>{lesson.title}</p>
                            {lesson.teaching_mode === 'live_class' && (
                              <Monitor size={10} className="text-blue-500 flex-shrink-0" title="Live Class" />
                            )}
                            {lesson.teaching_mode === 'recorded_video' && (
                              <Video size={10} className="text-sky-500 flex-shrink-0" title="Video" />
                            )}
                            {lesson.enable_coding_playground && (
                              <Code size={10} className="text-teal-500 flex-shrink-0" title="Coding" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Clock size={8} /> {lesson.duration_minutes}m
                            </span>
                            {lesson.xp_reward > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                                <Zap size={8} /> {lesson.xp_reward}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
