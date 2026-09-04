import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Video, Map, FileText, HelpCircle,
  FolderKanban, Trophy, Award, Download, Calendar, BookMarked, Bell, User, Settings, Briefcase, Terminal
} from 'lucide-react';
import { DashboardLayout } from '../../components/common/DashboardLayout';
import { Sidebar } from '../../components/common/Sidebar';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Courses', icon: BookOpen, to: '/courses' },
  { label: 'Live Classes', icon: Video, to: '/live-classes' },
  { label: 'My Journey', icon: Map, to: '/roadmap' },
  { label: 'Code Playground', icon: Terminal, to: '/playground' },
  { label: 'Coding Practice', icon: Terminal, to: '/coding-practice' },
  { label: 'Assignments', icon: FileText, to: '/assignments' },
  { label: 'Quizzes', icon: HelpCircle, to: '/quizzes' },
  { label: 'Projects', icon: FolderKanban, to: '/projects' },
  { label: 'Jobs & Placements', icon: Briefcase, to: '/jobs' },
  { label: 'Leaderboard', icon: Trophy, to: '/leaderboard' },
  { label: 'Certificates', icon: Award, to: '/certificates' },
  { label: 'Downloads', icon: Download, to: '/downloads' },
  { label: 'Calendar', icon: Calendar, to: '/calendar' },
  { label: 'Notes & Bookmarks', icon: BookMarked, to: '/notes' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Profile', icon: User, to: '/profile' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

export default function StudentLayout() {
  return (
    <DashboardLayout sidebar={<Sidebar navItems={NAV_ITEMS} basePath="/student" />}>
      <Outlet />
    </DashboardLayout>
  );
}
