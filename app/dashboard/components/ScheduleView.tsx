import { Upload, CalendarClock, Instagram, Facebook } from 'lucide-react';

export function ScheduleView() {
  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full text-center mt-20">
       <div className="inline-flex w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center text-zinc-500 mb-6 border border-zinc-200 dark:border-zinc-700">
           <CalendarClock className="w-8 h-8" />
       </div>
       <h2 className="text-2xl font-semibold mb-2 tracking-tight">Social Media Scheduler</h2>
       <p className="text-zinc-500 dark:text-zinc-400 mb-8 max-w-md mx-auto">
           Schedule posts to Instagram and Facebook using Cloudflare Workflows and R2 storage.
       </p>
       
       <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-left shadow-sm mb-8">
           <div className="space-y-4 max-w-lg mx-auto">
               <div>
                   <label className="block text-sm font-medium mb-2">Select Platforms</label>
                   <div className="flex gap-3">
                       <button className="flex-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-900 dark:border-zinc-100 py-2 rounded-lg text-sm font-medium">Instagram</button>
                       <button className="flex-1 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 py-2 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Facebook</button>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Media Attachment (R2 Upload)</label>
                   <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                       <p className="text-sm text-zinc-500">Drag & drop image/video here, or click to securely upload to Cloudflare R2</p>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Caption</label>
                   <textarea 
                        rows={3}
                        placeholder="Write a captivating caption..." 
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm resize-none"
                   />
               </div>
               <div className="pt-4 flex gap-3">
                   <button className="flex-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-lg px-4 py-2.5 hover:scale-[0.99] transition-transform">
                       Schedule Workflow Task
                   </button>
               </div>
           </div>
       </div>
    </div>
  );
}

