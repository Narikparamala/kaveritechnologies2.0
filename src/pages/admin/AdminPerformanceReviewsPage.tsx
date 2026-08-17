import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Star, Calendar, TrendingUp, User, Plus } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { addPerformanceReview } from '../../services/companyManagement';
import type { Profile, FacultyPerformanceReview } from '../../types/database';

type ReviewWithDetails = FacultyPerformanceReview & {
  faculty: Profile;
  reviewer: Profile;
};

export default function AdminPerformanceReviewsPage() {
  const { profile: admin } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [facultyList, setFacultyList] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('faculty_performance_reviews')
        .select('*, faculty:profiles!faculty_performance_reviews_faculty_id_fkey(*), reviewer:profiles!faculty_performance_reviews_reviewer_id_fkey(*)')
        .order('review_date', { ascending: false });

      if (error) throw error;
      setReviews((data ?? []) as ReviewWithDetails[]);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFaculty = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'faculty')
      .eq('is_active', true)
      .order('full_name');
    setFacultyList((data ?? []) as Profile[]);
  };

  const handleAddReview = async (input: {
    faculty_id: string;
    review_period: string;
    rating?: number;
    strengths?: string;
    improvements?: string;
    goals?: string;
    review_date: string;
  }) => {
    if (!admin) return;
    setSaving(true);
    try {
      await addPerformanceReview({
        ...input,
        reviewer_id: admin.id,
      });
      setShowAddModal(false);
      loadReviews();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to add review:', err);
    } finally {
      setSaving(false);
    }
  };

  const periods = [...new Set(reviews.map(r => r.review_period))].sort().reverse();

  const filteredReviews = reviews.filter(r => {
    const matchesSearch = !search ||
      r.faculty.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesPeriod = periodFilter === 'all' || r.review_period === periodFilter;
    return matchesSearch && matchesPeriod;
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '-';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Performance Reviews"
        subtitle="Track and manage faculty performance evaluations"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <Star className="text-amber-500 mx-auto mb-2" size={24} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{avgRating}</p>
          <p className="text-xs text-slate-500">Average Rating</p>
        </div>
        <div className="card p-4 text-center">
          <Calendar className="text-blue-500 mx-auto mb-2" size={24} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{reviews.length}</p>
          <p className="text-xs text-slate-500">Total Reviews</p>
        </div>
        <div className="card p-4 text-center">
          <TrendingUp className="text-emerald-500 mx-auto mb-2" size={24} />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{periods.length}</p>
          <p className="text-xs text-slate-500">Review Periods</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by faculty name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={periodFilter}
          onChange={e => setPeriodFilter(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="all">All Periods</option>
          {periods.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={() => { loadFaculty(); setShowAddModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Add Review
        </button>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-2" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredReviews.length === 0 ? (
        <p className="text-center text-slate-500 py-8">No performance reviews found.</p>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map(review => (
            <div key={review.id} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-600 dark:text-primary-400 font-bold text-lg">
                    {(review.faculty.full_name || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link to={`/admin/faculty-management/${review.faculty.id}`} className="font-semibold text-slate-900 dark:text-white hover:underline">
                      {review.faculty.full_name}
                    </Link>
                    <span className="text-xs text-slate-500">{review.review_period}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full ${i <= (review.rating || 0) ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{review.rating}/5</span>
                  </div>
                  {review.strengths && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                      <strong className="text-emerald-600">Strengths:</strong> {review.strengths}
                    </p>
                  )}
                  {review.improvements && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                      <strong className="text-amber-600">Areas:</strong> {review.improvements}
                    </p>
                  )}
                  {review.goals && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong className="text-blue-600">Goals:</strong> {review.goals}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    Reviewed by {review.reviewer?.full_name || 'Admin'} on {new Date(review.review_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Review Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Performance Review">
        <form onSubmit={e => { e.preventDefault(); handleAddReview({
          faculty_id: (e.target as any).faculty_id.value,
          review_period: (e.target as any).review_period.value,
          rating: parseFloat((e.target as any).rating?.value) || undefined,
          strengths: (e.target as any).strengths?.value || undefined,
          improvements: (e.target as any).improvements?.value || undefined,
          goals: (e.target as any).goals?.value || undefined,
          review_date: (e.target as any).review_date.value,
        }); }}>
          <div className="space-y-4">
            <select name="faculty_id" className="input w-full" required>
              <option value="">Select Faculty</option>
              {facultyList.map(f => (
                <option key={f.id} value={f.id}>{f.full_name}</option>
              ))}
            </select>
            <input name="review_period" placeholder="Period (e.g., Q1 2024)" className="input w-full" required />
            <input type="number" name="rating" placeholder="Rating (1-5)" min="0" max="5" step="0.5" className="input w-full" />
            <textarea name="strengths" placeholder="Strengths" className="input w-full" rows={2} />
            <textarea name="improvements" placeholder="Areas for Improvement" className="input w-full" rows={2} />
            <textarea name="goals" placeholder="Goals for Next Period" className="input w-full" rows={2} />
            <input type="date" name="review_date" className="input w-full" required />
            <button type="submit" disabled={saving} className="btn-primary w-full">Save Review</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
