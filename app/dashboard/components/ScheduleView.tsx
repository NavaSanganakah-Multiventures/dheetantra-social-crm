import { Upload, CalendarClock, Instagram, Facebook } from 'lucide-react';

export function ScheduleView() {
  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full text-center mt-20">
       <div className="inline-flex w-16 h-16 rounded-full bg-surface-100 dark:bg-surface-800 items-center justify-center text-surface-500 mb-6 border border-surface-200 dark:border-surface-700">
           <CalendarClock className="w-8 h-8" />
       </div>
       <h2 className="text-2xl font-semibold mb-2 tracking-tight">सोशल मीडिया शेड्यूलर</h2>
       <p className="text-surface-500 dark:text-surface-400 mb-8 max-w-md mx-auto">
            Cloudflare Workflows और R2 स्टोरेज का उपयोग करके Instagram और Facebook पर पोस्ट शेड्यूल करें।
       </p>
       
       <div className="bg-white dark:bg-surface-900 p-8 rounded-2xl border border-surface-200 dark:border-surface-800 text-left shadow-sm mb-8">
           <div className="space-y-4 max-w-lg mx-auto">
               <div>
                   <label className="block text-sm font-medium mb-2">प्लेटफ़ॉर्म चुनें</label>
                   <div className="flex gap-3">
                       <button className="flex-1 bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 border border-surface-900 dark:border-surface-100 py-2 rounded-lg text-sm font-medium">Instagram</button>
                       <button className="flex-1 bg-white text-surface-700 dark:bg-surface-900 dark:text-surface-300 border border-surface-200 dark:border-surface-700 py-2 rounded-lg text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">Facebook</button>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">मीडिया अटैचमेंट (R2 अपलोड)</label>
                   <div className="border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-xl p-8 text-center bg-surface-50 dark:bg-surface-950/50 hover:bg-surface-100 dark:hover:bg-surface-900 transition-colors cursor-pointer">
                       <p className="text-sm text-surface-500">इमेज/वीडियो यहां ड्रैग & ड्रॉप करें, या Cloudflare R2 पर सुरक्षित रूप से अपलोड करने के लिए क्लिक करें</p>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">कैप्शन</label>
                   <textarea 
                        rows={3}
                        placeholder="आकर्षक कैप्शन लिखें..." 
                        className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-surface-900 dark:focus:ring-white transition-all text-sm resize-none"
                   />
               </div>
               <div className="pt-4 flex gap-3">
                   <button className="flex-1 bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 font-medium rounded-lg px-4 py-2.5 hover:scale-[0.99] transition-transform">
                       वर्कफ़्लो टास्क शेड्यूल करें
                   </button>
               </div>
           </div>
       </div>
    </div>
  );
}

