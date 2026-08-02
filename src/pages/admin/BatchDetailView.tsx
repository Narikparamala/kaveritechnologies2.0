import { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, GraduationCap, UserPlus, Calendar, Clock, Megaphone,
  Plus, Trash2, Loader2, BookOpen, Search, UserX, UserCheck, Pin,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type {
  Batch, Course, Profile, BatchFaculty, BatchStudent, BatchSchedule,
  BatchAnnouncement, BatchFacultyRole, BatchStudentStatus, BatchStatus,
} from '../../types/database';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TABS = [
  { key: 'students', label: 'Students', icon: GraduationCap },
  { key: 'faculty', label: 'Faculty', icon: UserPlus },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
] as const;
type TabKey = typeof TABS[number]['key'];

interface Props {
  batchId: string;
  onBack: () => void;
}

export default function BatchDetailView({ batchId, onBack }: Props) {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [batch, setBatch] = useState<Batch & { course?: Course } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('students');
  const [loading, setLoading] = useState(true);

  // Students
  const [students, setStudents] = useState<(BatchStudent & { student?: Profile })[]>([]);
  const [allStudents, setAllStudents] = useState<Profile[]>([]);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Faculty
  const [faculty, setFaculty] = useState<(BatchFaculty & { faculty?: Profile })[]>([]);
  const [allFaculty, setAllFaculty] = useState<Profile[]>([]);
  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [facultyRole, setFacultyRole] = useState<BatchFacultyRole>('lead');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');

  // Schedule
  const [schedules, setSchedules] = useState<BatchSchedule[]>([]);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ day_of_week: 1, start_time: '09:00', end_time: '10:00', topic: '' });

  // Announcements
  const [announcements, setAnnouncements] = useState<(BatchAnnouncement & { author?: Profile })[]>([]);
  const [showAddAnnouncement, setShowAddAnnouncement] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', is_pinned: false });

  useEffect(() => { loadBatch(); }, [batchId]);
  useEffect(() => { loadTabData(); }, [activeTab, batchId]);

  async function loadBatch() {
    setLoading(true);
    const { data } = await supabase.from('batches').select('*, course:courses(id, title)').eq('id', batchId).maybeSingle();
    setBatch(data as any);
    setLoading(false);
  }

  async function loadTabData() {
    if (activeTab === 'students') {
      const { data } = await supabase.from('batch_students').select('*, student:profiles(*)').eq('batch_id', batchId).order('enrolled_at', { ascending: false });
      setStudents((data ?? []) as any);
    } else if (activeTab === 'faculty') {
      const { data } = await supabase.from('batch_faculty').select('*, faculty:profiles(*)').eq('batch_id', batchId).order('assigned_at', { ascending: false });
      setFaculty((data ?? []) as any);
    } else if (activeTab === 'schedule') {
      const { data } = await supabase.from('batch_schedules').select('*').eq('batch_id', batchId).order('day_of_week').order('start_time');
      setSchedules((data ?? []) as any);
    } else if (activeTab === 'announcements') {
      const { data } = await supabase.from('batch_announcements').select('*, author:profiles(*)').eq('batch_id', batchId).order('created_at', { ascending: false });
      setAnnouncements((data ?? []) as any);
    }
  }

  // --- Students ---
  async function openAddStudentModal() {
    setShowAddStudent(true);
    setStudentSearch('');
    const existingIds = students.map(s => s.student_id);
    const { data } = await supabase.from('profiles').select('*').eq('role', 'student').order('full_name');
    setAllStudents(((data ?? []) as Profile[]).filter(p => !existingIds.includes(p.id)));
  }

  async function addStudent(studentId: string) {
    const { error } = await supabase.from('batch_students').insert({ batch_id: batchId, student_id: studentId });
    if (error) { showError(error.message); return; }
    success('Student added to batch');
    setShowAddStudent(false);
    loadTabData();
  }

  async function updateStudentStatus(id: string, status: BatchStudentStatus) {
    const { error } = await supabase.from('batch_students').update({ status }).eq('id', id);
    if (error) { showError(error.message); return; }
    success('Student status updated');
    loadTabData();
  }

  async function removeStudent(id: string) {
    if (!confirm('Remove this student from the batch?')) return;
    const { error } = await supabase.from('batch_students').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Student removed');
    loadTabData();
  }

  // --- Faculty ---
  async function openAddFacultyModal() {
    setShowAddFaculty(true);
    setSelectedFacultyId('');
    setFacultyRole('lead');
    const existingIds = faculty.map(f => f.faculty_id);
    const { data } = await supabase.from('profiles').select('*').eq('role', 'faculty').order('full_name');
    setAllFaculty(((data ?? []) as Profile[]).filter(p => !existingIds.includes(p.id)));
  }

  async function addFaculty() {
    if (!selectedFacultyId) { showError('Select a faculty member'); return; }
    const { error } = await supabase.from('batch_faculty').insert({ batch_id: batchId, faculty_id: selectedFacultyId, role: facultyRole });
    if (error) { showError(error.message); return; }
    success('Faculty assigned to batch');
    setShowAddFaculty(false);
    loadTabData();
  }

  async function removeFaculty(id: string) {
    if (!confirm('Remove this faculty from the batch?')) return;
    const { error } = await supabase.from('batch_faculty').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Faculty removed');
    loadTabData();
  }

  // --- Schedule ---
  async function addSchedule() {
    const { error } = await supabase.from('batch_schedules').insert({
      batch_id: batchId,
      day_of_week: scheduleForm.day_of_week,
      start_time: scheduleForm.start_time,
      end_time: scheduleForm.end_time,
      topic: scheduleForm.topic.trim() || null,
    });
    if (error) { showError(error.message); return; }
    success('Schedule slot added');
    setShowAddSchedule(false);
    setScheduleForm({ day_of_week: 1, start_time: '09:00', end_time: '10:00', topic: '' });
    loadTabData();
  }

  async function deleteSchedule(id: string) {
    const { error } = await supabase.from('batch_schedules').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Schedule slot removed');
    loadTabData();
  }

  // --- Announcements ---
  async function addAnnouncement() {
    if (!announcementForm.title.trim()) { showError('Title is required'); return; }
    const { error } = await supabase.from('batch_announcements').insert({
      batch_id: batchId,
      title: announcementForm.title.trim(),
      content: announcementForm.content.trim() || null,
      author_id: profile?.id,
      is_pinned: announcementForm.is_pinned,
    });
    if (error) { showError(error.message); return; }
    success('Announcement posted');
    setShowAddAnnouncement(false);
    setAnnouncementForm({ title: '', content: '', is_pinned: false });
    loadTabData();
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('batch_announcements').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Announcement deleted');
    loadTabData();
  }

  if (loading || !batch) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary-600" size={24} />
      </div>
    );
  }

  const filteredAllStudents = allStudents.filter(s =>
    !studentSearch || (s.full_name || s.email).toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{batch.name}</h1>
            <Badge variant={batch.status === 'active' ? 'success' : batch.status === 'upcoming' ? 'info' : 'default'}>
              {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 mt-1">
            {batch.course && (
              <span className="flex items-center gap-1"><BookOpen size={14} /> {(batch as any).course.title}</span>
            )}
            {batch.start_date && (
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {new Date(batch.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'students' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Students ({students.filter(s => s.status === 'active').length}/{batch.max_students})
            </h2>
            <button onClick={openAddStudentModal} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={14} /> Add Student
            </button>
          </div>
          {students.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No students yet" description="Add students to this batch to get started." />
          ) : (
            <div className="card divide-y divide-slate-100 dark:divide-slate-700">
              {students.map(bs => (
                <div key={bs.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-400 flex-shrink-0">
                    {(bs.student?.full_name || bs.student?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{bs.student?.full_name || bs.student?.email}</p>
                    <p className="text-xs text-slate-400 truncate">{bs.student?.email}</p>
                  </div>
                  <select
                    className="input-field text-xs py-1 w-28"
                    value={bs.status}
                    onChange={e => updateStudentStatus(bs.id, e.target.value as BatchStudentStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="removed">Removed</option>
                    <option value="transferred">Transferred</option>
                  </select>
                  <button onClick={() => removeStudent(bs.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'faculty' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Assigned Faculty ({faculty.length})</h2>
            <button onClick={openAddFacultyModal} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={14} /> Assign Faculty
            </button>
          </div>
          {faculty.length === 0 ? (
            <EmptyState icon={UserPlus} title="No faculty assigned" description="Assign faculty members to this batch." />
          ) : (
            <div className="card divide-y divide-slate-100 dark:divide-slate-700">
              {faculty.map(bf => (
                <div key={bf.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-xs font-bold text-teal-700 dark:text-teal-400 flex-shrink-0">
                    {(bf.faculty?.full_name || bf.faculty?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{bf.faculty?.full_name || bf.faculty?.email}</p>
                    <p className="text-xs text-slate-400 truncate">{bf.faculty?.email}</p>
                  </div>
                  <Badge variant={bf.role === 'lead' ? 'success' : bf.role === 'assistant' ? 'info' : 'default'}>
                    {bf.role}
                  </Badge>
                  <button onClick={() => removeFaculty(bf.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Weekly Schedule</h2>
            <button onClick={() => setShowAddSchedule(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={14} /> Add Slot
            </button>
          </div>
          {schedules.length === 0 ? (
            <EmptyState icon={Calendar} title="No schedule set" description="Add weekly time slots for this batch." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {schedules.map(s => (
                <div key={s.id} className="card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Clock size={18} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{DAYS[s.day_of_week]}</p>
                    <p className="text-xs text-slate-500">{s.start_time} - {s.end_time}</p>
                    {s.topic && <p className="text-xs text-slate-400 truncate mt-0.5">{s.topic}</p>}
                  </div>
                  <button onClick={() => deleteSchedule(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'announcements' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Announcements</h2>
            <button onClick={() => setShowAddAnnouncement(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={14} /> Post Announcement
            </button>
          </div>
          {announcements.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements" description="Post an announcement for this batch." />
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className="card p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                        {a.is_pinned && <Pin size={12} className="text-amber-500" />}
                      </div>
                      {a.content && <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{a.content}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>{a.author?.full_name || 'Admin'}</span>
                        <span>{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteAnnouncement(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      <Modal open={showAddStudent} onClose={() => setShowAddStudent(false)} title="Add Student to Batch" size="md">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-slate-400" />
            <input className="input text-sm flex-1" placeholder="Search students..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700">
            {filteredAllStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No students available</p>
            ) : (
              filteredAllStudents.map(s => (
                <button key={s.id} onClick={() => addStudent(s.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-400 flex-shrink-0">
                    {(s.full_name || s.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.full_name || 'Unnamed'}</p>
                    <p className="text-xs text-slate-400 truncate">{s.email}</p>
                  </div>
                  <Plus size={14} className="text-primary-500 flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Add Faculty Modal */}
      <Modal open={showAddFaculty} onClose={() => setShowAddFaculty(false)} title="Assign Faculty" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Faculty Member</label>
            <select className="input" value={selectedFacultyId} onChange={e => setSelectedFacultyId(e.target.value)}>
              <option value="">Select faculty...</option>
              {allFaculty.map(f => <option key={f.id} value={f.id}>{f.full_name || f.email}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={facultyRole} onChange={e => setFacultyRole(e.target.value as BatchFacultyRole)}>
              <option value="lead">Lead Instructor</option>
              <option value="assistant">Assistant</option>
              <option value="guest">Guest</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowAddFaculty(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={addFaculty} className="btn-primary text-sm">Assign</button>
          </div>
        </div>
      </Modal>

      {/* Add Schedule Modal */}
      <Modal open={showAddSchedule} onClose={() => setShowAddSchedule(false)} title="Add Schedule Slot" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Day of Week</label>
            <select className="input" value={scheduleForm.day_of_week} onChange={e => setScheduleForm(f => ({ ...f, day_of_week: parseInt(e.target.value) }))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Time</label>
              <input type="time" className="input" value={scheduleForm.start_time} onChange={e => setScheduleForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="label">End Time</label>
              <input type="time" className="input" value={scheduleForm.end_time} onChange={e => setScheduleForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Topic (optional)</label>
            <input className="input" value={scheduleForm.topic} onChange={e => setScheduleForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Data Structures" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowAddSchedule(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={addSchedule} className="btn-primary text-sm">Add Slot</button>
          </div>
        </div>
      </Modal>

      {/* Post Announcement Modal */}
      <Modal open={showAddAnnouncement} onClose={() => setShowAddAnnouncement(false)} title="Post Announcement" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={announcementForm.title} onChange={e => setAnnouncementForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" />
          </div>
          <div>
            <label className="label">Content</label>
            <textarea className="input min-h-[100px]" value={announcementForm.content} onChange={e => setAnnouncementForm(f => ({ ...f, content: e.target.value }))} placeholder="Announcement details..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={announcementForm.is_pinned} onChange={e => setAnnouncementForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded border-slate-300" />
            Pin this announcement
          </label>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowAddAnnouncement(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={addAnnouncement} className="btn-primary text-sm">Post</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
