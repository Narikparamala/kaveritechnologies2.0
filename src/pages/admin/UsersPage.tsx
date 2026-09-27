import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import {
  listPlatformUsers,
  setPlatformUserActive,
  setPlatformUserRole,
} from '../../services/userAdministration';
import type { Profile, UserRole } from '../../types/database';

const ROLE_OPTIONS: UserRole[] = ['student', 'faculty', 'super_admin'];

const ROLE_BADGES: Record<
  UserRole,
  'default' | 'teal' | 'error'
> = {
  student: 'default',
  faculty: 'teal',
  super_admin: 'error',
};

const ROLE_ICONS = {
  student: GraduationCap,
  faculty: BookOpen,
  super_admin: Shield,
} satisfies Record<UserRole, typeof Shield>;

export default function UsersPage() {
  const { profile: currentAdmin } = useAuth();
  const { success, error: toastError } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await listPlatformUsers());
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Could not load platform users.';
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const replaceUser = (updated: Profile) => {
    setUsers(current =>
      current.map(user => (user.id === updated.id ? updated : user)),
    );
  };

  const changeRole = async (user: Profile, role: UserRole) => {
    if (role === user.role) return;
    if (user.id === currentAdmin?.id) {
      toastError(
        'Action blocked',
        'For safety, a Super Admin cannot change their own role.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Change ${user.full_name ?? user.email} from ${user.role.replace('_', ' ')} to ${role.replace('_', ' ')}?`,
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    try {
      replaceUser(await setPlatformUserRole(user.id, role));
      success('Role updated', 'The new permission level is now active.');
    } catch (caught) {
      toastError(
        'Role update failed',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const changeAccountStatus = async (user: Profile) => {
    if (user.id === currentAdmin?.id) {
      toastError(
        'Action blocked',
        'For safety, a Super Admin cannot deactivate their own account.',
      );
      return;
    }

    const nextActive = !user.is_active;
    const confirmed = window.confirm(
      `${nextActive ? 'Reactivate' : 'Deactivate'} ${user.full_name ?? user.email}?`,
    );
    if (!confirmed) return;

    setBusyUserId(user.id);
    try {
      replaceUser(await setPlatformUserActive(user.id, nextActive));
      success(
        nextActive ? 'Account reactivated' : 'Account deactivated',
        nextActive
          ? 'The user can access the LMS again.'
          : 'The user is now blocked from protected LMS pages.',
      );
    } catch (caught) {
      toastError(
        'Account update failed',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = users.filter(user => {
    const matchesSearch =
      !normalizedSearch ||
      (user.full_name ?? '').toLowerCase().includes(normalizedSearch) ||
      user.email.toLowerCase().includes(normalizedSearch);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Users & Permissions"
        subtitle={`${users.length} platform account${users.length === 1 ? '' : 's'}`}
        icon={Users}
        action={
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-11"
            placeholder="Search by name or email…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', ...ROLE_OPTIONS] as const).map(role => (
            <button
              type="button"
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                roleFilter === role
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(item => (
            <div
              key={item}
              className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : loadError ? (
        <EmptyState
          icon={UserX}
          title="Could not load users"
          description={loadError}
          action={
            <button onClick={() => void loadUsers()} className="btn-primary">
              Try again
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(user => {
            const RoleIcon = ROLE_ICONS[user.role];
            const busy = busyUserId === user.id;
            const isCurrentAdmin = user.id === currentAdmin?.id;

            return (
              <div
                key={user.id}
                className="flex flex-col xl:flex-row xl:items-center gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-primary-700 dark:text-primary-400">
                        {user.full_name?.charAt(0).toUpperCase() ?? 'U'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">
                      {user.full_name || 'Unnamed user'}
                      {isCurrentAdmin && (
                        <span className="ml-2 text-xs text-primary-600">You</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Joined {formatDate(user.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <Badge
                    variant={ROLE_BADGES[user.role]}
                    className="capitalize text-xs"
                  >
                    <RoleIcon size={10} className="mr-1" />
                    {user.role.replace('_', ' ')}
                  </Badge>
                  <Badge
                    variant={user.is_active ? 'success' : 'default'}
                    className="text-xs"
                  >
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>

                  <select
                    aria-label={`Role for ${user.full_name ?? user.email}`}
                    value={user.role}
                    disabled={busy || isCurrentAdmin}
                    onChange={event =>
                      void changeRole(user, event.target.value as UserRole)
                    }
                    className="input !py-2 !w-auto text-xs capitalize"
                  >
                    {ROLE_OPTIONS.map(role => (
                      <option key={role} value={role}>
                        {role.replace('_', ' ')}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={busy || isCurrentAdmin}
                    onClick={() => void changeAccountStatus(user)}
                    className={user.is_active ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : user.is_active ? (
                      <span className="flex items-center gap-1.5">
                        <UserX size={14} /> Deactivate
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <UserCheck size={14} /> Reactivate
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
