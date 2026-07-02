'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, XCircle, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function StatusContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [statusData, setStatusData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputId, setInputId] = useState(id || '');

  useEffect(() => {
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      setError(null);
      fetch(`/api/meta/data-deletion-status/${id}`)
        .then(res => {
          if (!res.ok) {
            throw new Error('Status not found');
          }
          return res.json();
        })
        .then(data => {
          setStatusData(data);
          setLoading(false);
        })
        .catch(err => {
          setError('Status not found or invalid confirmation code.');
          setLoading(false);
        });
    }
  }, [id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputId) {
      window.location.href = `/data-deletion-status?id=${inputId}`;
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-8">
      <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-8 text-sm font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      
      <h1 className="text-2xl font-bold font-display text-zinc-900 dark:text-white mb-2">Data Deletion Status</h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
        Enter your confirmation code below to check the status of your data deletion request.
      </p>

      <form className="mb-8" onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text" 
            name="id" 
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            placeholder="Confirmation Code" 
            className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
            required
          />
        </div>
        <button type="submit" className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors">
          Check Status
        </button>
      </form>

      {loading && (
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 text-center text-sm text-zinc-500">
          Loading status...
        </div>
      )}

      {id && !loading && (
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Request Status</h2>
          
          {error ? (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          ) : statusData ? (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 p-4 rounded-xl ${statusData.status === 'completed' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                {statusData.status === 'completed' ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 shrink-0 mt-0.5" />}
                <div>
                  <div className="font-medium capitalize">{statusData.status.replace('_', ' ')}</div>
                  <div className="text-sm mt-1 opacity-80">
                    {statusData.status === 'completed' 
                      ? `Your data was successfully deleted on ${new Date(statusData.completed_at).toLocaleString()}.` 
                      : 'Your data deletion request is currently being processed.'}
                  </div>
                </div>
              </div>
              
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">User ID:</span>
                  <span className="font-mono">{statusData.user_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Requested At:</span>
                  <span>{new Date(statusData.requested_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function DataDeletionStatusPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30 flex flex-col items-center justify-center p-6">
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
        <StatusContent />
      </Suspense>
    </div>
  );
}
