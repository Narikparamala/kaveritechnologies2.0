import { Link } from 'react-router-dom';
import { BookOpen, Play, Clock, Users } from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { Badge } from '../../../components/ui/Badge';
import { useDemo } from '../../../contexts/DemoContext';
import { DEMO_COURSES, DEMO_CHAPTERS } from '../../../data/demoData';
import { getDifficultyColor } from '../../../lib/utils';

export default function DemoCoursesPage() {
  const demo = useDemo()!;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader title="My Courses" subtitle="2 courses enrolled · Demo data" icon={BookOpen}
        action={<button onClick={() => demo.requireAuth()} className="btn-primary text-sm">Browse More Courses</button>}
      />
      <div className="grid sm:grid-cols-2 gap-6">
        {DEMO_COURSES.map(course => (
          <div key={course.id} className="card-hover overflow-hidden flex flex-col">
            <div className="h-36 bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center relative">
              <BookOpen size={40} className="text-white/20" />
              <div className="absolute top-3 right-3">
                <Badge className={`capitalize text-xs ${getDifficultyColor(course.difficulty)}`}>{course.difficulty}</Badge>
              </div>
              {course.progress === 100 && (
                <div className="absolute top-3 left-3">
                  <Badge variant="success" className="text-xs">Completed</Badge>
                </div>
              )}
            </div>
            <div className="p-5 flex flex-col flex-1">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">{course.title}</h3>
              <p className="text-xs text-slate-400 mb-4 flex items-center gap-3">
                <span className="flex items-center gap-1"><Clock size={11} /> {course.duration_hours}h</span>
                <span className="flex items-center gap-1"><Users size={11} /> {course.enrollment_count.toLocaleString()}</span>
              </p>
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>Progress</span><span className="font-medium">{course.progress}%</span>
                </div>
                <ProgressBar value={course.progress} size="sm" />
              </div>
              <div className="mt-auto">
                <Link
                  to="/demo/student/lesson/conditionals"
                  className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
                >
                  <Play size={14} /> {course.progress === 0 ? 'Start Course' : course.progress === 100 ? 'Review' : 'Continue'}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Curriculum preview */}
      <div className="mt-8">
        <h2 className="section-title">Course Curriculum Preview</h2>
        <div className="space-y-3">
          {DEMO_CHAPTERS.map(ch => (
            <div key={ch.id} className="card overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-600">{ch.order_index}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{ch.title}</p>
                    <p className="text-xs text-slate-400">{ch.lessons.length} lessons</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-700">
                {ch.lessons.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${l.completed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <Link to={`/demo/student/lesson/${l.slug}`} className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex-1">{l.title}</Link>
                    <span className="text-xs text-slate-400">{l.duration_minutes}m</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
