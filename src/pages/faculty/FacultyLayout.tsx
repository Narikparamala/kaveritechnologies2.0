import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Video, FileText, ClipboardList, HelpCircle,
  MessageSquare, FolderKanban, Megaphone, BarChart2, Calendar, Bell, User, Settings, Users, AlertTriangle
} from 'lucide-react';
import { DashboardLayout } from '../../components/common/DashboardLayout';
import { Sidebar } from '../../components/common/Sidebar';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Courses', icon: BookOpen, to: '/courses' },
  { label: 'Live Classes', icon: Video, to: '/live-classes' },

  { label: 'Lessons', icon: FileText, to: '/lessons' },
  { label: 'Assignments', icon: ClipboardList, to: '/assignments' },
  { label: 'Question Bank', icon: HelpCircle, to: '/question-bank' },
  { label: 'Submissions', icon: MessageSquare, to: '/submissions' },
  { label: 'Quizzes', icon: HelpCircle, to: '/quizzes' },
  { label: 'Projects', icon: FolderKanban, to: '/projects' },
  { label: 'My Batches & Work', icon: Users, to: '/batches' },
  { label: 'My Students', icon: Users, to: '/students' },
  { label: 'Support Records', icon: AlertTriangle, to: '/support-records' },
  { label: 'Announcements', icon: Megaphone, to: '/announcements' },
  { label: 'Student Progress', icon: BarChart2, to: '/progress' },
  { label: 'Calendar', icon: Calendar, to: '/calendar' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Profile', icon: User, to: '/profile' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

export default function FacultyLayout() {
  return (
    <DashboardLayout sidebar={<Sidebar navItems={NAV_ITEMS} basePath="/faculty" />}>
      <Outlet />
    </DashboardLayout>
  );
}
