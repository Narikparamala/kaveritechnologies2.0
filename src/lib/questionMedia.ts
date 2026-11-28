/**
 * Example-output media for coding questions (feature/practice-media).
 *
 * One media item per question: an uploaded gif/image/video (stored in the
 * existing public `course-content` bucket) or a YouTube URL. The type is
 * stored in `coding_questions.example_media_type` and decides how the
 * student page renders it: <video> for uploaded video, <img> for
 * gif/image, VideoEmbed for YouTube.
 *
 * The bucket whitelist (20260924110000_create_course_content_bucket.sql)
 * allows only image/png, image/jpeg, image/gif, image/webp, video/mp4,
 * video/webm, max 100 MB — validation here mirrors exactly that list so
 * a file rejected by the bucket is rejected in the UI first.
 */
import { detectEmbed } from './mediaEmbeds';

export type QuestionMediaType = 'video' | 'gif' | 'image' | 'youtube';

/** Matches the course-content bucket file_size_limit (100 MB). */
export const QUESTION_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, QuestionMediaType> = {
  'image/gif': 'gif',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
};

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

function extensionOf(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  return clean.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Media type for an already-stored URL (YouTube link or bucket file URL).
 * Returns null when the URL is not a recognisable media URL.
 */
export function detectQuestionMediaType(url: string | null | undefined): QuestionMediaType | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (detectEmbed(trimmed)?.type === 'youtube') return 'youtube';
  const ext = extensionOf(trimmed);
  if (ext === 'gif') return 'gif';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return null;
}

/** Media type for a local File, from its MIME type. Null = not allowed. */
export function inferMediaTypeFromFile(file: File): QuestionMediaType | null {
  return ALLOWED_MIME_TYPES[file.type] ?? null;
}

/**
 * Validate a file before upload. Returns its media type, or throws with a
 * plain message the UI can show. Mirrors the bucket whitelist + 100 MB cap.
 */
export function validateQuestionMediaFile(file: File): QuestionMediaType {
  const type = inferMediaTypeFromFile(file);
  if (!type) {
    throw new Error('Choose a GIF, PNG, JPG, WebP image or an MP4 / WebM video.');
  }
  if (file.size > QUESTION_MEDIA_MAX_BYTES) {
    throw new Error('File is too large — example media must be under 100 MB.');
  }
  return type;
}
