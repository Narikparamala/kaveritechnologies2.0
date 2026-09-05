import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Video, Link2, FileText,
  ClipboardList, HelpCircle, FolderKanban, Award, Megaphone, Bell,
  BarChart2, Trophy, Settings, User, Building2, DollarSign, UserCheck, Briefcase, Inbox,
  CalendarCheck2
} from 'lucide-react';
import { DashboardLayout } from '../../components/common/DashboardLayout';
import { Sidebar } from '../../components/common/Sidebar';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Company Overview', icon: Building2, to: '/company-overview' },
  { label: 'Users & Permissions', icon: Users, to: '/users' },
  { label: 'Students', icon: GraduationCap, to: '/student-management' },
  { label: 'Enrollments', icon: UserCheck, to: '/enrollments' },
  { label: 'Enrollment Requests', icon: Inbox, to: '/enrollments/requests' },
  { label: 'Workshops', icon: CalendarCheck2, to: '/workshops' },
  { label: 'Offline Exams', icon: FileText, to: '/offline-exams' },
  { label: 'Faculty', icon: UserCheck, to: '/faculty-management' },
  { label: 'Payroll', icon: DollarSign, to: '/payroll' },
  { label: 'Performance', icon: BarChart2, to: '/performance-reviews' },
  { label: 'Batches', icon: Users, to: '/batches' },
  { label: 'Courses', icon: BookOpen, to: '/courses' },
  { label: 'Live Classes', icon: Video, to: '/live-classes' },
  { label: 'Course Assignments', icon: Link2, to: '/course-assignments' },
  { label: 'Lessons', icon: FileText, to: '/lessons' },
  { label: 'Assignments', icon: ClipboardList, to: '/assignments' },
  { label: 'Quizzes', icon: HelpCircle, to: '/quizzes' },
  { label: 'Projects', icon: FolderKanban, to: '/projects' },
  { label: 'Certificates', icon: Award, to: '/certificates' },
  { label: 'Announcements', icon: Megaphone, to: '/announcements' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Placements', icon: Briefcase, to: '/placements' },
  { label: 'Analytics', icon: BarChart2, to: '/analytics' },
  { label: 'Leaderboard', icon: Trophy, to: '/leaderboard' },
  { label: 'Platform Settings', icon: Settings, to: '/settings' },
  { label: 'Profile', icon: User, to: '/profile' },
];

export default function AdminLayout() {
  return (
    <DashboardLayout sidebar={<Sidebar navItems={NAV_ITEMS} basePath="/admin" showPortalSwitch />}>
      <Outlet />
    </DashboardLayout>
  );
}
