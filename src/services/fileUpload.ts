import { supabase } from '../lib/supabase';

const BUCKET = 'course-content';

export interface UploadResult {
  path: string;
  publicUrl: string;
  fileName: string;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .slice(0, 200);
}

function buildPath(segments: string[], fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const timestamp = Date.now();
  return [...segments, `${timestamp}_${sanitized}`].join('/');
}

export async function uploadFile(
  file: File,
  pathSegments: string[],
): Promise<UploadResult> {
  const path = buildPath(pathSegments, file.name);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return {
    path,
    publicUrl: urlData.publicUrl,
    fileName: file.name,
  };
}

export async function uploadCourseFile(
  courseId: string,
  category: 'thumbnails' | 'resources' | 'assignments' | 'submissions',
  file: File,
): Promise<UploadResult> {
  return uploadFile(file, [courseId, category]);
}

export async function uploadLessonFile(
  courseId: string,
  lessonId: string,
  resourceType: string,
  file: File,
): Promise<UploadResult> {
  return uploadFile(file, [courseId, lessonId, resourceType]);
}

export async function uploadExamFile(
  examId: string,
  studentId: string,
  file: File,
): Promise<UploadResult> {
  return uploadFile(file, ['exams', examId, studentId]);
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function getFileTypeLabel(fileName: string): string {
  const ext = getFileExtension(fileName);
  const map: Record<string, string> = {
    pdf: 'PDF',
    ppt: 'PowerPoint',
    pptx: 'PowerPoint',
    doc: 'Word',
    docx: 'Word',
    zip: 'ZIP Archive',
    png: 'Image',
    jpg: 'Image',
    jpeg: 'Image',
    gif: 'Image',
    webp: 'Image',
    svg: 'SVG',
    mp4: 'Video',
    webm: 'Video',
    txt: 'Text',
    md: 'Markdown',
    csv: 'CSV',
    json: 'JSON',
    py: 'Python',
    js: 'JavaScript',
    ts: 'TypeScript',
  };
  return map[ext] ?? ext.toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const ACCEPTED_FILE_TYPES = {
  documents: '.pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv',
  images: '.png,.jpg,.jpeg,.gif,.webp,.svg',
  videos: '.mp4,.webm',
  code: '.py,.js,.ts,.json,.txt',
  all: '.pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,.zip,.py,.js,.ts,.json',
};
