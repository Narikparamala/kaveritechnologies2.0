/**
 * "Example output" section for the student practice page
 * (feature/practice-media). New section only — the existing Examples
 * (visible test cases) above it are untouched.
 *
 * Renders nothing when the question has no example media. Otherwise:
 * - youtube  -> VideoEmbed (same YouTube player lessons use)
 * - video    -> native <video controls> (uploaded MP4/WebM in course-content)
 * - gif/image -> <img> (uploaded file in course-content)
 * The stored example_media_type decides; when it is missing, the type is
 * detected from the URL so older/partial rows still render.
 */
import { detectQuestionMediaType, type QuestionMediaType } from '../../lib/questionMedia';
import { VideoEmbed } from './workspace/VideoEmbed';

export type ExampleMediaQuestion = {
  example_media_url: string | null;
  example_media_type: QuestionMediaType | string | null;
  example_media_title: string | null;
};

export default function ExampleOutputMedia({ question }: { question: ExampleMediaQuestion }) {
  const url = question.example_media_url?.trim() || '';
  if (!url) return null;

  const type = (question.example_media_type as QuestionMediaType | null)
    ?? detectQuestionMediaType(url);
  const title = question.example_media_title?.trim() || 'Example output';

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Example output</h3>
      {type === 'youtube' ? (
        <VideoEmbed videoUrl={url} title={title} />
      ) : type === 'video' ? (
        <video controls preload="metadata" src={url} title={title} className="w-full rounded-xl bg-slate-900" />
      ) : type === 'gif' || type === 'image' ? (
        <img src={url} alt={title} loading="lazy" className="w-full rounded-xl border border-slate-200 dark:border-slate-700" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary-600 hover:underline">
          {title} — open media
        </a>
      )}
      {question.example_media_title?.trim() && type !== 'youtube' && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{question.example_media_title}</p>
      )}
    </div>
  );
}
