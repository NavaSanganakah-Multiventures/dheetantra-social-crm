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
    return <div className="p-8 text-sm text-zinc-500">à¤¡à¥ˆà¤¶à¤¬à¥‹à¤°à¥à¤¡ à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...</div>;
  }

  return (
    <div className="p-6 md:p-10 w-full max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">à¤†à¤ªà¤•à¤¾ à¤¸à¥à¤µà¤¾à¤—à¤¤ à¤¹à¥ˆ!</h2>
        <p className="text-zinc-500 dark:text-zinc-400">à¤¯à¤¹à¤¾à¤ à¤†à¤ªà¤•à¥‡ à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤•à¤¾ à¤…à¤µà¤²à¥‹à¤•à¤¨ à¤¹à¥ˆà¥¤</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="à¤•à¥à¤² à¤¸à¤‚à¤ªà¤°à¥à¤• (Contacts)" value={stats?.totalContacts?.toString() || "0"} trend="+12% à¤ªà¤¿à¤›à¤²à¥‡ à¤¸à¤ªà¥à¤¤à¤¾à¤¹ à¤¸à¥‡" icon={<Users />} />
        <StatCard title="à¤–à¥à¤²à¥€ à¤¬à¤¾à¤¤à¤šà¥€à¤¤" value={stats?.openConversations?.toString() || "0"} trend="à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤•à¤¨à¥‡à¤•à¥à¤¶à¤¨" icon={<Activity />} />
        <StatCard title="à¤¬à¥à¤°à¥‰à¤¡à¤•à¤¾à¤¸à¥à¤Ÿ à¤­à¥‡à¤œà¥‡ à¤—à¤" value={stats?.broadcastsSent?.toString() || "0"} trend="+5% à¤ªà¤¿à¤›à¤²à¥‡ à¤®à¤¹à¥€à¤¨à¥‡ à¤¸à¥‡" icon={<Zap />} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">à¤¹à¤¾à¤² à¤•à¥€ à¤¬à¤¾à¤¤à¤šà¥€à¤¤</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">à¤¸à¤­à¥€ à¤¦à¥‡à¤–à¥‡à¤‚</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">à¤•à¥‹à¤ˆ à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¥€à¥¤</p>
              <p className="text-xs text-zinc-500 mt-1">à¤…à¤ªà¤¨à¤¾ API à¤¸à¤¿à¤‚à¤• à¤•à¤°à¥‡à¤‚ à¤¯à¤¾ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤ à¤•à¤°à¥‡à¤‚à¥¤</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">à¤†à¤—à¤¾à¤®à¥€ à¤ªà¥‹à¤¸à¥à¤Ÿà¥à¤¸</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">à¤¶à¥‡à¤¡à¥à¤¯à¥‚à¤² à¤•à¤°à¥‡à¤‚</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <CalendarClock className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">à¤•à¥‹à¤ˆ à¤ªà¥‹à¤¸à¥à¤Ÿ à¤¶à¥‡à¤¡à¥à¤¯à¥‚à¤² à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤</p>
              <p className="text-xs text-zinc-500 mt-1">à¤¶à¥‡à¤¡à¥à¤¯à¥‚à¤²à¤¿à¤‚à¤— à¤Ÿà¥ˆà¤¬ à¤ªà¤° à¤œà¤¾à¤•à¤° à¤¨à¤ˆ à¤ªà¥‹à¤¸à¥à¤Ÿ à¤¬à¤¨à¤¾à¤à¤à¥¤</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatCard({ title, value, trend, icon }: { title: string, value: string, trend: string, icon?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:border-indigo-500/30 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{title}</h3>
        {icon && <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">{value}</span>
      </div>
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-medium bg-emerald-50 dark:bg-emerald-500/10 inline-block px-2 py-1 rounded-md">{trend}</p>
    </div>
  );
}

