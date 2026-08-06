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
    return <div className="p-8 text-sm text-zinc-500">डैशबोर्ड लोड हो रहा है...</div>;
  }

  return (
    <div className="p-6 md:p-10 w-full max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">आपका स्वागत है!</h2>
        <p className="text-zinc-500 dark:text-zinc-400">यहाँ आपके वर्कस्पेस का अवलोकन है।</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="कुल संपर्क" value={stats?.totalContacts?.toString() || "0"} trend="+12% पिछले सप्ताह से" icon={<Users />} />
        <StatCard title="खुली बातचीत" value={stats?.openConversations?.toString() || "0"} trend="सक्रिय कनेक्शन" icon={<Activity />} />
        <StatCard title="ब्रॉडकास्ट भेजे गए" value={stats?.broadcastsSent?.toString() || "0"} trend="+5% पिछले महीने से" icon={<Zap />} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">हाल की बातचीत</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">सभी देखें</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">कोई सक्रिय बातचीत नहीं मिली।</p>
              <p className="text-xs text-zinc-500 mt-1">अपना API सिंक करें या संदेश प्राप्त करें।</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">आगामी पोस्ट्स</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">शेड्यूल करें</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <CalendarClock className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">कोई पोस्ट शेड्यूल नहीं है।</p>
              <p className="text-xs text-zinc-500 mt-1">शेड्यूलिंग टैब पर जाकर नई पोस्ट बनाएँ।</p>
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

