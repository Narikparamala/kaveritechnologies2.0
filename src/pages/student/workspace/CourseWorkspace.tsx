import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Code, BarChart3, PanelLeftOpen, PanelRightOpen, Loader2, Menu, X,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { CourseSidebar } from './CourseSidebar';
import { LessonContent } from './LessonContent';
import { RightPanel } from './RightPanel';

export default function CourseWorkspace() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  if (!courseId) {
    navigate('/student/courses');
    return null;
  }

  return (
    <WorkspaceProvider courseId={courseId}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}

const MOBILE_TABS = [
  { key: 'lesson', label: 'Lesson', icon: BookOpen },
  { key: 'sidebar', label: 'Chapters', icon: Menu },
  { key: 'tools', label: 'Tools', icon: Code },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
] as const;

type MobileTab = typeof MOBILE_TABS[number]['key'];

function WorkspaceShell() {
  const navigate = useNavigate();
  const { course, loading, sidebarCollapsed, rightPanelCollapsed, toggleSidebar, toggleRightPanel } = useWorkspace();
  const [mobileTab, setMobileTab] = useState<MobileTab>('lesson');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-500 mx-auto mb-4" size={32} />
          <p className="text-sm text-slate-400">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Course not found</p>
          <button onClick={() => navigate('/student/courses')} className="btn-primary text-sm">
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Top bar - minimal, always visible */}
      <header className="h-12 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center px-4 gap-3 flex-shrink-0 z-30">
        <button
          onClick={() => navigate('/student/courses')}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          title="Back to courses"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden lg:block" />

        {/* Desktop: toggle buttons when panels are collapsed */}
        <div className="hidden lg:flex items-center gap-1">
          {sidebarCollapsed && (
            <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Show sidebar">
              <PanelLeftOpen size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{course.title}</h1>
        </div>

        <div className="hidden lg:flex items-center gap-1">
          {rightPanelCollapsed && (
            <button onClick={toggleRightPanel} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Show progress panel">
              <PanelRightOpen size={16} />
            </button>
          )}
        </div>

        {/* Mobile: hamburger for sidebar overlay */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Desktop 3-panel layout */}
      <div className="flex-1 hidden lg:flex overflow-hidden">
        {/* Left sidebar */}
        <div
          className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
            sidebarCollapsed ? 'w-0' : 'w-72'
          }`}
        >
          <div className="w-72 h-full">
            <CourseSidebar />
          </div>
        </div>

        {/* Center - main lesson content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <LessonContent />
        </div>

        {/* Right panel */}
        <div
          className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
            rightPanelCollapsed ? 'w-0' : 'w-96'
          }`}
        >
          <div className="w-96 h-full">
            <RightPanel />
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex-1 lg:hidden flex flex-col overflow-hidden">
        {/* Mobile content area */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'lesson' && <LessonContent />}
          {mobileTab === 'sidebar' && <CourseSidebar />}
          {mobileTab === 'tools' && <RightPanel />}
          {mobileTab === 'progress' && <RightPanel />}
        </div>

        {/* Mobile tab bar */}
        <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex safe-area-bottom">
          {MOBILE_TABS.map(tab => {
            const isActive = mobileTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setMobileTab(tab.key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <tab.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span className={`text-[10px] ${isActive ? 'font-semibold' : ''}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] z-50 lg:hidden animate-slide-in-left">
            <div className="h-full relative">
              <CourseSidebar />
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 text-slate-500 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
