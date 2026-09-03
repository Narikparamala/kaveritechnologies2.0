import { useEffect, useState } from 'react';
import { BarChart2, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile, CourseEnrollment, Course } from '../../types/database';

type StudentProgress = { student: Profile; enrollment: CourseEnrollment; course: Course };

export default function StudentProgressPage() {
  const { profile } = useAuth();
  const [progressData, setProgressData] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: cf } = await supabase.from('course_faculty').select('course_id').eq('faculty_id', profile.id);
      const cIds = (cf ?? []).map((c: any) => c.course_id);
      if (!cIds.length) { setLoading(false); return; }

      const { data: enrData } = await supabase
        .from('course_enrollments')
        .select('*, course:courses(*)')
        .in('course_id', cIds)
        .order('progress_percentage', { ascending: false })
        .limit(20);

      if (!enrData?.length) { setLoading(false); return; }

      const studentIds = [...new Set(enrData.map((e: any) => e.student_id))];
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', studentIds);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      setProgressData(enrData.map((e: any) => ({
        student: profileMap.get(e.student_id) ?? {},
        enrollment: e,
        course: e.course,
      })) as any);
      setLoading(false);
    };
    load();
  }, [profile]);

  const chartData = progressData.slice(0, 10).map(({ student, enrollment }) => ({
    name: (student as any).full_name?.split(' ')[0] ?? 'Student',
    progress: Math.round((enrollment as any).progress_percentage ?? 0),
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="Student Progress" subtitle="Track how your students are progressing" icon={BarChart2} />

      {loading ? (
        <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
      ) : progressData.length === 0 ? (
        <EmptyState icon={Users} title="No student data yet" description="Students will appear here once they enroll." />
      ) : (
        <>
          <div className="card p-6 mb-6">
            <h2 className="section-title">Progress Distribution</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} domain={[0, 100]} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Progress']} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="progress" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card divide-y divide-slate-100 dark:divide-slate-700">
            {progressData.map(({ student, enrollment, course }) => (
              <div key={`${(student as any).id}-${(enrollment as any).course_id}`} className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-700 dark:text-primary-400">
                    {(student as any).full_name?.charAt(0) ?? 'S'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{(student as any).full_name ?? 'Student'}</p>
                  <p className="text-xs text-slate-400">{(course as any)?.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <ProgressBar value={(enrollment as any).progress_percentage ?? 0} size="sm" className="flex-1" />
                    <span className="text-xs text-slate-500 flex-shrink-0">{Math.round((enrollment as any).progress_percentage ?? 0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
