import { Upload, CalendarClock, Instagram, Facebook } from 'lucide-react';

export function ScheduleView() {
  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full text-center mt-20">
       <div className="inline-flex w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 items-center justify-center text-surface-500 mb-6 border border-surface-200 dark:border-surface-700">
           <CalendarClock className="w-8 h-8" />
       </div>
       <h2 className="text-2xl font-semibold mb-2 tracking-tight">Social Media Scheduler</h2>
       <p className="text-surface-500 dark:text-surface-400 mb-8 max-w-md mx-auto">
            Schedule posts to Instagram and Facebook using Cloudflare Workflows and R2 storage.
       </p>
       
       <div className="bg-white dark:bg-surface-900 p-8 rounded-2xl border border-surface-200 dark:border-surface-800 text-left shadow-sm mb-8">
           <div className="space-y-4 max-w-lg mx-auto">
               <div>
                   <label className="block text-sm font-medium mb-2">Choose platform</label>
                   <div className="flex gap-3">
                       <button className="flex-1 bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 border border-surface-900 dark:border-surface-100 py-2 rounded-lg text-sm font-medium">Instagram</button>
                       <button className="flex-1 bg-white text-surface-700 dark:bg-surface-900 dark:text-surface-300 border border-surface-200 dark:border-surface-700 py-2 rounded-lg text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">Facebook</button>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Media attachment (R2 upload)</label>
                   <div className="border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-xl p-8 text-center bg-surface-50 dark:bg-surface-950/50 hover:bg-surface-100 dark:hover:bg-surface-900 transition-colors cursor-pointer">
                       <p className="text-sm text-surface-500">Drag & drop images/videos here, or click to upload securely to Cloudflare R2</p>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Caption</label>
                   <textarea 
                        rows={3}
                        placeholder="Write an engaging caption..." 
                        className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-surface-900 dark:focus:ring-white transition-all text-sm resize-none"
                   />
               </div>
               <div className="pt-4 flex gap-3">
                   <button className="flex-1 bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 font-medium rounded-lg px-4 py-2.5 hover:scale-[0.99] transition-transform">
                       Schedule workflow task
                   </button>
               </div>
           </div>
       </div>
    </div>
  );
}

