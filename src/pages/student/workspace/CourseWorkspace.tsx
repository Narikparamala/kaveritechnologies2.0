import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Code, BarChart3, PanelLeftOpen, PanelRightOpen, Loader2, Menu, X,
  ShieldAlert, SearchX, CloudOff,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace, type CourseError } from './WorkspaceContext';
import { CourseSidebar } from './CourseSidebar';
import { LessonContent } from './LessonContent';
import { RightPanel } from './RightPanel';
import { NextClassBanner } from './NextClassBanner';

export default function CourseWorkspace() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  if (!courseId) {
    navigate('/student/courses');
    return null;
  }

  return (
    <WorkspaceProvider courseId={courseId} initialLessonId={searchParams.get('lesson')}>
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
  const courseError = useWorkspace().courseError;
  const [mobileTab, setMobileTab] = useState<MobileTab>('lesson');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Full-page spinner ONLY for the initial course load. Background refetches
  // (markComplete -> refreshProfile -> loadCourse) keep the shell mounted so
  // the sidebar and lesson never unmount mid-session.
  if (loading && !course) {
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
    const messages: Record<CourseError, { icon: typeof SearchX; title: string; body: string; cta: string }> = {
      not_enrolled: {
        icon: ShieldAlert,
        title: 'You are not enrolled in this course yet',
        body: 'Access opens once Kaveri confirms your enrolment. If you just submitted an enrolment request, hold tight — the course will appear on your dashboard after approval.',
        cta: 'View My Courses',
      },
      not_found: {
        icon: SearchX,
        title: 'Course not found',
        body: 'This course may have been removed, or the link is no longer valid.',
        cta: 'Back to Courses',
      },
      load_failed: {
        icon: CloudOff,
        title: 'Could not load this course',
        body: 'Something went wrong while loading the course. Check your connection and try again.',
        cta: 'Retry',
      },
    };
    const info = messages[courseError ?? 'not_found'];
    const Icon = info.icon;
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-md px-6">
          <Icon className="mx-auto mb-4 text-slate-400" size={40} />
          <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{info.title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{info.body}</p>
          <button
            onClick={() => {
              if (courseError === 'load_failed') window.location.reload();
              else navigate('/student/courses');
            }}
            className="btn-primary text-sm"
          >
            {info.cta}
          </button>
        </div>
      </div>
    );
  }

  return (
    // h-dvh follows the mobile browser's visible viewport (h-screen hides
    // the bottom behind the collapsing URL bar on phones).
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
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

        {/* No course title here on purpose: the sidebar header already shows
            the course name and cover, and a second copy in the topbar was
            redundant clutter (user request). */}

        {/* Desktop: toggle buttons when panels are collapsed */}
        <div className="hidden lg:flex items-center gap-1">
          {sidebarCollapsed && (
            <button onClick={toggleSidebar} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors" title="Show sidebar">
              <PanelLeftOpen size={16} />
            </button>
          )}
        </div>

        <div className="flex-1" />

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

      {/* Next live class (batch session) — join + auto attendance */}
      <NextClassBanner courseId={course.id} />

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
