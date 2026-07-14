'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="hi">
      <body className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2 font-['Inter']">
            Something went wrong
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mb-8">
            {error.message || 'An unexpected error occurred.'}
          </p>
          <Button onClick={reset} variant="primary" size="lg">
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
