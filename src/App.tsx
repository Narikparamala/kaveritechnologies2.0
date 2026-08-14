import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PREVIEW_ROLE } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { RoleGuard } from './components/common/RoleGuard';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

// Public pages (keep eager for SEO/first-paint)
import LandingPage from './pages/public/LandingPage';
import CoursesPage from './pages/public/CoursesPage';
import CourseDetailPage from './pages/public/CourseDetailPage';
import AboutPage from './pages/public/AboutPage';
import ContactPage from './pages/public/ContactPage';
import PricingPage from './pages/public/PricingPage';
import FAQPage from './pages/public/FAQPage';
import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';

// Auth pages (keep eager)
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import AuthRedirectPage from './pages/auth/AuthRedirectPage';

// Layouts (keep eager so shell renders immediately)
import StudentLayout from './pages/student/StudentLayout';
import FacultyLayout from './pages/faculty/FacultyLayout';
import AdminLayout from './pages/admin/AdminLayout';

// Lazy-loaded student pages
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const MyCoursesPage = lazy(() => import('./pages/student/MyCoursesPage'));
const LessonPage = lazy(() => import('./pages/student/LessonPage'));
const RoadmapPage = lazy(() => import('./pages/student/RoadmapPage'));
const PlaygroundPage = lazy(() => import('./pages/student/PlaygroundPage'));
const AssignmentsPage = lazy(() => import('./pages/student/AssignmentsPage'));
const CodingPracticePage = lazy(() => import('./pages/student/CodingPracticePage'));
const QuizzesPage = lazy(() => import('./pages/student/QuizzesPage'));
const ProjectsPage = lazy(() => import('./pages/student/ProjectsPage'));
const LeaderboardPage = lazy(() => import('./pages/student/LeaderboardPage'));
const CertificatesPage = lazy(() => import('./pages/student/CertificatesPage'));
const DownloadsPage = lazy(() => import('./pages/student/DownloadsPage'));
const CalendarPage = lazy(() => import('./pages/student/CalendarPage'));
const NotesPage = lazy(() => import('./pages/student/NotesPage'));
const NotificationsPage = lazy(() => import('./pages/student/NotificationsPage'));
const ProfilePage = lazy(() => import('./pages/student/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/student/SettingsPage'));
const LiveClassesPage = lazy(() => import('./pages/student/LiveClassesPage'));
const LiveSessionDetailPage = lazy(() => import('./pages/student/LiveSessionDetailPage'));
const CourseWorkspace = lazy(() => import('./pages/student/workspace/CourseWorkspace'));
const JobsPage = lazy(() => import('./pages/student/JobsPage'));

// Lazy-loaded faculty pages
const FacultyDashboard = lazy(() => import('./pages/faculty/FacultyDashboard'));
const FacultyCoursesPage = lazy(() => import('./pages/faculty/FacultyCoursesPage'));
const SubmissionsPage = lazy(() => import('./pages/faculty/SubmissionsPage'));
const AnnouncementsPage = lazy(() => import('./pages/faculty/AnnouncementsPage'));
const StudentProgressPage = lazy(() => import('./pages/faculty/StudentProgressPage'));
const FacultyLiveClassesPage = lazy(() => import('./pages/faculty/FacultyLiveClassesPage'));
const FacultyLiveSessionFormPage = lazy(() => import('./pages/faculty/FacultyLiveSessionFormPage'));
const FacultySessionAttendancePage = lazy(() => import('./pages/faculty/FacultySessionAttendancePage'));
const FacultyStudentsPage = lazy(() => import('./pages/faculty/FacultyStudentsPage'));
const FacultyStudentDetailPage = lazy(() => import('./pages/faculty/FacultyStudentDetailPage'));
const FacultySupportRecordsPage = lazy(() => import('./pages/faculty/FacultySupportRecordsPage'));
const CourseBuilderPage = lazy(() => import('./pages/faculty/CourseBuilderPage'));
const FacultyAssignmentsPage = lazy(() => import('./pages/faculty/FacultyAssignmentsPage'));
const FacultyQuestionBankPage = lazy(() => import('./pages/faculty/FacultyQuestionBankPage'));
const FacultyAssignmentBuilderPage = lazy(() => import('./pages/faculty/FacultyAssignmentBuilderPage'));
const FacultyQuizzesPage = lazy(() => import('./pages/faculty/FacultyQuizzesPage'));
const FacultyProjectsPage = lazy(() => import('./pages/faculty/FacultyProjectsPage'));
const FacultyProjectBuilderPage = lazy(() => import('./pages/faculty/FacultyProjectBuilderPage'));
const FacultyLessonsPage = lazy(() => import('./pages/faculty/FacultyLessonsPage'));
const FacultyBatchesPage = lazy(() => import('./pages/faculty/FacultyBatchesPage'));
const FacultyCalendarPage = lazy(() => import('./pages/faculty/FacultyCalendarPage'));
const FacultyNotificationsPage = lazy(() => import('./pages/faculty/FacultyNotificationsPage'));

// Lazy-loaded admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AdminStudentsPage = lazy(() => import('./pages/admin/AdminStudentsPage'));
const AdminFacultyPage = lazy(() => import('./pages/admin/AdminFacultyPage'));
const AdminCoursesPage = lazy(() => import('./pages/admin/AdminCoursesPage'));
const CourseAssignmentsPage = lazy(() => import('./pages/admin/CourseAssignmentsPage'));
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'));
const AdminCertificatesPage = lazy(() => import('./pages/admin/AdminCertificatesPage'));
const PlatformSettingsPage = lazy(() => import('./pages/admin/PlatformSettingsPage'));
const AdminLiveClassesPage = lazy(() => import('./pages/admin/AdminLiveClassesPage'));
const AdminLiveSessionFormPage = lazy(() => import('./pages/admin/AdminLiveSessionFormPage'));
const AdminSessionAttendancePage = lazy(() => import('./pages/admin/AdminSessionAttendancePage'));
const AdminCompanyOverviewPage = lazy(() => import('./pages/admin/AdminCompanyOverviewPage'));
const AdminFacultyManagementPage = lazy(() => import('./pages/admin/AdminFacultyManagementPage'));
const AdminFacultyDetailPage = lazy(() => import('./pages/admin/AdminFacultyDetailPage'));
const AdminPayrollPage = lazy(() => import('./pages/admin/AdminPayrollPage'));
const AdminPerformanceReviewsPage = lazy(() => import('./pages/admin/AdminPerformanceReviewsPage'));
const AdminStudentManagementPage = lazy(() => import('./pages/admin/AdminStudentManagementPage'));
const AdminEnrollmentPage = lazy(() => import('./pages/admin/AdminEnrollmentPage'));
const AdminStudentDetailPage = lazy(() => import('./pages/admin/AdminStudentDetailPage'));
const AdminLessonsPage = lazy(() => import('./pages/admin/AdminLessonsPage'));
const AdminAssignmentsPage = lazy(() => import('./pages/admin/AdminAssignmentsPage'));
const AdminQuizzesPage = lazy(() => import('./pages/admin/AdminQuizzesPage'));
const AdminProjectsPage = lazy(() => import('./pages/admin/AdminProjectsPage'));
const AdminBatchesPage = lazy(() => import('./pages/admin/AdminBatchesPage'));
const AdminPlacementsPage = lazy(() => import('./pages/admin/AdminPlacementsPage'));

// Demo pages (lazy - only loaded when visiting demo routes)
const DemoStudentLayout = lazy(() => import('./pages/demo/student/DemoStudentLayout'));
const DemoStudentDashboard = lazy(() => import('./pages/demo/student/DemoStudentDashboard'));
const DemoCoursesPage = lazy(() => import('./pages/demo/student/DemoCoursesPage'));
const DemoLessonPage = lazy(() => import('./pages/demo/student/DemoLessonPage'));
const DemoPlaygroundPage = lazy(() => import('./pages/demo/student/DemoPlaygroundPage'));
const DemoLiveClassesPage = lazy(() => import('./pages/demo/student/DemoLiveClassesPage'));

const DemoFacultyLayout = lazy(() => import('./pages/demo/faculty/DemoFacultyLayout'));
const DemoAdminLayout = lazy(() => import('./pages/demo/admin/DemoAdminLayout'));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
  },
});

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-8 flex flex-col items-center justify-center h-full min-h-[400px] text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
        <span className="text-2xl">&#128679;</span>
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm">This section is coming soon.</p>
    </div>
  );
}

function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingSpinner />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<LazyFallback />}>
                <Routes>
                  {/* Preview mode: redirect root to role dashboard */}
                  {PREVIEW_ROLE === 'student' && <Route path="/" element={<Navigate to="/student/dashboard" replace />} />}
                  {PREVIEW_ROLE === 'faculty' && <Route path="/" element={<Navigate to="/faculty/dashboard" replace />} />}
                  {PREVIEW_ROLE === 'super_admin' && <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />}
                  {PREVIEW_ROLE === 'student' && <Route path="/login" element={<Navigate to="/student/dashboard" replace />} />}
                  {PREVIEW_ROLE === 'faculty' && <Route path="/login" element={<Navigate to="/faculty/dashboard" replace />} />}
                  {PREVIEW_ROLE === 'super_admin' && <Route path="/login" element={<Navigate to="/admin/dashboard" replace />} />}

                  {/* Public routes */}
                  {!PREVIEW_ROLE && <Route path="/" element={<LandingPage />} />}
                  <Route path="/courses" element={<CoursesPage />} />
                  <Route path="/courses/:slug" element={<CourseDetailPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/faq" element={<FAQPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />

                  {/* Auth routes */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/auth/redirect" element={<AuthRedirectPage />} />

                  {/* Demo routes - lazy loaded */}
                  <Route path="/demo/student" element={<DemoStudentLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<DemoStudentDashboard />} />
                    <Route path="courses" element={<DemoCoursesPage />} />
                    <Route path="lesson/:lessonSlug" element={<DemoLessonPage />} />
                    <Route path="live-classes" element={<DemoLiveClassesPage />} />
                    <Route path="playground" element={<DemoPlaygroundPage />} />
                    <Route path="*" element={<ComingSoon title="Demo Page" />} />
                  </Route>

                  <Route path="/demo/faculty" element={<DemoFacultyLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="*" element={<ComingSoon title="Demo Page" />} />
                  </Route>

                  <Route path="/demo/admin" element={<DemoAdminLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="*" element={<ComingSoon title="Demo Page" />} />
                  </Route>

                  {/* Student workspace (full-screen, own layout) */}
                  <Route path="/student/course/:courseId" element={
                    <RoleGuard allowedRoles={['student']}>
                      <CourseWorkspace />
                    </RoleGuard>
                  } />

                  {/* Student routes */}
                  <Route path="/student" element={
                    <RoleGuard allowedRoles={['student']}>
                      <StudentLayout />
                    </RoleGuard>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<StudentDashboard />} />
                    <Route path="courses" element={<MyCoursesPage />} />
                    <Route path="lesson/:lessonId" element={<LessonPage />} />
                    <Route path="live-classes" element={<LiveClassesPage />} />
                    <Route path="live-classes/:sessionId" element={<LiveSessionDetailPage />} />
                    <Route path="roadmap" element={<RoadmapPage />} />
                    <Route path="playground" element={<PlaygroundPage />} />
                    <Route path="assignments" element={<AssignmentsPage />} />
                    <Route path="assignments/:assignmentId" element={<AssignmentsPage />} />
                    <Route path="coding-practice" element={<CodingPracticePage />} />
                    <Route path="coding-practice/:questionId" element={<CodingPracticePage />} />
                    <Route path="quizzes" element={<QuizzesPage />} />
                    <Route path="projects" element={<ProjectsPage />} />
                    <Route path="jobs" element={<JobsPage />} />
                    <Route path="leaderboard" element={<LeaderboardPage />} />
                    <Route path="certificates" element={<CertificatesPage />} />
                    <Route path="downloads" element={<DownloadsPage />} />
                    <Route path="calendar" element={<CalendarPage />} />
                    <Route path="notes" element={<NotesPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="lessons" element={<MyCoursesPage />} />
                  </Route>

                  {/* Faculty routes */}
                  <Route path="/faculty" element={
                    <RoleGuard allowedRoles={['faculty']}>
                      <FacultyLayout />
                    </RoleGuard>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<FacultyDashboard />} />
                    <Route path="courses" element={<FacultyCoursesPage />} />
                    <Route path="live-classes" element={<FacultyLiveClassesPage />} />
                    <Route path="live-classes/create" element={<FacultyLiveSessionFormPage />} />
                    <Route path="live-classes/:sessionId/edit" element={<FacultyLiveSessionFormPage />} />
                    <Route path="live-classes/:sessionId/attendance" element={<FacultySessionAttendancePage />} />
                    <Route path="batches" element={<FacultyBatchesPage />} />
                    <Route path="students" element={<FacultyStudentsPage />} />
                    <Route path="students/:studentId" element={<FacultyStudentDetailPage />} />
                    <Route path="support-records" element={<FacultySupportRecordsPage />} />
                    <Route path="course-builder" element={<Navigate to="/faculty/courses" replace />} />
                    <Route path="courses/:courseId/builder" element={<CourseBuilderPage />} />
                    <Route path="lessons" element={<FacultyLessonsPage />} />
                    <Route path="assignments" element={<FacultyAssignmentsPage />} />
                    <Route path="question-bank" element={<FacultyQuestionBankPage />} />
                    <Route path="question-bank/editor/:questionId" element={<FacultyQuestionBankPage />} />
                    <Route path="assignments/new" element={<FacultyAssignmentBuilderPage />} />
                    <Route path="assignments/builder/:assignmentId" element={<FacultyAssignmentBuilderPage />} />
                    <Route path="submissions" element={<SubmissionsPage />} />
                    <Route path="quizzes" element={<FacultyQuizzesPage />} />
                    <Route path="projects" element={<FacultyProjectsPage />} />
                    <Route path="projects/new" element={<FacultyProjectBuilderPage />} />
                    <Route path="projects/:projectId/builder" element={<FacultyProjectBuilderPage />} />
                    <Route path="practice/assignments/:assignmentId" element={<AssignmentsPage />} />
                    <Route path="practice/quizzes" element={<QuizzesPage />} />
                    <Route path="practice/projects" element={<ProjectsPage />} />
                    <Route path="announcements" element={<AnnouncementsPage />} />
                    <Route path="progress" element={<StudentProgressPage />} />
                    <Route path="student-progress" element={<Navigate to="/faculty/progress" replace />} />
                    <Route path="calendar" element={<FacultyCalendarPage />} />
                    <Route path="notifications" element={<FacultyNotificationsPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>

                  {/* Admin routes */}
                  <Route path="/admin" element={
                    <RoleGuard allowedRoles={['super_admin']}>
                      <AdminLayout />
                    </RoleGuard>
                  }>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="company-overview" element={<AdminCompanyOverviewPage />} />
                    <Route path="faculty-management" element={<AdminFacultyManagementPage />} />
                    <Route path="faculty-management/:facultyId" element={<AdminFacultyDetailPage />} />
                    <Route path="student-management" element={<AdminStudentManagementPage />} />
                    <Route path="student-management/:studentId" element={<AdminStudentDetailPage />} />
                    <Route path="enrollments" element={<AdminEnrollmentPage />} />
                    <Route path="payroll" element={<AdminPayrollPage />} />
                    <Route path="performance-reviews" element={<AdminPerformanceReviewsPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="students" element={<AdminStudentsPage />} />
                    <Route path="faculty" element={<AdminFacultyPage />} />
                    <Route path="batches" element={<AdminBatchesPage />} />
                    <Route path="courses" element={<AdminCoursesPage />} />
                    <Route path="live-classes" element={<AdminLiveClassesPage />} />
                    <Route path="live-classes/create" element={<AdminLiveSessionFormPage />} />
                    <Route path="live-classes/:sessionId/edit" element={<AdminLiveSessionFormPage />} />
                    <Route path="live-classes/:sessionId/attendance" element={<AdminSessionAttendancePage />} />
                    <Route path="course-assignments" element={<CourseAssignmentsPage />} />
                    <Route path="lessons" element={<AdminLessonsPage />} />
                    <Route path="assignments" element={<AdminAssignmentsPage />} />
                    <Route path="quizzes" element={<AdminQuizzesPage />} />
                    <Route path="projects" element={<AdminProjectsPage />} />
                    <Route path="certificates" element={<AdminCertificatesPage />} />
                    <Route path="announcements" element={<AnnouncementsPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="placements" element={<AdminPlacementsPage />} />
                    <Route path="analytics" element={<AnalyticsPage />} />
                    <Route path="leaderboard" element={<LeaderboardPage />} />
                    <Route path="storage" element={<ComingSoon title="Storage Manager" />} />
                    <Route path="settings" element={<PlatformSettingsPage />} />
                    <Route path="roles" element={<ComingSoon title="Roles & Permissions" />} />
                    <Route path="profile" element={<ProfilePage />} />
                  </Route>

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
