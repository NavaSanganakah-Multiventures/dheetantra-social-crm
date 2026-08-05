import { Blocks, Users } from 'lucide-react';

export function IntegrationsView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">à¤‡à¤‚à¤Ÿà¥€à¤—à¥à¤°à¥‡à¤¶à¤¨à¥à¤¸ (Integrations)</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            à¤…à¤ªà¤¨à¥‡ à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤•à¥‹ à¤…à¤¨à¥à¤¯ à¤¸à¥‡à¤µà¤¾à¤“à¤‚ à¤¸à¥‡ à¤•à¤¨à¥‡à¤•à¥à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤ (Connect your account with other services)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Google Contacts</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                à¤…à¤ªà¤¨à¥‡ Google Contacts à¤•à¥‹ à¤¸à¤¿à¤‚à¤• à¤•à¤°à¥‡à¤‚à¥¤ (Sync your Google Contacts)
              </p>
            </div>
          </div>
          <div className="mt-auto pt-4 flex gap-3">
             <button disabled className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 py-2 rounded-xl text-sm font-medium cursor-not-allowed">
               Coming Soon
             </button>
          </div>
        </div>
        
        {/* Placeholder for future integrations */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 border-dashed flex flex-col gap-4 opacity-50">
           <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-xl flex items-center justify-center shrink-0">
              <Blocks className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Future Integration</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                More integrations coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

