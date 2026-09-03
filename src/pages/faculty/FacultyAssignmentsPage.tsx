import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Code2, Edit3, FileText, Play, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { deleteAssignment, getFacultyAssignments } from '../../services/assignments';
import { formatDate } from '../../lib/utils';
import type { Assignment, Course } from '../../types/database';

type FacultyAssignment = Assignment & { course: Course };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export default function FacultyAssignmentsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: toastError } = useToast();
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setAssignments(await getFacultyAssignments(profile.id));
    } catch (error) {
      toastError('Could not load assignments', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [profile, toastError]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const removeAssignment = async (assignment: FacultyAssignment) => {
    const confirmed = window.confirm(
      `Delete “${assignment.title}”? Its questions, test cases and student submissions will also be deleted.`,
    );
    if (!confirmed) return;

    setDeletingId(assignment.id);
    try {
      await deleteAssignment(assignment.id);
      setAssignments(current => current.filter(item => item.id !== assignment.id));
      success('Assignment deleted');
    } catch (error) {
      toastError('Could not delete assignment', errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading assignments...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in p-6 lg:p-8">
      <PageHeader
        title="Assignments"
        subtitle="Create coding challenges and publish them to students"
        icon={FileText}
        action={
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => navigate('/faculty/assignments/new')}
          >
            <Plus size={17} /> Create Assignment
          </button>
        }
      />

      {assignments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No assignments yet"
            description="Create your first coding assignment for students."
          />
        </div>
      ) : (
        <div className="grid gap-4">
          {assignments.map(assignment => {
            const statusVariant = assignment.status === 'published'
              ? 'success'
              : assignment.status === 'closed'
                ? 'error'
                : 'warning';

            return (
              <article
                key={assignment.id}
                className="card overflow-hidden p-5 transition hover:border-primary-400 hover:shadow-lg"
              >
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                  <button
                    className="flex-1 text-left"
                    onClick={() => navigate(`/faculty/assignments/builder/${assignment.id}`)}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {assignment.title}
                      </h2>
                      <Badge variant={statusVariant}>{assignment.status}</Badge>
                      <Badge variant="info">Coding</Badge>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {assignment.course?.title || 'Course'}
                    </p>
                    {assignment.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                        {assignment.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={13} />
                        {assignment.due_date ? `Due ${formatDate(assignment.due_date)}` : 'No due date'}
                      </span>
                      <span>Max marks: {assignment.max_marks}</span>
                      <span className="capitalize">{assignment.difficulty || 'beginner'}</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary flex items-center gap-2 text-sm"
                      onClick={() =>
                        navigate(`/faculty/practice/assignments/${assignment.id}?practice=1&returnTo=${encodeURIComponent('/faculty/assignments')}`)
                      }
                    >
                      <Play size={16} /> Practice
                    </button>
                    <button
                      className="btn-secondary flex items-center gap-2 text-sm"
                      onClick={() => navigate(`/faculty/assignments/builder/${assignment.id}`)}
                    >
                      <Code2 size={16} /> Questions & Tests
                    </button>
                    <button
                      className="rounded-xl p-2.5 text-slate-400 transition hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20"
                      title="Edit assignment"
                      onClick={() => navigate(`/faculty/assignments/builder/${assignment.id}`)}
                    >
                      <Edit3 size={17} />
                    </button>
                    <button
                      className="rounded-xl p-2.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Delete assignment"
                      disabled={deletingId === assignment.id}
                      onClick={() => void removeAssignment(assignment)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
