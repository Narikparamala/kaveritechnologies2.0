import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Download, Loader2, UserCheck, Users, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';

type AttendanceStatus = 'registered' | 'attended' | 'absent' | 'excused';

interface SessionSummary {
  id: string;
  course_id: string;
  title: string;
}

interface AttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  attendance_status: AttendanceStatus;
  joined_at: string | null;
  student: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function FacultySessionAttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingStudent, setSavingStudent] = useState<string | null>(null);
  const errorShown = useRef(false);

  const loadData = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('live_sessions')
        .select('id, course_id, title')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!sessionData) {
        setSession(null);
        setAttendance([]);
        return;
      }

      setSession(sessionData as SessionSummary);

      const [attendanceResult, enrollmentResult] = await Promise.all([
        supabase
          .from('session_attendance')
          .select('id, session_id, student_id, attendance_status, joined_at')
          .eq('session_id', sessionId),
        supabase
          .from('course_enrollments')
          .select('student_id')
          .eq('course_id', sessionData.course_id),
      ]);

      if (attendanceResult.error) throw attendanceResult.error;
      if (enrollmentResult.error) throw enrollmentResult.error;

      const savedRows = attendanceResult.data ?? [];
      const studentIds = Array.from(new Set([
        ...(enrollmentResult.data ?? []).map(row => row.student_id),
        ...savedRows.map(row => row.student_id),
      ])).filter(Boolean);

      let profiles: Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      }> = [];

      if (studentIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', studentIds);
        if (error) throw error;
        profiles = data ?? [];
      }

      const profileMap = new Map(profiles.map(item => [item.id, item]));
      const attendanceMap = new Map(savedRows.map(item => [item.student_id, item]));

      const merged: AttendanceRow[] = studentIds.map(studentId => {
        const saved = attendanceMap.get(studentId);
        return {
          id: saved?.id ?? `pending-${studentId}`,
          session_id: sessionId,
          student_id: studentId,
          attendance_status: (saved?.attendance_status ?? 'registered') as AttendanceStatus,
          joined_at: saved?.joined_at ?? null,
          student: profileMap.get(studentId) ?? null,
        };
      });

      merged.sort((a, b) =>
        (a.student?.full_name ?? a.student?.email ?? '').localeCompare(
          b.student?.full_name ?? b.student?.email ?? '',
        ),
      );
      setAttendance(merged);
      errorShown.current = false;
    } catch (err) {
      console.error('Failed to load attendance:', err);
      if (!errorShown.current) {
        errorShown.current = true;
        showError('Failed to load attendance data. Apply the attendance database migration first.');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMarkAttendance = async (studentId: string, status: Exclude<AttendanceStatus, 'registered'>) => {
    if (!sessionId) return;
    setSavingStudent(studentId);

    try {
      const { error } = await supabase
        .from('session_attendance')
        .upsert({
          session_id: sessionId,
          student_id: studentId,
          attendance_status: status,
          joined_at: status === 'attended' ? new Date().toISOString() : null,
          marked_by: profile?.id ?? null,
        }, { onConflict: 'session_id,student_id' });

      if (error) throw error;
      success(`Attendance marked as ${status}.`);
      await loadData();
    } catch (err) {
      console.error('Failed to update attendance:', err);
      showError('Failed to update attendance.');
    } finally {
      setSavingStudent(null);
    }
  };

  const stats = {
    total: attendance.length,
    attended: attendance.filter(row => row.attendance_status === 'attended').length,
    absent: attendance.filter(row => row.attendance_status === 'absent').length,
    excused: attendance.filter(row => row.attendance_status === 'excused').length,
    pending: attendance.filter(row => row.attendance_status === 'registered').length,
  };

  const handleExportCSV = () => {
    const rows = [
      ['Name', 'Email', 'Status', 'Joined At'].map(csvCell).join(','),
      ...attendance.map(row => [
        row.student?.full_name ?? 'Unknown student',
        row.student?.email ?? '',
        row.attendance_status,
        row.joined_at ? new Date(row.joined_at).toLocaleString() : '',
      ].map(csvCell).join(',')),
    ];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance-${(session?.title ?? 'session').replace(/[^a-z0-9]+/gi, '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-primary-600" size={32} /></div>;
  }

  if (!session) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={Users}
          title="Session not found"
          description="This session may not exist or may not be available."
          action={<Link to="/faculty/live-classes" className="btn-primary text-sm">Back to Live Classes</Link>}
        />
      </div>
    );
  }

  const attendanceRate = stats.total ? Math.round((stats.attended / stats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl animate-fade-in p-6 lg:p-8">
      <Link to="/faculty/live-classes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 dark:text-slate-400">
        <ChevronLeft size={16} /> Back to Live Classes
      </Link>

      <PageHeader
        title="Attendance"
        subtitle={session.title}
        action={
          <button onClick={handleExportCSV} disabled={!attendance.length} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50">
            <Download size={14} /> Export CSV
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          ['Total', stats.total, 'text-slate-900 dark:text-white'],
          ['Attended', stats.attended, 'text-emerald-600'],
          ['Absent', stats.absent, 'text-red-600'],
          ['Excused', stats.excused, 'text-amber-600'],
          ['Pending', stats.pending, 'text-slate-600'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {stats.total > 0 && (
        <div className="card mb-6 p-4">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Attendance Rate</span><span className="text-primary-600">{attendanceRate}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-2 rounded-full bg-primary-600 transition-all" style={{ width: `${attendanceRate}%` }} />
          </div>
        </div>
      )}

      {!attendance.length ? (
        <EmptyState icon={Users} title="No students enrolled" description="Enroll students in this course and they will appear here automatically." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {['Student', 'Status', 'Joined', 'Actions'].map((heading, index) => (
                  <th key={heading} className={`px-4 py-3 text-xs font-medium text-slate-500 ${index === 3 ? 'text-right' : 'text-left'}`}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {attendance.map(row => (
                <tr key={row.student_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{row.student?.full_name ?? 'Student'}</p>
                    <p className="text-xs text-slate-500">{row.student?.email ?? row.student_id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={row.attendance_status === 'attended' ? 'bg-emerald-100 text-emerald-700' : row.attendance_status === 'absent' ? 'bg-red-100 text-red-700' : row.attendance_status === 'excused' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}>
                      {row.attendance_status === 'registered' ? 'Pending' : row.attendance_status[0].toUpperCase() + row.attendance_status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.joined_at ? new Date(row.joined_at).toLocaleTimeString() : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Present" disabled={savingStudent === row.student_id} onClick={() => handleMarkAttendance(row.student_id, 'attended')} className="p-2 text-emerald-600 disabled:opacity-40"><UserCheck size={17} /></button>
                      <button title="Absent" disabled={savingStudent === row.student_id} onClick={() => handleMarkAttendance(row.student_id, 'absent')} className="p-2 text-red-600 disabled:opacity-40"><XCircle size={17} /></button>
                      <button title="Excused" disabled={savingStudent === row.student_id} onClick={() => handleMarkAttendance(row.student_id, 'excused')} className="p-2 text-amber-600 disabled:opacity-40"><AlertCircle size={17} /></button>
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
