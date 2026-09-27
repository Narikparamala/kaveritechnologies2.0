import { useEffect, useState } from 'react';
import {
  Briefcase, Building2, MapPin, DollarSign, Clock, Search, Filter,
  Loader2, ExternalLink, ChevronDown, ChevronUp, Send, CheckCircle,
  Globe, Users as UsersIcon, FileText, Link2,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { JobPosting, HiringCompany, JobApplication, ApplicationStatus } from '../../types/database';

const STATUS_LABELS: Record<ApplicationStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'teal' }> = {
  applied: { label: 'Applied', variant: 'info' },
  shortlisted: { label: 'Shortlisted', variant: 'teal' },
  interview: { label: 'Interview', variant: 'warning' },
  selected: { label: 'Selected', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  withdrawn: { label: 'Withdrawn', variant: 'default' },
};

export default function JobsPage() {
  const { profile } = useAuth();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<(JobPosting & { company?: HiringCompany })[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyingJob, setApplyingJob] = useState<JobPosting | null>(null);
  const [applyForm, setApplyForm] = useState({ resume_url: '', cover_letter: '', github_url: '' });
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [activeTab, setActiveTab] = useState<'browse' | 'applied'>('browse');

  useEffect(() => {
    if (profile) loadData();
  }, [profile]);

  async function loadData() {
    setLoading(true);
    try {
      const [jobsRes, appsRes] = await Promise.all([
        supabase.from('job_postings').select('*, company:hiring_companies(*)').eq('status', 'open').order('created_at', { ascending: false }),
        supabase.from('job_applications').select('*').eq('student_id', profile!.id),
      ]);
      setJobs((jobsRes.data ?? []) as any);
      setMyApplications((appsRes.data ?? []) as JobApplication[]);
    } catch {
      showError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  function hasApplied(jobId: string) {
    return myApplications.some(a => a.job_id === jobId);
  }

  function getApplication(jobId: string) {
    return myApplications.find(a => a.job_id === jobId);
  }

  function openApply(job: JobPosting) {
    setApplyingJob(job);
    setApplyForm({ resume_url: '', cover_letter: '', github_url: '' });
    setShowApplyModal(true);
  }

  async function handleApply() {
    if (!applyingJob || !profile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('job_applications').insert({
        job_id: applyingJob.id,
        student_id: profile.id,
        resume_url: applyForm.resume_url.trim() || null,
        cover_letter: applyForm.cover_letter.trim() || null,
      });
      if (error) throw error;
      success('Application submitted successfully!');
      setShowApplyModal(false);
      loadData();
    } catch (e: any) {
      showError(e.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  }

  async function withdrawApplication(appId: string) {
    if (!confirm('Withdraw your application?')) return;
    const { error } = await supabase.from('job_applications').update({ status: 'withdrawn' }).eq('id', appId);
    if (error) { showError(error.message); return; }
    success('Application withdrawn');
    loadData();
  }

  const filtered = jobs.filter(j => {
    if (filterType && j.job_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!j.title.toLowerCase().includes(q) && !(j as any).company?.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const appliedJobs = myApplications.filter(a => a.status !== 'withdrawn');

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <PageHeader
        title="Jobs & Placements"
        subtitle="Browse opportunities and track your applications"
        icon={Briefcase}
      />

      {/* Tab switch */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('browse')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'browse' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Briefcase size={15} /> Browse Jobs
        </button>
        <button
          onClick={() => setActiveTab('applied')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'applied' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={15} /> My Applications ({appliedJobs.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary-600" size={24} /></div>
      ) : activeTab === 'browse' ? (
        <>
          {/* Filters */}
          <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={16} className="text-slate-400" />
              <input className="input-field text-sm py-1.5 flex-1" placeholder="Search jobs or companies..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select className="input-field text-sm py-1.5" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="full_time">Full Time</option>
              <option value="internship">Internship</option>
              <option value="contract">Contract</option>
              <option value="part_time">Part Time</option>
            </select>
          </div>

          {/* Job Listings */}
          {filtered.length === 0 ? (
            <EmptyState icon={Briefcase} title="No jobs available" description="Check back later for new opportunities." />
          ) : (
            <div className="space-y-4">
              {filtered.map(job => {
                const applied = hasApplied(job.id);
                const isExpanded = expandedJob === job.id;
                const company = (job as any).company as HiringCompany | undefined;
                return (
                  <div key={job.id} className="card overflow-hidden transition-shadow hover:shadow-md">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {company?.logo_url ? (
                            <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                          ) : (
                            <Building2 size={20} className="text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-0.5">{job.title}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1"><Building2 size={13} /> {company?.name}</span>
                            {job.location && <span className="flex items-center gap-1"><MapPin size={13} /> {job.location}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {applied ? (
                            <Badge variant="success"><CheckCircle size={12} className="mr-1" /> Applied</Badge>
                          ) : (
                            <button onClick={() => openApply(job)} className="btn-primary text-xs flex items-center gap-1.5">
                              <Send size={13} /> Apply
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
                        <Badge variant="default" className="text-[10px] capitalize">{job.job_type.replace('_', ' ')}</Badge>
                        {(job.ctc_min || job.ctc_max) && (
                          <span className="flex items-center gap-1">
                            <DollarSign size={12} />
                            {job.ctc_min && job.ctc_max ? `${job.ctc_min}-${job.ctc_max} LPA` : job.ctc_min ? `${job.ctc_min}+ LPA` : `Up to ${job.ctc_max} LPA`}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><UsersIcon size={12} /> {job.openings} openings</span>
                        {job.apply_by && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            Deadline: {new Date(job.apply_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {job.required_skills.length > 0 && (
                        <div className="flex gap-1.5 mt-3 flex-wrap">
                          {job.required_skills.map(s => (
                            <span key={s} className="px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-[10px] font-medium text-primary-700 dark:text-primary-400">{s}</span>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                        className="mt-3 text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                      >
                        {isExpanded ? <><ChevronUp size={13} /> Less details</> : <><ChevronDown size={13} /> More details</>}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                        {job.description && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{job.description}</p>
                          </div>
                        )}
                        {job.eligibility_criteria && (
                          <div>
                            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Eligibility</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{job.eligibility_criteria}</p>
                          </div>
                        )}
                        {company?.website && (
                          <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                            <Globe size={12} /> Visit company website
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* My Applications Tab */
        appliedJobs.length === 0 ? (
          <EmptyState icon={FileText} title="No applications yet" description="Browse and apply to jobs to see them here." />
        ) : (
          <div className="space-y-3">
            {appliedJobs.map(app => {
              const job = jobs.find(j => j.id === app.job_id);
              const cfg = STATUS_LABELS[app.status];
              return (
                <div key={app.id} className="card p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <Briefcase size={18} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{job?.title || 'Job'}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{(job as any)?.company?.name}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>Applied {new Date(app.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {app.interview_date && (
                          <span className="text-amber-600 font-medium flex items-center gap-1">
                            <Clock size={11} /> Interview: {new Date(app.interview_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {app.offer_ctc && (
                          <span className="text-emerald-600 font-medium">Offer: {app.offer_ctc} LPA</span>
                        )}
                      </div>
                      {app.interview_notes && (
                        <p className="text-xs text-slate-500 mt-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 italic">"{app.interview_notes}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {(app.status === 'applied' || app.status === 'shortlisted') && (
                        <button onClick={() => withdrawApplication(app.id)} className="text-xs text-red-500 hover:underline">Withdraw</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Apply Modal */}
      <Modal open={showApplyModal} onClose={() => setShowApplyModal(false)} title={`Apply for ${applyingJob?.title || 'Job'}`} size="md">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400">
            {(applyingJob as any)?.company?.name && (
              <p className="font-medium text-slate-900 dark:text-white">{(applyingJob as any).company.name}</p>
            )}
            {applyingJob?.location && <p className="text-xs mt-0.5">{applyingJob.location}</p>}
          </div>
          <div>
            <label className="label">Resume URL</label>
            <input className="input" value={applyForm.resume_url} onChange={e => setApplyForm(f => ({ ...f, resume_url: e.target.value }))} placeholder="Link to your resume (Google Drive, etc.)" />
          </div>
          <div>
            <label className="label">Cover Letter (optional)</label>
            <textarea className="input min-h-[100px]" value={applyForm.cover_letter} onChange={e => setApplyForm(f => ({ ...f, cover_letter: e.target.value }))} placeholder="Why are you a good fit for this role?" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowApplyModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleApply} disabled={submitting} className="btn-primary text-sm flex items-center gap-1.5">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
