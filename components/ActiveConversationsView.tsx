"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Search, MessageCircle, Phone, ChevronRight, Filter } from 'lucide-react';

type activeTab = 'dashboard' | 'inbox' | 'active-conversations' | 'broadcast' | 'templates' | 'schedule' | 'settings' | 'contacts' | 'calls' | 'integrations' | 'accounts-whatsapp';

export default function ActiveConversationsView({
  setActiveTab,
  setPreselectedChat
}: {
  setActiveTab: (tab: activeTab) => void;
  setPreselectedChat: (chat: any) => void;
}) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<'open' | 'closed' | 'all'>('open');
  const [phoneFilter, setPhoneFilter] = useState("all");
  const [configs, setConfigs] = useState<any[]>([]);

  const fetchConversations = useCallback(async () => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;
    try {
      const res = await fetch('/api/inbox/conversations?limit=200', {
        headers: { 'x-workspace-id': wId }
      });
      const data: any = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load configs for WABA filter
  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;
    fetch('/api/whatsapp/config', {
      headers: { 'x-workspace-id': wId }
    }).then(r => r.json()).then((data: any) => {
      if (data.configs) setConfigs(data.configs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      await fetchConversations();
    })();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Filter conversations
  const filtered = conversations.filter(c => {
    if (filterStatus !== 'all' && (c.status || 'open') !== filterStatus) return false;
    if (phoneFilter !== 'all' && c.phone_number_id !== phoneFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (c.contact_name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });

  const handleChat = (conv: any) => {
    setPreselectedChat(conv);
    setActiveTab('inbox');
  };

  const openCount = conversations.filter(c => (c.status || 'open') === 'open').length;
  const closedCount = conversations.filter(c => c.status === 'closed').length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-surface-950">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white font-display">Active Conversations</h2>
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Active: {openCount}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-surface-400" /> Closed: {closedCount}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center mt-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or number..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 focus:border-primary-500 outline-none transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="flex rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            {(['open', 'all', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 text-xs font-semibold transition-all ${
                  filterStatus === s
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-50 dark:bg-surface-900 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                }`}
              >
                {s === 'open' ? 'Active' : s === 'closed' ? 'Closed' : 'All'}
              </button>
            ))}
          </div>

          {/* Phone Number Filter */}
          <select
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            className="text-xs p-2 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 outline-none"
          >
            <option value="all">All lines</option>
            {configs.map(cfg => (
              <option key={cfg.id} value={cfg.phone_number_id}>
                {cfg.phone_number_id || cfg.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-surface-400">
            <MessageCircle className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">No conversations found</p>
            <p className="text-xs mt-1">Try changing the filter</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            {filtered.map(conv => (
              <div
                key={conv.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-50 dark:hover:bg-surface-900/50 transition-colors cursor-pointer group"
                onClick={() => handleChat(conv)}
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-emerald-500 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm">
                  {(conv.contact_name || conv.phone || '?')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="font-semibold text-sm text-surface-900 dark:text-white truncate">
                      {conv.contact_name || 'Unknown'}
                    </h4>
                    <span className="text-[10px] text-surface-400 whitespace-nowrap ml-2">
                      {conv.customer_last_message_at
                        ? new Date(conv.customer_last_message_at).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })
                        : new Date(conv.updated_at).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-surface-500">
                    <span>{conv.phone || '—'}</span>
                    {conv.phone_number_id && (
                      <>
                        <span className="text-surface-300">•</span>
                        <span className="text-[10px] font-mono">{conv.phone_number_id.slice(0, 8)}...</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      (conv.status || 'open') === 'open'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'
                    }`}>
                      {conv.status === 'closed' ? 'Closed' : 'Active'}
                    </span>
                    {conv.customer_last_message_at && (
                      <span className="text-[10px] text-surface-400">
                        Last activity: {new Date(conv.customer_last_message_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action */}
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleChat(conv); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
