import { GraduationCap, ShieldCheck, Users, ArrowLeft, Eye } from 'lucide-react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import {
  ROLE_DASHBOARDS,
  portalRolesFor,
  canSwitchPortal,
  useAuth,
} from '../../contexts/AuthContext';
import type { UserRole } from '../../types/database';

type PortalCard = {
  role: UserRole;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  color: string;
  preview?: boolean;
};

const PORTAL_META: Record<UserRole, Omit<PortalCard, 'role'>> = {
  super_admin: {
    title: 'Admin Portal',
    description: 'Manage the platform, users, courses, batches, live classes and settings.',
    icon: ShieldCheck,
    color: 'bg-violet-600',
  },
  faculty: {
    title: 'Faculty Portal',
    description: 'Build courses, lessons, live classes, assignments and quizzes, and manage students.',
    icon: Users,
    color: 'bg-blue-600',
  },
  student: {
    title: 'Student Portal',
    description: 'Learn courses, attend live classes, practise coding and complete assignments.',
    icon: GraduationCap,
    color: 'bg-emerald-600',
  },
};

export default function PortalChooserPage() {
  const { user, realRole, role, loading, switchPortal, resetPortal, profile } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen grid place-items-center">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!realRole || !canSwitchPortal(realRole)) {
    return <Navigate to={ROLE_DASHBOARDS[realRole ?? 'student']} replace />;
  }

  const options = portalRolesFor(realRole);
  const cards: PortalCard[] = [
    { role: options.primary, ...PORTAL_META[options.primary], preview: false },
    ...options.previews.map(role => ({ role, ...PORTAL_META[role], preview: true })),
  ];

  const choose = (portalRole: UserRole) => {
    if (portalRole === realRole) {
      resetPortal();
    } else {
      switchPortal(portalRole);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-14 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Back to website
          </Link>
        </div>
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-400">Portal chooser</p>
          <h1 className="mt-3 text-3xl font-bold">Choose how you want to enter</h1>
          <p className="mt-3 text-slate-400">
            Signed in as {profile?.email ?? user.email}. Your account role is{' '}
            <span className="font-semibold text-white">{realRole === 'super_admin' ? 'Super Admin' : realRole === 'faculty' ? 'Faculty' : 'Student'}</span>.
          </p>
          {role !== realRole && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-4 py-1.5 text-sm text-amber-300">
              <Eye size={14} /> Currently viewing a PREVIEW portal
            </p>
          )}
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {cards.map(card => {
            const Icon = card.icon;
            const isCurrent = role === card.role;
            return (
              <button
                key={card.role}
                onClick={() => choose(card.role)}
                className={`group relative rounded-2xl border p-6 text-left transition hover:-translate-y-1 hover:shadow-xl ${
                  isCurrent
                    ? 'border-primary-500 bg-primary-950/40 ring-1 ring-primary-500'
                    : 'border-slate-800 bg-slate-900 hover:border-primary-500'
                }`}
              >
                {card.preview && (
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                    <Eye size={10} /> Preview
                  </span>
                )}
                {!card.preview && (
                  <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                    Your portal
                  </span>
                )}
                <span className={`mb-5 grid h-12 w-12 place-items-center rounded-xl ${card.color}`}>
                  <Icon size={24} />
                </span>
                <h2 className="text-xl font-bold">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>
                <span className="mt-6 inline-block text-sm font-semibold text-primary-400">
                  {isCurrent ? 'You are here →' : card.preview ? `Preview ${card.title.replace(' Portal', '')} →` : `Enter ${card.title.replace(' Portal', '')} →`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
          <p>
            <span className="font-semibold text-slate-200">How preview works:</span> switching to another
            portal only changes which interface you see. It does not change your account role or
            permissions — every action is still authorised by your real account in the database.
          </p>
          <button
            onClick={() => { navigate(ROLE_DASHBOARDS[realRole]); }}
            className="mt-4 btn-primary text-sm inline-flex"
          >
            Go to my portal
          </button>
        </div>
      </div>
    </main>
  );
}
