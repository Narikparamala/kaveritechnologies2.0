import { GraduationCap, ShieldCheck, Users } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { DEVELOPER_EMAIL, DEVELOPER_ROLE_KEY, ROLE_DASHBOARDS, useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types/database';

const choices: Array<{ role: UserRole; title: string; description: string; icon: typeof ShieldCheck; color: string }> = [
  { role: 'super_admin', title: 'Super Admin', description: 'Manage the complete platform, users, courses and settings.', icon: ShieldCheck, color: 'bg-violet-600' },
  { role: 'faculty', title: 'Faculty', description: 'Build courses, assignments, quizzes and real student projects.', icon: Users, color: 'bg-blue-600' },
  { role: 'student', title: 'Student', description: 'Experience courses, assignments and project workspaces as a learner.', icon: GraduationCap, color: 'bg-emerald-600' },
];

export default function DeveloperRolePage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!import.meta.env.DEV || profile?.email?.toLowerCase() !== DEVELOPER_EMAIL) return <Navigate to={ROLE_DASHBOARDS[profile?.role ?? 'student']} replace />;

  const choose = (role: UserRole) => {
    sessionStorage.setItem(DEVELOPER_ROLE_KEY, role);
    window.location.assign(ROLE_DASHBOARDS[role]);
  };

  return <main className="min-h-screen bg-slate-950 px-6 py-14 text-white">
    <div className="mx-auto max-w-5xl">
      <div className="mb-10 text-center"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-400">Developer access</p><h1 className="mt-3 text-3xl font-bold">Choose how you want to enter</h1><p className="mt-3 text-slate-400">Signed in securely as {profile.email}. This selector is available only during local development.</p></div>
      <div className="grid gap-5 md:grid-cols-3">{choices.map(choice => { const Icon = choice.icon; return <button key={choice.role} onClick={() => choose(choice.role)} className="group rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left transition hover:-translate-y-1 hover:border-primary-500 hover:shadow-xl"><span className={`mb-5 grid h-12 w-12 place-items-center rounded-xl ${choice.color}`}><Icon size={24} /></span><h2 className="text-xl font-bold">{choice.title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{choice.description}</p><span className="mt-6 inline-block text-sm font-semibold text-primary-400">Continue as {choice.title} →</span></button>; })}</div>
    </div>
  </main>;
}
