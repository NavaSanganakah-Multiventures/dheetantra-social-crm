import React, { useState, useEffect } from 'react';
import { MessageSquare, CalendarClock, Activity, Users, Zap } from 'lucide-react';

export function DashboardOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/workspace', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      setStats(data.stats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-surface-500">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 md:p-10 w-full max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white font-display">Welcome back!</h2>
        <p className="text-surface-500 dark:text-surface-400">Here is an overview of your workspace.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Contacts" value={stats?.totalContacts?.toString() || "0"} trend="+12% from last week" icon={<Users />} />
        <StatCard title="Open Conversations" value={stats?.openConversations?.toString() || "0"} trend="Active connections" icon={<Activity />} />
        <StatCard title="Broadcasts Sent" value={stats?.broadcastsSent?.toString() || "0"} trend="+5% from last month" icon={<Zap />} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-surface-900 dark:text-white font-display">Recent Conversations</h3>
            <button className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">View all</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
              <MessageSquare className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-3" />
              <p className="text-sm text-surface-600 dark:text-surface-400">No active conversations found.</p>
              <p className="text-xs text-surface-500 mt-1">Sync your API or receive messages.</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-surface-900 dark:text-white font-display">Upcoming Posts</h3>
            <button className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">Schedule</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
              <CalendarClock className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-3" />
              <p className="text-sm text-surface-600 dark:text-surface-400">No scheduled posts.</p>
              <p className="text-xs text-surface-500 mt-1">Create a new post in the Scheduling tab.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatCard({ title, value, trend, icon }: { title: string, value: string, trend: string, icon?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:border-primary-500/30 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-surface-500 dark:text-surface-400 text-sm font-medium">{title}</h3>
        {icon && <div className="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 flex items-center justify-center group-hover:bg-primary-500 group-hover:text-white transition-colors">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-surface-900 dark:text-white font-display">{value}</span>
      </div>
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-medium bg-emerald-50 dark:bg-emerald-500/10 inline-block px-2 py-1 rounded-md">{trend}</p>
    </div>
  );
}

