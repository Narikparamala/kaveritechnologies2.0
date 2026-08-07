import { useEffect, useState } from 'react';
import { Users, Search, MoreVertical, Shield, GraduationCap, BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { Profile, UserRole } from '../../types/database';

export default function UsersPage() {
  const { success } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setUsers((data ?? []) as Profile[]); setLoading(false); });
  }, []);

  const changeRole = async (userId: string, role: UserRole) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (!error) {
      setUsers(us => us.map(u => u.id === userId ? { ...u, role } : u));
      success('Role updated!');
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const ROLE_BADGES: Record<string, any> = {
    student: 'default',
    faculty: 'teal',
    super_admin: 'error',
  };

  const ROLE_ICONS: Record<string, any> = {
    student: GraduationCap,
    faculty: BookOpen,
    super_admin: Shield,
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="All Users" subtitle={`${users.length} total users`} icon={Users} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-11" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['all', 'student', 'faculty', 'super_admin'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors ${roleFilter === r ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
              {r.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(u => {
            const RoleIcon = ROLE_ICONS[u.role] ?? GraduationCap;
            return (
              <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary-700 dark:text-primary-400">{u.full_name?.charAt(0) ?? 'U'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{u.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
                  <span>{formatDate(u.created_at)}</span>
                  <span>{u.xp_points.toLocaleString()} XP</span>
                </div>
                <Badge variant={ROLE_BADGES[u.role] ?? 'default'} className="capitalize text-xs hidden sm:inline-flex">
                  <RoleIcon size={10} className="mr-1" /> {u.role.replace('_', ' ')}
                </Badge>
                <div className="relative group">
                  <button className="btn-ghost py-1.5 px-2"><MoreVertical size={14} /></button>
                  <div className="absolute right-0 top-8 z-10 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                    {(['student', 'faculty', 'super_admin'] as UserRole[]).filter(r => r !== u.role).map(r => (
                      <button key={r} onClick={() => changeRole(u.id, r)} className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 capitalize">
                        Set as {r.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
