import { useEffect, useState } from 'react';
import { GraduationCap, Search } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/database';

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'student').order('xp_points', { ascending: false })
      .then(({ data }) => { setStudents((data ?? []) as Profile[]); setLoading(false); });
  }, []);

  const filtered = students.filter(s =>
    (s.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Students" subtitle={`${students.length} registered students`} icon={GraduationCap} />

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-11" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map(s => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary-700 dark:text-primary-400">{s.full_name?.charAt(0) ?? 'S'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white truncate">{s.full_name}</p>
                <p className="text-xs text-slate-400 truncate">{s.email}</p>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-xs text-slate-500">
                <div className="text-center">
                  <p className="font-bold text-slate-900 dark:text-white">{s.xp_points.toLocaleString()}</p>
                  <p>XP</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-900 dark:text-white">Lv.{s.level}</p>
                  <p>Level</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-900 dark:text-white">{s.streak_days}</p>
                  <p>Streak</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
