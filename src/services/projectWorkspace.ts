import { supabase } from '../lib/supabase';
import type { Project, ProjectStarterFile, ProjectWorkspaceFile } from '../types/database';

export async function loadProjectWorkspace(projectId: string, studentMode: boolean) {
  const [{ data: project, error: projectError }, { data: starter, error: starterError }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('project_starter_files').select('*').eq('project_id', projectId).order('order_index'),
  ]);
  if (projectError) throw projectError;
  if (starterError) throw starterError;
  if (!studentMode) return { project: project as Project, files: starter as ProjectStarterFile[] };

  const { data: existing, error: existingError } = await supabase
    .from('project_workspace_files').select('*').eq('project_id', projectId).order('order_index');
  if (existingError) throw existingError;
  if (existing?.length) return { project: project as Project, files: existing as ProjectWorkspaceFile[] };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('You must sign in to create a project workspace.');

  const initial = (starter as ProjectStarterFile[]).map((file, index) => ({
    project_id: projectId, student_id: authData.user.id, file_path: file.file_path, content: file.content,
    language: file.language, order_index: index,
  }));
  if (!initial.length) initial.push({ project_id: projectId, student_id: authData.user.id, file_path: 'README.md', content: '# Start building here\n', language: 'markdown', order_index: 0 });
  const { data: created, error: createError } = await supabase
    .from('project_workspace_files').upsert(initial, { onConflict: 'project_id,student_id,file_path' }).select();
  if (createError) throw createError;
  return { project: project as Project, files: created as ProjectWorkspaceFile[] };
}

export async function saveWorkspaceFile(id: string, content: string) {
  const { error } = await supabase.from('project_workspace_files').update({ content }).eq('id', id);
  if (error) throw error;
}
