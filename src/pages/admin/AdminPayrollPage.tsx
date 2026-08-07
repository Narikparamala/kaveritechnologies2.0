import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Calendar, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { supabase } from '../../lib/supabase';
import { getAllFacultyEmployment, getFacultyCompensationHistory } from '../../services/companyManagement';
import type { Profile, FacultyEmployment, FacultyCompensationHistory } from '../../types/database';

interface PayrollEntry {
  faculty: Profile;
  employment: FacultyEmployment;
  baseSalary: number;
  incentives: number;
  deductions: number;
  totalPayable: number;
}

export default function AdminPayrollPage() {
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadPayroll();
  }, []);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const employmentData = await getAllFacultyEmployment();
      const activeFaculty = employmentData.filter(e => e.employment_status === 'active' && e.faculty);

      const entries = await Promise.all(activeFaculty.map(async (e) => {
        const compHistory = await getFacultyCompensationHistory(e.faculty_id);

        // Calculate current month incentives/deductions
        const monthStart = new Date(selectedMonth + '-01');
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const monthRecords = compHistory.filter(c => {
          const date = new Date(c.effective_date);
          return date >= monthStart && date < monthEnd;
        });

        const incentives = monthRecords
          .filter(c => c.change_type === 'incentive' || c.change_type === 'bonus')
          .reduce((sum, c) => sum + (c.amount || 0), 0);

        const deductions = monthRecords
          .filter(c => c.change_type === 'deduction')
          .reduce((sum, c) => sum + (c.amount || 0), 0);

        return {
          faculty: e.faculty!,
          employment: e,
          baseSalary: e.base_salary || 0,
          incentives,
          deductions,
          totalPayable: (e.base_salary || 0) + incentives - deductions,
        };
      }));

      setPayroll(entries);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load payroll:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalPayable = payroll.reduce((sum, e) => sum + e.totalPayable, 0);
  const totalBase = payroll.reduce((sum, e) => sum + e.baseSalary, 0);
  const totalIncentives = payroll.reduce((sum, e) => sum + e.incentives, 0);
  const totalDeductions = payroll.reduce((sum, e) => sum + e.deductions, 0);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <PageHeader
        title="Payroll"
        subtitle="Monthly payroll tracking for active faculty"
      />

      {/* Info Banner */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Payroll Management
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              This is a management tracking system. Actual payments must be processed through your bank or payment gateway separately.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-slate-500 mb-1">Active Faculty</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{payroll.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 mb-1">Total Base Salary</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalBase)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp size={12} className="text-emerald-500" />
            <p className="text-xs text-slate-500">Incentives</p>
          </div>
          <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalIncentives)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown size={12} className="text-red-500" />
            <p className="text-xs text-slate-500">Deductions</p>
          </div>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalDeductions)}</p>
        </div>
      </div>

      {/* Total Payable */}
      <div className="card p-6 mb-6 bg-gradient-to-r from-primary-50 to-teal-50 dark:from-primary-900/20 dark:to-teal-900/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Payable for {new Date(selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totalPayable)}</p>
          </div>
          <DollarSign size={48} className="text-primary-300 dark:text-primary-700" />
        </div>
      </div>

      {/* Payroll Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Faculty</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Base Salary</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Incentives</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Deductions</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Total Payable</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : payroll.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No active faculty with salary data</td></tr>
              ) : (
                payroll.map(entry => (
                  <tr key={entry.faculty.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/faculty-management/${entry.faculty.id}`} className="flex items-center gap-3 hover:underline">
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary-600">{entry.faculty.full_name?.[0] || '?'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{entry.faculty.full_name}</p>
                          <p className="text-xs text-slate-500">{entry.employment.designation || 'Faculty'}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-900 dark:text-white">{formatCurrency(entry.baseSalary)}</td>
                    <td className="px-4 py-3 text-right text-sm text-emerald-600">+{formatCurrency(entry.incentives)}</td>
                    <td className="px-4 py-3 text-right text-sm text-red-600">-{formatCurrency(entry.deductions)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(entry.totalPayable)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/faculty-management/${entry.faculty.id}`} className="text-xs text-primary-600 hover:underline">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
