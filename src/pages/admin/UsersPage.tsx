import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { DeleteUserModal } from '../../components/admin/DeleteUserModal';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import {
  listPlatformUsers,
  setPlatformUserActive,
  setPlatformUserRole,
} from '../../services/userAdministration';
import {
  listDeletionRequests,
  reviewDeletionRequest,
  type DeletionRequest,
} from '../../services/userDeletion';
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
  // Hard delete (feature/hard-delete-user): new state only — existing flows untouched.
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

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

  // Hard delete requests filed by faculty (feature/hard-delete-user).
  const loadDeletionRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      setDeletionRequests(await listDeletionRequests('pending'));
    } catch (caught) {
      if (import.meta.env.DEV) console.error('Failed to load deletion requests:', caught);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeletionRequests();
  }, [loadDeletionRequests]);

  const reviewRequest = async (request: DeletionRequest, decision: 'approved' | 'rejected') => {
    const confirmed = window.confirm(
      decision === 'approved'
        ? `Approve deletion of ${request.target_name ?? request.target_email}? The account and all of its data will be permanently removed.`
        : `Reject the deletion request for ${request.target_name ?? request.target_email}?`,
    );
    if (!confirmed) return;
    setReviewingRequestId(request.id);
    try {
      await reviewDeletionRequest({ requestId: request.id, decision });
      setDeletionRequests(current => current.filter(r => r.id !== request.id));
      if (decision === 'approved') {
        setUsers(current => current.filter(user => user.id !== request.target_user_id));
        success('Account deleted', `${request.target_name ?? request.target_email} was permanently removed.`);
      } else {
        success('Request rejected', 'The account was left untouched.');
      }
    } catch (caught) {
      toastError(
        'Review failed',
        caught instanceof Error ? caught.message : 'Please try again.',
      );
    } finally {
      setReviewingRequestId(null);
    }
  };

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

      {/* Deletion requests filed by faculty (feature/hard-delete-user) — new section only. */}
      {deletionRequests.length > 0 && (
        <div className="card p-5 mb-6 border-amber-200 dark:border-amber-800">
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm mb-1">
            Deletion requests from faculty ({deletionRequests.length})
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Faculty cannot delete accounts directly — they ask here. Approving permanently deletes the account and all of its data.
          </p>
          <div className="space-y-3">
            {deletionRequests.map(request => (
              <div key={request.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className="font-medium text-sm text-slate-900 dark:text-white">
                  {request.target_name || 'Unnamed user'} <span className="font-normal text-slate-500">({request.target_email} · {request.target_role.replace('_', ' ')})</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">Reason: {request.reason}</p>
                {request.ai_report && (
                  <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">Report: {request.ai_report}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Requested by {request.requested_by_profile?.full_name ?? request.requested_by_profile?.email ?? 'a faculty member'} · {formatDate(request.created_at)}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    disabled={reviewingRequestId === request.id}
                    onClick={() => void reviewRequest(request, 'approved')}
                    className="py-1.5 px-3 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    {reviewingRequestId === request.id ? 'Working…' : 'Approve & delete'}
                  </button>
                  <button
                    type="button"
                    disabled={reviewingRequestId === request.id}
                    onClick={() => void reviewRequest(request, 'rejected')}
                    className="btn-secondary text-xs"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          {requestsLoading && <p className="text-xs text-slate-400 mt-2">Refreshing requests…</p>}
        </div>
      )}

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

                  <button
                    type="button"
                    disabled={busy || isCurrentAdmin}
                    onClick={() => setDeleteTarget(user)}
                    className="btn-ghost text-xs text-red-600 hover:text-red-700"
                  >
                    <span className="flex items-center gap-1.5">
                      <Trash2 size={14} /> Delete
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hard delete (feature/hard-delete-user) — new modal only. */}
      <DeleteUserModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        target={deleteTarget}
        mode="delete"
        onDeleted={deleted => {
          setUsers(current => current.filter(user => user.id !== deleted.id));
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
