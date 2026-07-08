'use client'
import React from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html lang="hi">
      <body className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-500/10 items-center justify-center text-rose-500 mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 font-display">कुछ गलत हो गया</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">अप्रत्याशित त्रुटि हुई। कृपया पुनः प्रयास करें।</p>
          <button
            onClick={() => reset()}
            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium rounded-xl px-6 py-3 hover:scale-[0.99] hover:shadow-lg transition-all"
          >
            पुनः प्रयास करें
          </button>
        </div>
      </body>
    </html>
  )
}
