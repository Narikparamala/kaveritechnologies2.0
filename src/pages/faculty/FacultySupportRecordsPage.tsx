import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, AlertTriangle, CheckCircle, Clock, Filter } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { updateSupportRecord } from '../../services/companyManagement';
import type { StudentSupportRecord, Profile } from '../../types/database';

type SupportRecordWithDetails = StudentSupportRecord & {
  student?: Profile;
};

export default function FacultySupportRecordsPage() {
  const { profile: faculty } = useAuth();
  const [records, setRecords] = useState<SupportRecordWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    if (!faculty) return;
    loadRecords();
  }, [faculty]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      // Get faculty's assigned courses
      const { data: courseFaculty } = await supabase
        .from('course_faculty')
        .select('course_id')
        .eq('faculty_id', faculty!.id);
      const courseIds = (courseFaculty ?? []).map(cf => cf.course_id);

      if (courseIds.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      // Get students in those courses
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .in('course_id', courseIds);
      const studentIds = [...new Set((enrollments ?? []).map(e => e.student_id))];

      if (studentIds.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      // Get support records for these students
      const { data: recordsData, error } = await supabase
        .from('student_support_records')
        .select('*, student:profiles!student_support_records_student_id_fkey(*), faculty:profiles!student_support_records_faculty_id_fkey(*)')
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecords((recordsData ?? []) as SupportRecordWithDetails[]);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load support records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'open' | 'in_progress' | 'resolved') => {
    try {
      await updateSupportRecord(id, { status });
      setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update status:', err);
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = !search ||
      r.student?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.notes.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const openCount = records.filter(r => r.status === 'open').length;
  const inProgressCount = records.filter(r => r.status === 'in_progress').length;
  const resolvedCount = records.filter(r => r.status === 'resolved').length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Support Records"
        subtitle="Manage support requests for your students"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-xs text-slate-500">Open</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{openCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-blue-500" />
            <span className="text-xs text-slate-500">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-emerald-500" />
            <span className="text-xs text-slate-500">Resolved</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{resolvedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input w-full sm:w-32"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="input w-full sm:w-32"
        >
          <option value="all">All Types</option>
          <option value="academic">Academic</option>
          <option value="attendance">Attendance</option>
          <option value="behavior">Behavior</option>
          <option value="payment">Payment</option>
          <option value="general">General</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-2" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No support records"
          description={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Support records for your students will appear here.'}
        />
      ) : (
        <div className="space-y-3">
          {filteredRecords.map(record => (
            <div key={record.id} className={`card p-4 ${record.status === 'open' ? 'ring-1 ring-red-200 dark:ring-red-800' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 dark:text-primary-400 font-bold text-sm">
                    {(record.student?.full_name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link to={`/faculty/students/${record.student_id}`} className="font-semibold text-slate-900 dark:text-white hover:underline">
                      {record.student?.full_name || 'Unknown Student'}
                    </Link>
                    <Badge className={
                      record.category === 'academic' ? 'bg-blue-100 text-blue-700' :
                      record.category === 'attendance' ? 'bg-amber-100 text-amber-700' :
                      record.category === 'behavior' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }>
                      {record.category}
                    </Badge>
                    <Badge className={
                      record.priority === 'high' ? 'bg-red-100 text-red-700' :
                      record.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }>
                      {record.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{record.notes}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Created {new Date(record.created_at).toLocaleDateString()}</span>
                    {record.faculty && <span>Assigned: {record.faculty.full_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={record.status}
                    onChange={e => handleUpdateStatus(record.id, e.target.value as any)}
                    className={`input text-xs py-1.5 px-3 ${
                      record.status === 'open' ? 'bg-red-50 dark:bg-red-900/20 border-red-200' :
                      record.status === 'in_progress' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' :
                      'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200'
                    }`}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
