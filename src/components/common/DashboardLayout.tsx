import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DashboardLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function DashboardLayout({ sidebar, children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close */}
        <button
          className="absolute top-4 right-4 lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={18} className="text-slate-500" />
        </button>
        {sidebar}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
          <span className="font-semibold text-slate-900 dark:text-white">Kaveri Academy</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
