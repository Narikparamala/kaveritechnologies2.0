import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, ChevronLeft, Loader2, CheckCircle, XCircle, AlertCircle, UserCheck, Download } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { getAllSessions, getSessionAttendance, markAttendance, type SessionWithDetails } from '../../services/liveSessions';
import type { SessionAttendance, Profile } from '../../types/database';

type AttendanceWithStudent = SessionAttendance & { student?: Profile };

export default function AdminSessionAttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [session, setSession] = useState<SessionWithDetails | null>(null);
  const [attendance, setAttendance] = useState<AttendanceWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const sessions = await getAllSessions({});
      const found = sessions.find(s => s.id === sessionId);
      setSession(found || null);
      if (found) {
        const att = await getSessionAttendance(sessionId!);
        setAttendance(att as AttendanceWithStudent[]);
      }
    } catch (err) {
      showError('Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAttendance = async (studentId: string, status: 'attended' | 'absent' | 'excused') => {
    setSaving(true);
    try {
      await markAttendance(sessionId!, studentId, status, profile!.id);
      success(`Attendance marked as ${status}.`);
      loadData();
    } catch {
      showError('Failed to update attendance.');
    } finally {
      setSaving(false);
    }
  };

  const getStats = () => {
    const total = attendance.length;
    const attended = attendance.filter(a => a.attendance_status === 'attended').length;
    const absent = attendance.filter(a => a.attendance_status === 'absent').length;
    const excused = attendance.filter(a => a.attendance_status === 'excused').length;
    const registered = attendance.filter(a => a.attendance_status === 'registered').length;
    return { total, attended, absent, excused, registered };
  };

  const handleExportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Status', 'Joined At'].join(','),
      ...attendance.map(a => [a.student?.full_name || 'Unknown', a.student?.email || '', a.attendance_status, a.joined_at ? new Date(a.joined_at).toLocaleString() : ''].join(','))
    ];
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${session?.title?.replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-primary-600" size={32} /></div>;

  if (!session) return (
    <div className="p-6 lg:p-8">
      <EmptyState icon={Users} title="Session not found" action={<Link to="/admin/live-classes" className="btn-primary text-sm">Back to Live Classes</Link>} />
    </div>
  );

  const stats = getStats();

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <Link to="/admin/live-classes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-4">
        <ChevronLeft size={16} /> Back to Live Classes
      </Link>
      <PageHeader title="Attendance" subtitle={session.title} action={<button onClick={handleExportCSV} className="btn-secondary text-sm flex items-center gap-1.5"><Download size={14} /> Export CSV</button>} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p><p className="text-xs text-slate-500">Total</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{stats.attended}</p><p className="text-xs text-slate-500">Attended</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-red-600">{stats.absent}</p><p className="text-xs text-slate-500">Absent</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-amber-600">{stats.excused}</p><p className="text-xs text-slate-500">Excused</p></div>
        <div className="card p-4 text-center"><p className="text-2xl font-bold text-slate-600">{stats.registered}</p><p className="text-xs text-slate-500">Pending</p></div>
      </div>

      {stats.total > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Attendance Rate</span>
            <span className="text-sm font-bold text-primary-600">{Math.round((stats.attended / stats.total) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-2">
            <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${(stats.attended / stats.total) * 100}%` }} />
          </div>
        </div>
      )}

      {attendance.length === 0 ? (
        <EmptyState icon={Users} title="No students registered" description="No students have registered for this session." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Student</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Joined</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {attendance.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 text-xs font-bold">
                        {a.student?.full_name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{a.student?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{a.student?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={
                      a.attendance_status === 'attended' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      a.attendance_status === 'absent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      a.attendance_status === 'excused' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }>
                      {a.attendance_status.charAt(0).toUpperCase() + a.attendance_status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.joined_at ? new Date(a.joined_at).toLocaleTimeString() : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleMarkAttendance(a.student_id, 'attended')} disabled={saving} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 disabled:opacity-50" title="Attended"><UserCheck size={16} /></button>
                      <button onClick={() => handleMarkAttendance(a.student_id, 'absent')} disabled={saving} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 disabled:opacity-50" title="Absent"><XCircle size={16} /></button>
                      <button onClick={() => handleMarkAttendance(a.student_id, 'excused')} disabled={saving} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 disabled:opacity-50" title="Excused"><AlertCircle size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
