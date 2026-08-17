import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import {
  LayoutDashboard, BookOpen, Video, Map, Terminal, Code, FileText, HelpCircle,
  FolderKanban, Trophy, Award, Download, Calendar, BookMarked, Bell, User, Settings
} from 'lucide-react';
import { DemoSidebar } from '../../../components/demo/DemoSidebar';
import { DemoBanner } from '../../../components/demo/DemoBanner';
import { AuthRequiredModal } from '../../../components/demo/AuthRequiredModal';
import { DemoProvider, useDemo } from '../../../contexts/DemoContext';
import { cn } from '../../../lib/utils';
import { DEMO_STUDENT } from '../../../data/demoData';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Courses', icon: BookOpen, to: '/courses' },
  { label: 'Live Classes', icon: Video, to: '/live-classes' },
  { label: 'Learning Roadmap', icon: Map, to: '/roadmap' },
  { label: 'Python Playground', icon: Terminal, to: '/playground' },
  { label: 'Code Sandbox', icon: Code, to: '/sandbox' },
  { label: 'Assignments', icon: FileText, to: '/assignments' },
  { label: 'Quizzes', icon: HelpCircle, to: '/quizzes' },
  { label: 'Projects', icon: FolderKanban, to: '/projects' },
  { label: 'Leaderboard', icon: Trophy, to: '/leaderboard' },
  { label: 'Certificates', icon: Award, to: '/certificates' },
  { label: 'Downloads', icon: Download, to: '/downloads' },
  { label: 'Calendar', icon: Calendar, to: '/calendar' },
  { label: 'Notes & Bookmarks', icon: BookMarked, to: '/notes' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Profile', icon: User, to: '/profile' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

function Inner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const demo = useDemo()!;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <DemoBanner />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <button className="absolute top-4 right-4 lg:hidden p-2 rounded-xl hover:bg-slate-100" onClick={() => setSidebarOpen(false)}>
            <X size={18} className="text-slate-500" />
          </button>
          <DemoSidebar
            navItems={NAV_ITEMS}
            basePath="/demo/student"
            identity={{ name: DEMO_STUDENT.full_name, email: DEMO_STUDENT.email, roleLabel: 'Student · Demo' }}
          />
        </aside>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu size={20} className="text-slate-600 dark:text-slate-400" />
            </button>
            <span className="font-semibold text-slate-900 dark:text-white">Kaveri Academy</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span>
          </div>
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <AuthRequiredModal open={demo.showAuthModal} onClose={demo.closeAuthModal} />
    </div>
  );
}

export default function DemoStudentLayout() {
  return (
    <DemoProvider role="student">
      <Inner />
    </DemoProvider>
  );
}
