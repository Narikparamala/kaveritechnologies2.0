import { Link } from 'react-router-dom';
import { Video, Film, Radio, CheckCircle, Hourglass, PlayCircle } from 'lucide-react';
import type { Lesson, LiveSession } from '../../../types/database';

interface DeliveryBannerProps {
  lesson: Lesson;
  sessions: LiveSession[];
}

type DeliveryState =
  | 'recorded'
  | 'scheduled'
  | 'live'
  | 'ended-with-recording'
  | 'ended-no-recording';

/**
 * Delivery-mode banner shown directly above the Lesson Overview card.
 *
 * Recorded lesson -> purple "Recorded lesson" banner.
 * Live lesson     -> state depends on the linked live session(s):
 *   scheduled            blue    "class scheduled"
 *   live                 red     "class is live, join now"
 *   completed, recording available       emerald "recording ready"
 *   completed, no recording yet          amber   "class has ended, wait for the recording"
 */
export function DeliveryBanner({ lesson, sessions }: DeliveryBannerProps) {
  // Lesson-level recording (lesson.video_url) covers the whole lesson; session
  // recordings are judged per-session via materials_unlocked.
  const hasRecording = Boolean(lesson.video_url);

  let state: DeliveryState;
  if (lesson.teaching_mode === 'recorded_video') {
    state = 'recorded';
  } else {
    const active = sessions.find(s => s.status === 'live');
    const upcoming = sessions
      .filter(s => s.status === 'scheduled')
      .sort((a, b) => +new Date(a.session_date) - +new Date(b.session_date))[0];
    const ended = sessions.filter(s => s.status === 'completed');
    // Per-session: an ended class counts as "has recording" only if materials
    // are unlocked for it or the lesson itself carries a video. If ANY ended
    // class still lacks its recording, the wait message wins — that is the
    // class the student is actually waiting on.
    const anyEndedPending = ended.some(s => !(s.materials_unlocked || hasRecording));

    if (active) state = 'live';
    else if (upcoming) state = 'scheduled';
    else if (ended.length > 0) state = anyEndedPending ? 'ended-no-recording' : 'ended-with-recording';
    else state = 'scheduled'; // live-class lesson with no session yet
  }

  if (state === 'recorded') {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border border-teal-200 dark:border-teal-800/50 bg-teal-50/70 dark:bg-teal-900/20">
        <Film size={18} className="text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">Recorded lesson</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Watch the recording below at your own pace — slides, notes and quizzes are all available here.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'live') {
    const active = sessions.find(s => s.status === 'live')!;
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/70 dark:bg-red-900/20">
        <Radio size={18} className="text-red-500 flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">This class is LIVE right now</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {active.title ? `${active.title} — ` : ''}Join now so you don't miss anything.
          </p>
          {active.google_meet_url && (
            <a
              href={active.google_meet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700"
            >
              <Video size={12} /> Join Live Class
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state === 'scheduled') {
    const upcoming = sessions
      .filter(s => s.status === 'scheduled')
      .sort((a, b) => +new Date(a.session_date) - +new Date(b.session_date))[0];
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/70 dark:bg-blue-900/20">
        <Hourglass size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Live class scheduled</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {upcoming
              ? `Next class: ${new Date(upcoming.session_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`
              : 'Your faculty will schedule this live class soon.'}
            {' '}Notes and slides stay available; join live when it starts.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'ended-no-recording') {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/20">
        <Hourglass size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">This live class has ended</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Please wait — the recording will appear here once your faculty uploads it, or the class will be re-held.
          </p>
        </div>
      </div>
    );
  }

  // ended-with-recording
  const ended = sessions.find(s => s.status === 'completed')!;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-900/20">
      <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Class completed — recording available</p>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
          Watch the recording of this class whenever you like.
        </p>
        <Link
          to={`/student/live-classes/${ended.id}`}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700"
        >
          <PlayCircle size={12} /> Watch Recording
        </Link>
      </div>
    </div>
  );
}
