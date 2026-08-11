import { supabase } from '../lib/supabase';
import type {
  ProjectMilestone,
  ProjectRubricItem,
  ProjectSubmission,
  ProjectSubmissionFile,
} from '../types/database';

export interface ProjectSubmissionInput {
  projectId: string;
  githubUrl: string;
  liveUrl: string;
  externalUrl: string;
  description: string;
  submit: boolean;
}

export async function saveProjectSubmission(input: ProjectSubmissionInput): Promise<ProjectSubmission> {
  const { data, error } = await supabase.rpc('save_project_submission', {
    p_project_id: input.projectId,
    p_github_url: input.githubUrl || null,
    p_live_url: input.liveUrl || null,
    p_external_url: input.externalUrl || null,
    p_description: input.description || null,
    p_submit: input.submit,
  });
  if (error) throw error;
  return data as ProjectSubmission;
}

export async function getProjectSubmissionFiles(submissionId: string): Promise<ProjectSubmissionFile[]> {
  const { data, error } = await supabase
    .from('project_submission_files')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ProjectSubmissionFile[];
}

export async function getProjectGuidance(projectId: string): Promise<{
  milestones: ProjectMilestone[];
  rubric: ProjectRubricItem[];
}> {
  const [milestonesResult, rubricResult] = await Promise.all([
    supabase.from('project_milestones').select('*').eq('project_id', projectId).order('order_index'),
    supabase.from('project_rubric_items').select('*').eq('project_id', projectId).order('order_index'),
  ]);
  if (milestonesResult.error) throw milestonesResult.error;
  if (rubricResult.error) throw rubricResult.error;
  return {
    milestones: (milestonesResult.data ?? []) as ProjectMilestone[],
    rubric: (rubricResult.data ?? []) as ProjectRubricItem[],
  };
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'evidence-file';
}

export async function uploadProjectSubmissionFile(
  submission: ProjectSubmission,
  file: File,
): Promise<ProjectSubmissionFile> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Evidence files must be 20 MB or smaller.');
  const path = `${submission.student_id}/${submission.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from('project-submissions')
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('project_submission_files')
    .insert({
      submission_id: submission.id,
      student_id: submission.student_id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from('project-submissions').remove([path]);
    throw error;
  }
  return data as ProjectSubmissionFile;
}

export async function deleteProjectSubmissionFile(file: ProjectSubmissionFile): Promise<void> {
  const { error: storageError } = await supabase.storage.from('project-submissions').remove([file.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('project_submission_files').delete().eq('id', file.id);
  if (error) throw error;
}

export async function createProjectEvidenceUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('project-submissions').createSignedUrl(storagePath, 300);
  if (error) throw error;
  return data.signedUrl;
}
