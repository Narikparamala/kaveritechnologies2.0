import { useEffect, useState, useCallback } from 'react';
import { Link2, Plus, Trash2, Search, X, AlertCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logActivity } from '../../services/faculty';
import type { Course, Profile } from '../../types/database';

type Assignment = { id: string; course: Course; faculty: Profile };

export default function CourseAssignmentsPage() {
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [faculty, setFaculty] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ course_id: '', faculty_id: '' });
  const [searchCourse, setSearchCourse] = useState('');
  const [searchFaculty, setSearchFaculty] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: cfData }, { data: cData }, { data: fData }] = await Promise.all([
      supabase.from('course_faculty').select('*, course:courses(*), faculty:profiles(*)'),
      supabase.from('courses').select('*').order('title'),
      supabase.from('profiles').select('*').eq('role', 'faculty').order('full_name'),
    ]);
    setAssignments((cfData ?? []).map((cf: any) => ({ id: cf.id, course: cf.course, faculty: cf.faculty })));
    setCourses((cData ?? []) as Course[]);
    setFaculty((fData ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async () => {
    if (!form.course_id || !form.faculty_id || !profile) return;
    setAssigning(true);
    const { data, error } = await supabase.from('course_faculty').insert({
      course_id: form.course_id,
      faculty_id: form.faculty_id,
    }).select('*, course:courses(*), faculty:profiles(*)').maybeSingle();

    if (error) {
      if (error.code === '23505') {
        toastError('Already Assigned', 'This faculty member is already assigned to this course.');
      } else {
        toastError('Error', error.message);
      }
      setAssigning(false);
      return;
    }
    if (data) {
      setAssignments(a => [...a, { id: (data as any).id, course: (data as any).course, faculty: (data as any).faculty }]);
      const course = courses.find(c => c.id === form.course_id);
      const fac = faculty.find(f => f.id === form.faculty_id);
      await logActivity(profile.id, 'assign_faculty', 'course_faculty', (data as any).id, {
        course_title: course?.title,
        faculty_email: fac?.email,
      });
      setShowModal(false);
      setForm({ course_id: '', faculty_id: '' });
      success('Faculty assigned!', `${fac?.full_name} is now assigned to ${course?.title}`);
    }
    setAssigning(false);
  };

  const handleRemove = async () => {
    if (!removeTarget || !profile) return;
    setRemoving(true);
    const { error } = await supabase.from('course_faculty').delete().eq('id', removeTarget.id);
    if (error) { toastError('Error', error.message); setRemoving(false); return; }
    setAssignments(a => a.filter(x => x.id !== removeTarget.id));
    await logActivity(profile.id, 'remove_faculty', 'course_faculty', removeTarget.id, {
      course_title: removeTarget.course?.title,
      faculty_email: removeTarget.faculty?.email,
    });
    success('Assignment removed', `${removeTarget.faculty?.full_name} removed from ${removeTarget.course?.title}`);
    setRemoveTarget(null);
    setRemoving(false);
  };

  // Group assignments by course for the "view by course" display
  const courseGroupMap = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = courseGroupMap.get(a.course.id) ?? [];
    list.push(a);
    courseGroupMap.set(a.course.id, list);
  }

  // Group by faculty for the "view by faculty" display
  const facultyGroupMap = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = facultyGroupMap.get(a.faculty.id) ?? [];
    list.push(a);
    facultyGroupMap.set(a.faculty.id, list);
  }

  const filteredCourses = courses.filter(c =>
    !searchCourse || c.title.toLowerCase().includes(searchCourse.toLowerCase())
  );
  const filteredFaculty = faculty.filter(f =>
    !searchFaculty ||
    (f.full_name ?? '').toLowerCase().includes(searchFaculty.toLowerCase()) ||
    f.email.toLowerCase().includes(searchFaculty.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Course Assignments"
        subtitle="Assign faculty members to courses and manage existing assignments"
        icon={Link2}
        action={
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Assign Faculty
          </button>
        }
      />

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />)}</div>
      ) : assignments.length === 0 ? (
        <div className="card py-12 text-center">
          <AlertCircle size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No faculty assignments yet. Click "Assign Faculty" to get started.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* By Course */}
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Link2 size={16} className="text-primary-500" /> By Course
            </h2>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search courses..."
                value={searchCourse}
                onChange={e => setSearchCourse(e.target.value)}
                className="input pl-9 text-sm py-2"
              />
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredCourses.map(course => {
                const courseAssignments = courseGroupMap.get(course.id) ?? [];
                return (
                  <div key={course.id} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{course.title}</p>
                        <p className="text-xs text-slate-400 capitalize">{course.difficulty} · {course.category}</p>
                      </div>
                      <span className={`badge text-xs ${courseAssignments.length > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                        {courseAssignments.length} faculty
                      </span>
                    </div>
                    {courseAssignments.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {courseAssignments.map(a => (
                          <div key={a.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg pl-2 pr-1 py-1">
                            <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                              <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{a.faculty?.full_name?.charAt(0)}</span>
                            </div>
                            <span className="text-xs text-slate-700 dark:text-slate-300">{a.faculty?.full_name}</span>
                            <button onClick={() => setRemoveTarget(a)} className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-2">No faculty assigned</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* By Faculty */}
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Link2 size={16} className="text-primary-500" /> By Faculty
            </h2>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search faculty..."
                value={searchFaculty}
                onChange={e => setSearchFaculty(e.target.value)}
                className="input pl-9 text-sm py-2"
              />
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredFaculty.map(fac => {
                const facAssignments = facultyGroupMap.get(fac.id) ?? [];
                return (
                  <div key={fac.id} className="card p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{fac.full_name?.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900 dark:text-white text-sm">{fac.full_name}</p>
                        <p className="text-xs text-slate-400">{fac.email}</p>
                      </div>
                      <span className={`badge text-xs ${facAssignments.length > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
                        {facAssignments.length} courses
                      </span>
                    </div>
                    {facAssignments.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {facAssignments.map(a => (
                          <div key={a.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg pl-2 pr-1 py-1">
                            <span className="text-xs text-slate-700 dark:text-slate-300">{a.course?.title}</span>
                            <button onClick={() => setRemoveTarget(a)} className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-2">No courses assigned</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Assign Faculty to Course">
        <div className="space-y-4">
          <div>
            <label className="label">Course</label>
            <select className="input" value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}>
              <option value="">Select course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Faculty Member</label>
            <select className="input" value={form.faculty_id} onChange={e => setForm(f => ({ ...f, faculty_id: e.target.value }))}>
              <option value="">Select faculty...</option>
              {faculty.map(f => <option key={f.id} value={f.id}>{f.full_name} ({f.email})</option>)}
            </select>
          </div>
          {form.course_id && form.faculty_id && assignments.some(a => a.course.id === form.course_id && a.faculty.id === form.faculty_id) && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2">
              <AlertCircle size={14} /> This faculty member is already assigned to this course.
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleAssign}
              disabled={assigning || !form.course_id || !form.faculty_id || assignments.some(a => a.course.id === form.course_id && a.faculty.id === form.faculty_id)}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {assigning ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
              Assign
            </button>
          </div>
        </div>
      </Modal>

      {/* Remove Confirmation */}
      <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Confirm Removal" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to remove <strong>{removeTarget?.faculty?.full_name}</strong> from <strong>{removeTarget?.course?.title}</strong>?
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setRemoveTarget(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="btn-primary bg-red-600 hover:bg-red-700 flex items-center gap-2"
            >
              {removing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 size={14} />}
              Remove
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
