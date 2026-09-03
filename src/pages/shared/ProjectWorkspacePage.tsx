import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Code2, Eye, FileCode2, Loader2, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import { loadProjectWorkspace, saveWorkspaceFile } from '../../services/projectWorkspace';
import type { Project, ProjectStarterFile, ProjectWorkspaceFile } from '../../types/database';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));
type WorkspaceFile = ProjectStarterFile | ProjectWorkspaceFile;

function editorLanguage(file: WorkspaceFile) {
  const extension = file.file_path.split('.').pop()?.toLowerCase();
  return ({ js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown', java: 'java', cs: 'csharp' } as Record<string, string>)[extension ?? ''] || file.language || 'plaintext';
}

function previewDocument(files: WorkspaceFile[]) {
  const html = files.find(file => /(^|\/)index\.html$/i.test(file.file_path))?.content ?? '<main><h1>Add index.html to preview your project</h1></main>';
  const css = files.filter(file => file.file_path.endsWith('.css')).map(file => file.content).join('\n');
  const js = files.filter(file => file.file_path.endsWith('.js')).map(file => file.content).join('\n');
  return html.replace('</head>', `<style>${css}</style></head>`).replace('</body>', `<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body>`);
}

export default function ProjectWorkspacePage({ mode }: { mode: 'student' | 'faculty' }) {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const studentMode = mode === 'student';
  const active = files.find(file => file.id === activeId) ?? files[0];
  const canPreview = project?.project_type === 'html_css_js';
  const srcDoc = useMemo(() => previewDocument(files), [files]);

  useEffect(() => {
    loadProjectWorkspace(projectId, studentMode).then(result => {
      setProject(result.project); setFiles(result.files); setActiveId(result.files[0]?.id ?? '');
    }).catch(error => toastError('Could not open workspace', error.message)).finally(() => setLoading(false));
  }, [projectId, studentMode, toastError]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const updateContent = (content: string) => {
    if (!active || !studentMode) return;
    setFiles(current => current.map(file => file.id === active.id ? { ...file, content } : file));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(active.id, content, false), 900);
  };

  const persist = async (id = active?.id, content = active?.content, notify = true) => {
    if (!id || content === undefined || !studentMode) return;
    setSaving(true);
    try { await saveWorkspaceFile(id, content); if (notify) success('Project files saved'); }
    catch (error) { toastError('Could not save file', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSaving(false); }
  };

  const openInVsCode = async () => {
    if (!studentMode || !projectId) return;
    window.clearTimeout(timer.current);
    await persist(active?.id, active?.content, false);
    const query = new URLSearchParams({ projectId, lmsOrigin: window.location.origin });
    const uri = `vscode://kaveritechnologies.kaveri-coding/open-project?${query.toString()}`;
    window.location.assign(uri);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!project || !active) return <div className="p-8">This project workspace is unavailable.</div>;

  return <div className="flex h-screen flex-col bg-slate-950 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><button onClick={() => navigate(mode === 'faculty' ? '/faculty/projects' : '/student/projects')} className="rounded-lg p-2 hover:bg-slate-800"><ArrowLeft size={18} /></button><div className="min-w-0"><h1 className="truncate font-semibold">{project.title}</h1><p className="text-xs text-slate-400">{studentMode ? 'Your saved workspace' : 'Faculty starter-file preview (read only)'}</p></div></div>
      {studentMode && <div className="flex items-center gap-2">
        <button onClick={() => void persist()} disabled={saving} className="btn-secondary flex items-center gap-2"><Save size={14} />{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => void openInVsCode()} disabled={saving} className="btn-primary flex items-center gap-2"><Code2 size={14} />Open in VS Code</button>
      </div>}
    </header>
    {!canPreview && <div className="border-b border-amber-800/50 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">Files are saved here. Secure execution for {project.project_type.replaceAll('_', ' ')} projects will be added through an isolated cloud sandbox.</div>}
    <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_40%]">
      <aside className="border-r border-slate-800 bg-slate-900 p-2"><p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Files</p>{files.map(file => <button key={file.id} onClick={() => setActiveId(file.id)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active.id === file.id ? 'bg-primary-600' : 'hover:bg-slate-800'}`}><FileCode2 size={14} /><span className="truncate">{file.file_path}</span></button>)}</aside>
      <section className="min-h-[420px] min-w-0"><Suspense fallback={<div className="p-4">Loading editor…</div>}><MonacoEditor height="100%" theme="vs-dark" language={editorLanguage(active)} value={active.content} onChange={value => updateContent(value ?? '')} options={{ readOnly: !studentMode, minimap: { enabled: false }, automaticLayout: true, fontSize: 14, padding: { top: 14 } }} /></Suspense></section>
      {canPreview && <section className="hidden min-w-0 flex-col border-l border-slate-800 bg-white xl:flex"><div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-xs text-slate-300"><Eye size={14} /> Live Preview</div><iframe title="Project preview" sandbox="allow-scripts" srcDoc={srcDoc} className="h-full w-full bg-white" /></section>}
    </main>
  </div>;
}
