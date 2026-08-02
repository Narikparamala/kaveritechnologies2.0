import { useEffect, useState } from 'react';
import {
  Briefcase, Plus, Building2, Search, Filter, Loader2, MoreVertical,
  Edit, Trash2, Eye, MapPin, DollarSign, Clock, Users, ChevronRight,
  ExternalLink, Globe, CheckCircle, XCircle, Pause,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { HiringCompany, JobPosting, JobApplication, JobStatus, JobType, ApplicationStatus, Profile } from '../../types/database';

type ViewMode = 'companies' | 'jobs' | 'applications';

const JOB_STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'success' | 'default' | 'warning' | 'info' }> = {
  open: { label: 'Open', variant: 'success' },
  closed: { label: 'Closed', variant: 'default' },
  on_hold: { label: 'On Hold', variant: 'warning' },
  filled: { label: 'Filled', variant: 'info' },
};

const APP_STATUS_CONFIG: Record<ApplicationStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'teal' }> = {
  applied: { label: 'Applied', variant: 'default' },
  shortlisted: { label: 'Shortlisted', variant: 'info' },
  interview: { label: 'Interview', variant: 'warning' },
  selected: { label: 'Selected', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  withdrawn: { label: 'Withdrawn', variant: 'default' },
};

export default function AdminPlacementsPage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [view, setView] = useState<ViewMode>('jobs');
  const [loading, setLoading] = useState(true);

  // Companies
  const [companies, setCompanies] = useState<HiringCompany[]>([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<HiringCompany | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: '', logo_url: '', website: '', industry: '', description: '', location: '' });

  // Jobs
  const [jobs, setJobs] = useState<(JobPosting & { company?: HiringCompany; application_count?: number })[]>([]);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [jobForm, setJobForm] = useState({
    company_id: '', title: '', description: '', location: '', job_type: 'full_time' as JobType,
    ctc_min: '', ctc_max: '', openings: 1, eligibility_criteria: '', required_skills: '',
    apply_by: '', status: 'open' as JobStatus,
  });

  // Applications
  const [applications, setApplications] = useState<(JobApplication & { job?: JobPosting & { company?: HiringCompany }; student?: Profile })[]>([]);
  const [filterJobId, setFilterJobId] = useState('');
  const [filterAppStatus, setFilterAppStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [compRes, jobRes, appRes] = await Promise.all([
        supabase.from('hiring_companies').select('*').order('name'),
        supabase.from('job_postings').select('*, company:hiring_companies(*)').order('created_at', { ascending: false }),
        supabase.from('job_applications').select('*, job:job_postings(*, company:hiring_companies(*)), student:profiles(*)').order('applied_at', { ascending: false }),
      ]);

      setCompanies((compRes.data ?? []) as HiringCompany[]);

      const appData = (appRes.data ?? []) as any[];
      const appCountMap: Record<string, number> = {};
      appData.forEach((a: any) => { appCountMap[a.job_id] = (appCountMap[a.job_id] || 0) + 1; });

      setJobs(((jobRes.data ?? []) as any[]).map(j => ({ ...j, application_count: appCountMap[j.id] || 0 })));
      setApplications(appData);
    } catch {
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // --- Companies CRUD ---
  function openCreateCompany() {
    setEditingCompany(null);
    setCompanyForm({ name: '', logo_url: '', website: '', industry: '', description: '', location: '' });
    setShowCompanyModal(true);
  }

  function openEditCompany(c: HiringCompany) {
    setEditingCompany(c);
    setCompanyForm({
      name: c.name, logo_url: c.logo_url || '', website: c.website || '',
      industry: c.industry || '', description: c.description || '', location: c.location || '',
    });
    setShowCompanyModal(true);
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) { showError('Company name is required'); return; }
    const payload = {
      name: companyForm.name.trim(),
      logo_url: companyForm.logo_url.trim() || null,
      website: companyForm.website.trim() || null,
      industry: companyForm.industry.trim() || null,
      description: companyForm.description.trim() || null,
      location: companyForm.location.trim() || null,
    };
    const { error } = editingCompany
      ? await supabase.from('hiring_companies').update(payload).eq('id', editingCompany.id)
      : await supabase.from('hiring_companies').insert(payload);
    if (error) { showError(error.message); return; }
    success(editingCompany ? 'Company updated' : 'Company added');
    setShowCompanyModal(false);
    loadAll();
  }

  async function deleteCompany(id: string) {
    if (!confirm('Delete this company? All associated job postings will also be affected.')) return;
    const { error } = await supabase.from('hiring_companies').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Company deleted');
    loadAll();
  }

  // --- Jobs CRUD ---
  function openCreateJob() {
    setEditingJob(null);
    setJobForm({
      company_id: companies[0]?.id || '', title: '', description: '', location: '',
      job_type: 'full_time', ctc_min: '', ctc_max: '', openings: 1,
      eligibility_criteria: '', required_skills: '', apply_by: '', status: 'open',
    });
    setShowJobModal(true);
  }

  function openEditJob(j: JobPosting) {
    setEditingJob(j);
    setJobForm({
      company_id: j.company_id, title: j.title, description: j.description || '',
      location: j.location || '', job_type: j.job_type, ctc_min: j.ctc_min?.toString() || '',
      ctc_max: j.ctc_max?.toString() || '', openings: j.openings,
      eligibility_criteria: j.eligibility_criteria || '',
      required_skills: j.required_skills.join(', '), apply_by: j.apply_by?.split('T')[0] || '',
      status: j.status,
    });
    setShowJobModal(true);
  }

  async function saveJob() {
    if (!jobForm.title.trim() || !jobForm.company_id) { showError('Title and company are required'); return; }
    const payload = {
      company_id: jobForm.company_id,
      title: jobForm.title.trim(),
      description: jobForm.description.trim() || null,
      location: jobForm.location.trim() || null,
      job_type: jobForm.job_type,
      ctc_min: jobForm.ctc_min ? parseFloat(jobForm.ctc_min) : null,
      ctc_max: jobForm.ctc_max ? parseFloat(jobForm.ctc_max) : null,
      openings: jobForm.openings,
      eligibility_criteria: jobForm.eligibility_criteria.trim() || null,
      required_skills: jobForm.required_skills.split(',').map(s => s.trim()).filter(Boolean),
      apply_by: jobForm.apply_by || null,
      status: jobForm.status,
      ...(editingJob ? {} : { created_by: profile?.id }),
    };
    const { error } = editingJob
      ? await supabase.from('job_postings').update(payload).eq('id', editingJob.id)
      : await supabase.from('job_postings').insert(payload);
    if (error) { showError(error.message); return; }
    success(editingJob ? 'Job updated' : 'Job posted');
    setShowJobModal(false);
    loadAll();
  }

  async function deleteJob(id: string) {
    if (!confirm('Delete this job posting?')) return;
    const { error } = await supabase.from('job_postings').delete().eq('id', id);
    if (error) { showError(error.message); return; }
    success('Job deleted');
    loadAll();
  }

  // --- Applications ---
  async function updateApplicationStatus(id: string, status: ApplicationStatus) {
    const { error } = await supabase.from('job_applications').update({ status }).eq('id', id);
    if (error) { showError(error.message); return; }
    success('Application status updated');
    loadAll();
  }

  const filteredApps = applications.filter(a => {
    if (filterJobId && a.job_id !== filterJobId) return false;
    if (filterAppStatus && a.status !== filterAppStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const studentName = (a.student?.full_name || a.student?.email || '').toLowerCase();
      if (!studentName.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Placements & Jobs"
        subtitle="Manage companies, job postings, and student applications"
        icon={Briefcase}
        action={
          <div className="flex gap-2">
            {view === 'companies' && (
              <button onClick={openCreateCompany} className="btn-primary text-sm flex items-center gap-1.5"><Plus size={16} /> Add Company</button>
            )}
            {view === 'jobs' && (
              <button onClick={openCreateJob} className="btn-primary text-sm flex items-center gap-1.5"><Plus size={16} /> Post Job</button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{companies.length}</p>
          <p className="text-xs text-slate-500">Companies</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{jobs.filter(j => j.status === 'open').length}</p>
          <p className="text-xs text-slate-500">Open Jobs</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{applications.length}</p>
          <p className="text-xs text-slate-500">Applications</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{applications.filter(a => a.status === 'interview').length}</p>
          <p className="text-xs text-slate-500">In Interview</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-teal-600">{applications.filter(a => a.status === 'selected').length}</p>
          <p className="text-xs text-slate-500">Selected</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        {([
          { key: 'jobs' as ViewMode, label: 'Job Postings', icon: Briefcase },
          { key: 'companies' as ViewMode, label: 'Companies', icon: Building2 },
          { key: 'applications' as ViewMode, label: 'Applications', icon: Users },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              view === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary-600" size={24} /></div>
      ) : (
        <>
          {/* Companies View */}
          {view === 'companies' && (
            companies.length === 0 ? (
              <EmptyState icon={Building2} title="No companies" description="Add hiring companies to get started." action={<button onClick={openCreateCompany} className="btn-primary text-sm">Add Company</button>} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map(c => (
                  <div key={c.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 size={18} className="text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.name}</h3>
                        {c.industry && <p className="text-xs text-slate-500">{c.industry}</p>}
                      </div>
                    </div>
                    {c.location && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mb-1"><MapPin size={11} /> {c.location}</p>
                    )}
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mb-2">
                        <Globe size={11} /> Website
                      </a>
                    )}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <button onClick={() => openEditCompany(c)} className="btn-ghost text-xs flex-1 flex items-center justify-center gap-1"><Edit size={12} /> Edit</button>
                      <button onClick={() => deleteCompany(c.id)} className="btn-ghost text-xs text-red-500 hover:text-red-600 flex-1 flex items-center justify-center gap-1"><Trash2 size={12} /> Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Jobs View */}
          {view === 'jobs' && (
            jobs.length === 0 ? (
              <EmptyState icon={Briefcase} title="No job postings" description="Create your first job posting." action={<button onClick={openCreateJob} className="btn-primary text-sm">Post Job</button>} />
            ) : (
              <div className="space-y-3">
                {jobs.map(j => {
                  const cfg = JOB_STATUS_CONFIG[j.status];
                  return (
                    <div key={j.id} className="card p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                          <Briefcase size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{j.title}</h3>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            <Badge variant="default" className="text-[10px]">{j.job_type.replace('_', ' ')}</Badge>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            {(j as any).company?.name}
                            {j.location && <> &middot; {j.location}</>}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                            {(j.ctc_min || j.ctc_max) && (
                              <span className="flex items-center gap-1">
                                <DollarSign size={12} />
                                {j.ctc_min && j.ctc_max ? `${j.ctc_min}-${j.ctc_max} LPA` : j.ctc_min ? `${j.ctc_min}+ LPA` : `Up to ${j.ctc_max} LPA`}
                              </span>
                            )}
                            <span className="flex items-center gap-1"><Users size={12} /> {j.openings} openings</span>
                            <span className="flex items-center gap-1"><Users size={12} /> {j.application_count} applications</span>
                            {j.apply_by && (
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                Apply by {new Date(j.apply_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {j.required_skills.length > 0 && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {j.required_skills.slice(0, 5).map(s => (
                                <span key={s} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => openEditJob(j)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-400 hover:text-slate-600">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => deleteJob(j.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-slate-400 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Applications View */}
          {view === 'applications' && (
            <>
              <div className="card p-4 mb-4 flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Search size={16} className="text-slate-400" />
                  <input className="input-field text-sm py-1.5 flex-1" placeholder="Search by student name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <select className="input-field text-sm py-1.5" value={filterJobId} onChange={e => setFilterJobId(e.target.value)}>
                  <option value="">All Jobs</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.title} - {(j as any).company?.name}</option>)}
                </select>
                <select className="input-field text-sm py-1.5" value={filterAppStatus} onChange={e => setFilterAppStatus(e.target.value)}>
                  <option value="">All Status</option>
                  {Object.entries(APP_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {filteredApps.length === 0 ? (
                <EmptyState icon={Users} title="No applications found" description="No job applications match your filters." />
              ) : (
                <div className="card divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredApps.map(a => {
                    const cfg = APP_STATUS_CONFIG[a.status];
                    return (
                      <div key={a.id} className="flex items-center gap-4 px-5 py-4">
                        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-400 flex-shrink-0">
                          {(a.student?.full_name || a.student?.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{a.student?.full_name || a.student?.email}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {(a.job as any)?.title} at {(a.job as any)?.company?.name}
                          </p>
                        </div>
                        {a.offer_ctc && (
                          <span className="text-xs text-emerald-600 font-medium">{a.offer_ctc} LPA</span>
                        )}
                        <select
                          className="input-field text-xs py-1 w-32"
                          value={a.status}
                          onChange={e => updateApplicationStatus(a.id, e.target.value as ApplicationStatus)}
                        >
                          {Object.entries(APP_STATUS_CONFIG).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Company Modal */}
      <Modal open={showCompanyModal} onClose={() => setShowCompanyModal(false)} title={editingCompany ? 'Edit Company' : 'Add Company'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Company Name *</label>
            <input className="input" value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Industry</label>
              <input className="input" value={companyForm.industry} onChange={e => setCompanyForm(f => ({ ...f, industry: e.target.value }))} placeholder="e.g. Technology" />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={companyForm.location} onChange={e => setCompanyForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Bangalore, India" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Website</label>
              <input className="input" value={companyForm.website} onChange={e => setCompanyForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input className="input" value={companyForm.logo_url} onChange={e => setCompanyForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px]" value={companyForm.description} onChange={e => setCompanyForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowCompanyModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={saveCompany} className="btn-primary text-sm">{editingCompany ? 'Update' : 'Add Company'}</button>
          </div>
        </div>
      </Modal>

      {/* Job Modal */}
      <Modal open={showJobModal} onClose={() => setShowJobModal(false)} title={editingJob ? 'Edit Job' : 'Post New Job'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Job Title *</label>
              <input className="input" value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="label">Company *</label>
              <select className="input" value={jobForm.company_id} onChange={e => setJobForm(f => ({ ...f, company_id: e.target.value }))}>
                <option value="">Select company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Job Type</label>
              <select className="input" value={jobForm.job_type} onChange={e => setJobForm(f => ({ ...f, job_type: e.target.value as JobType }))}>
                <option value="full_time">Full Time</option>
                <option value="internship">Internship</option>
                <option value="contract">Contract</option>
                <option value="part_time">Part Time</option>
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Remote" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={jobForm.status} onChange={e => setJobForm(f => ({ ...f, status: e.target.value as JobStatus }))}>
                <option value="open">Open</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">Closed</option>
                <option value="filled">Filled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input min-h-[80px]" value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} placeholder="Job description..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">CTC Min (LPA)</label>
              <input type="number" className="input" value={jobForm.ctc_min} onChange={e => setJobForm(f => ({ ...f, ctc_min: e.target.value }))} />
            </div>
            <div>
              <label className="label">CTC Max (LPA)</label>
              <input type="number" className="input" value={jobForm.ctc_max} onChange={e => setJobForm(f => ({ ...f, ctc_max: e.target.value }))} />
            </div>
            <div>
              <label className="label">Openings</label>
              <input type="number" className="input" min={1} value={jobForm.openings} onChange={e => setJobForm(f => ({ ...f, openings: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Required Skills (comma-separated)</label>
              <input className="input" value={jobForm.required_skills} onChange={e => setJobForm(f => ({ ...f, required_skills: e.target.value }))} placeholder="React, Node.js, Python" />
            </div>
            <div>
              <label className="label">Apply By</label>
              <input type="date" className="input" value={jobForm.apply_by} onChange={e => setJobForm(f => ({ ...f, apply_by: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Eligibility Criteria</label>
            <textarea className="input min-h-[60px]" value={jobForm.eligibility_criteria} onChange={e => setJobForm(f => ({ ...f, eligibility_criteria: e.target.value }))} placeholder="Minimum qualifications..." />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowJobModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={saveJob} className="btn-primary text-sm">{editingJob ? 'Update Job' : 'Post Job'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
