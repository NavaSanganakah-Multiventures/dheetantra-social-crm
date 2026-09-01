import { Blocks, Users } from 'lucide-react';

export function IntegrationsView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-white">Integrations</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Connect your account to other services.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 dark:text-white">Google Contacts</h3>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                Sync your Google Contacts.
              </p>
            </div>
          </div>
          <div className="mt-auto pt-4 flex gap-3">
             <button disabled className="w-full bg-surface-100 dark:bg-surface-800 text-surface-400 dark:text-surface-500 py-2 rounded-xl text-sm font-medium cursor-not-allowed">
               Coming soon
             </button>
          </div>
        </div>
        
        {/* Placeholder for future integrations */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl p-6 border border-surface-200 dark:border-surface-800 border-dashed flex flex-col gap-4 opacity-50">
           <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-surface-100 dark:bg-surface-800 text-surface-400 rounded-xl flex items-center justify-center shrink-0">
              <Blocks className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 dark:text-white">Upcoming integrations</h3>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                More integrations coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

