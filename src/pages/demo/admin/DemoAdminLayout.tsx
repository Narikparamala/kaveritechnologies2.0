import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Link2, FileText,
  ClipboardList, HelpCircle, FolderKanban, Award, Megaphone, Bell,
  BarChart2, Trophy, HardDrive, Settings, Shield, User
} from 'lucide-react';
import { DemoSidebar } from '../../../components/demo/DemoSidebar';
import { DemoBanner } from '../../../components/demo/DemoBanner';
import { AuthRequiredModal } from '../../../components/demo/AuthRequiredModal';
import { DemoProvider, useDemo } from '../../../contexts/DemoContext';
import { cn } from '../../../lib/utils';
import { DEMO_ADMIN } from '../../../data/demoData';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Users', icon: Users, to: '/users' },
  { label: 'Students', icon: GraduationCap, to: '/students' },
  { label: 'Faculty', icon: Users, to: '/faculty' },
  { label: 'Courses', icon: BookOpen, to: '/courses' },
  { label: 'Course Assignments', icon: Link2, to: '/course-assignments' },
  { label: 'Assignments', icon: ClipboardList, to: '/assignments' },
  { label: 'Quizzes', icon: HelpCircle, to: '/quizzes' },
  { label: 'Projects', icon: FolderKanban, to: '/projects' },
  { label: 'Certificates', icon: Award, to: '/certificates' },
  { label: 'Announcements', icon: Megaphone, to: '/announcements' },
  { label: 'Analytics', icon: BarChart2, to: '/analytics' },
  { label: 'Leaderboard', icon: Trophy, to: '/leaderboard' },
  { label: 'Storage', icon: HardDrive, to: '/storage' },
  { label: 'Platform Settings', icon: Settings, to: '/settings' },
  { label: 'Roles & Permissions', icon: Shield, to: '/roles' },
  { label: 'Profile', icon: User, to: '/profile' },
];

function Inner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const demo = useDemo()!;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <DemoBanner />
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside className={cn('fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
          <button className="absolute top-4 right-4 lg:hidden p-2 rounded-xl hover:bg-slate-100" onClick={() => setSidebarOpen(false)}><X size={18} className="text-slate-500" /></button>
          <DemoSidebar navItems={NAV_ITEMS} basePath="/demo/admin" identity={{ name: DEMO_ADMIN.full_name, email: DEMO_ADMIN.email, roleLabel: 'Super Admin · Demo' }} />
        </aside>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><Menu size={20} className="text-slate-600 dark:text-slate-400" /></button>
            <span className="font-semibold text-slate-900 dark:text-white">Admin Demo</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">DEMO</span>
          </div>
          <main className="flex-1 overflow-y-auto"><Outlet /></main>
        </div>
      </div>
      <AuthRequiredModal open={demo.showAuthModal} onClose={demo.closeAuthModal} />
    </div>
  );
}

export default function DemoAdminLayout() {
  return (
    <DemoProvider role="admin">
      <Inner />
    </DemoProvider>
  );
}
