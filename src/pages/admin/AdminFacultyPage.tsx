import { useEffect, useState } from 'react';
import { Users, Search, Mail } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/database';

export default function AdminFacultyPage() {
  const [faculty, setFaculty] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'faculty').order('created_at', { ascending: false })
      .then(({ data }) => { setFaculty((data ?? []) as Profile[]); setLoading(false); });
  }, []);

  const filtered = faculty.filter(f =>
    (f.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || f.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Faculty Members" subtitle={`${faculty.length} faculty registered`} icon={Users} />

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-11" placeholder="Search faculty..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(f => (
            <div key={f.id} className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <span className="text-lg font-bold text-teal-700 dark:text-teal-400">{f.full_name?.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{f.full_name}</p>
                  <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">Faculty</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Mail size={11} /> {f.email}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="col-span-3 text-center py-12 text-slate-400">No faculty found.</p>}
        </div>
      )}
    </div>
  );
}
