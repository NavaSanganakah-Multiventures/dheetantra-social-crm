"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Send, Sparkles, Inbox, MessageCircle, Mail, Instagram, Facebook, X, RefreshCw, Bot, AlertTriangle, ChevronDown, Check, Loader2, Phone } from 'lucide-react';

// ---------------------------------------------------------------
// Time helpers (mirrors dashboard helpers without circular import)
// ---------------------------------------------------------------
const ensureUTC = (dateStr: string | Date | number) => {
  if (typeof dateStr === 'string') {
    if (dateStr.endsWith('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
    if (dateStr.includes('T')) {
      const d = new Date(dateStr + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

const fmtTime = (dateStr: string | Date | number) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const fmtDay = (dateStr: string | Date | number) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

// ---------------------------------------------------------------
// Platform config
// ---------------------------------------------------------------
type Platform = 'all' | 'whatsapp' | 'instagram' | 'facebook' | 'email';

const PLATFORMS: { key: Platform; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'all', label: 'सभी', icon: <Inbox className="w-3.5 h-3.5" />, color: 'text-surface-400' },
  { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-3.5 h-3.5" />, color: 'text-emerald-500' },
  { key: 'instagram', label: 'Instagram', icon: <Instagram className="w-3.5 h-3.5" />, color: 'text-pink-500' },
  { key: 'facebook', label: 'Facebook', icon: <Facebook className="w-3.5 h-3.5" />, color: 'text-blue-500' },
  { key: 'email', label: 'ईमेल', icon: <Mail className="w-3.5 h-3.5" />, color: 'text-primary-500' },
];

// AI filter categories (match src/services/inboxAI.ts)
const AI_FILTERS = [
  { key: 'all', label: 'AI फ़िल्टर: सभी' },
  { key: 'lead', label: '🎯 लीड्स' },
  { key: 'urgent', label: '🚨 अर्जेंट' },
  { key: 'complaint', label: '😠 शिकायतें' },
  { key: 'inquiry', label: '❓ पूछताछ' },
  { key: 'support', label: '🛟 सपोर्ट' },
  { key: 'follow_up', label: '⏰ फॉलो-अप' },
  { key: 'spam', label: '🗑 स्पैम' },
];

const AI_LABEL_STYLE: Record<string, string> = {
  lead: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  urgent: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  complaint: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  inquiry: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  support: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  spam: 'bg-surface-500/10 text-surface-400 border-surface-500/20',
};

const AI_LABEL_TEXT: Record<string, string> = {
  lead: 'लीड', urgent: 'अर्जेंट', complaint: 'शिकायत', inquiry: 'पूछताछ',
  support: 'सपोर्ट', follow_up: 'फॉलो-अप', spam: 'स्पैम', other: 'अन्य',
};

function parseEmailMedia(value: string | null): { subject?: string; to?: string } {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* ignore */ }
  return {};
}

// Module-level helper so the impure builtin is outside the render scope
const currentTimeMs = () => Date.now();

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export default function UnifiedInbox({
  preselectedChat,
  setPreselectedChat,
  onGoIntegrations,
}: {
  preselectedChat?: any;
  setPreselectedChat?: (chat: any) => void;
  onGoIntegrations?: () => void;
}) {
  const wId = typeof window !== 'undefined' ? localStorage.getItem('workspaceId') || '' : '';

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<Platform>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'closed'>('open');
  const [aiFilter, setAiFilter] = useState('all');

  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeConvRef = useRef<any>(null);
  activeConvRef.current = activeConv;

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------- Fetch conversations ----------
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/inbox/conversations?limit=300', { headers: { 'x-workspace-id': wId } });
      const data: any = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (e) {
      console.error('UnifiedInbox: load conversations failed', e);
    } finally {
      setLoading(false);
    }
  }, [wId]);

  useEffect(() => {
    if (!wId) return;
    (async () => {
      await loadConversations();
    })();
    const t = setInterval(loadConversations, 10000);
    return () => clearInterval(t);
  }, [wId, loadConversations]);

  // ---------- Real-time WebSocket ----------
  // New messages land in the OPEN conversation instantly (not just the list),
  // and status/deletion events refresh the list without waiting for polling.
  const connectWs = useCallback(() => {
    if (!wId) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/chat/connect/global-${wId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsPingRef.current) clearInterval(wsPingRef.current);
      wsPingRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ event: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const type = data.type || data.event;
        if (type === 'new_message' && data.message) {
          // Append live into the open conversation thread.
          setMessages((prev) => {
            if (data.message.conversation_id !== activeConvRef.current?.id) return prev;
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
          loadConversations(); // keep list previews + ordering fresh
        } else if (type === 'message_status_updated' || type === 'conversation_status_updated' || type === 'conversation_deleted') {
          loadConversations();
        }
      } catch (e) {
        console.error('UnifiedInbox: WS message error', e);
      }
    };

    ws.onclose = () => {
      if (wsPingRef.current) { clearInterval(wsPingRef.current); wsPingRef.current = null; }
      wsRef.current = null;
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      wsReconnectRef.current = setTimeout(connectWs, 3000);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }, [wId, loadConversations]);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      if (wsPingRef.current) clearInterval(wsPingRef.current);
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [connectWs]);

  // ---------- Open a conversation ----------
  const openConversation = useCallback(async (conv: any) => {
    setActiveConv(conv);
    setConvLoading(true);
    setComposer('');
    try {
      const res = await fetch(`/api/inbox/messages/${conv.id}?limit=500`, { headers: { 'x-workspace-id': wId } });
      const data: any = await res.json();
      if (data.messages) {
        // Merge instead of blind-replace: a realtime message that arrived
        // while the fetch was in flight must not be wiped out.
        setMessages((prev) => {
          const incoming = data.messages as any[];
          const merged = [...incoming];
          for (const m of prev) {
            if (m.conversation_id === conv.id && !incoming.some((x) => x.id === m.id)) {
              merged.push(m);
            }
          }
          return merged;
        });
        if (data.conversation && !data.conversation.contact_name) {
          setActiveConv((prev: any) => ({ ...prev, ...data.conversation }));
        }
      } else if (data.error) {
        showToast('error', data.error);
      }
    } catch (e) {
      console.error('UnifiedInbox: load messages failed', e);
    } finally {
      setConvLoading(false);
    }
  }, [wId]);

  // ---------- Preselected chat (from other tabs) ----------
  useEffect(() => {
    if (!preselectedChat) return;
    if (preselectedChat.id && activeConv?.id !== preselectedChat.id) {
      const conv = conversations.find((c: any) => c.id === preselectedChat.id);
      if (conv) {
        const t = setTimeout(() => openConversation(conv), 0);
        return () => clearTimeout(t);
      } else if (preselectedChat.platform || preselectedChat.phone) {
        const byPhone = conversations.find((c: any) => c.phone === preselectedChat.phone);
        if (byPhone) {
          const t = setTimeout(() => openConversation(byPhone), 0);
          return () => clearTimeout(t);
        }
      }
    }
    if (setPreselectedChat) setPreselectedChat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedChat]);

  // ---------- Scroll to bottom on new messages ----------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeConv?.id]);

  // ---------- Client-side filtering ----------
  const filtered = conversations
    .filter(c => (platform === 'all' ? true : c.platform === platform))
    .filter(c => (statusFilter === 'all' ? true : (c.status || 'open') === statusFilter))
    .filter(c => (aiFilter === 'all' ? true : c.ai_label === aiFilter))
    .filter(c => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (c.contact_name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
    });

  const counts = useCallback((p: Platform) => {
    if (p === 'all') return conversations.length;
    return conversations.filter(c => c.platform === p).length;
  }, [conversations]);

  // ---------- AI actions ----------
  const runAIClassify = async () => {
    if (aiClassifying) return;
    setAiClassifying(true);
    try {
      const res = await fetch('/api/inbox/ai/classify', {
        method: 'POST', headers: { 'x-workspace-id': wId, 'Content-Type': 'application/json' },
      });
      const data: any = await res.json();
      if (data.success) {
        showToast('success', `AI ने ${data.classified} बातचीत को लेबल किया ✨`);
        loadConversations();
      } else {
        showToast('error', data.error || 'AI classify विफल');
      }
    } catch (e) {
      showToast('error', 'AI classify विफल');
    } finally {
      setAiClassifying(false);
    }
  };

  const runAISuggest = async () => {
    if (!activeConv || aiSuggesting) return;
    setAiSuggesting(true);
    try {
      const res = await fetch('/api/inbox/ai/suggest', {
        method: 'POST',
        headers: { 'x-workspace-id': wId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id }),
      });
      const data: any = await res.json();
      if (data.success && data.suggestion) {
        setComposer(data.suggestion);
      } else {
        showToast('error', data.error || 'AI सुझाव विफल');
      }
    } catch (e) {
      showToast('error', 'AI सुझाव विफल');
    } finally {
      setAiSuggesting(false);
    }
  };

  // ---------- Send reply ----------
  const sendReply = async () => {
    if (!activeConv || sending || !composer.trim()) return;

    // WhatsApp: 24h window check
    if (activeConv.platform === 'whatsapp' && activeConv.customer_last_message_at) {
      const last = ensureUTC(activeConv.customer_last_message_at).getTime();
      if (Date.now() - last > 24 * 60 * 60 * 1000) {
        showToast('error', '24 घंटे पूरे हो चुके — WhatsApp टेम्पलेट भेजना ज़रूरी है (यह संस्करण अभी टेम्पलेट भेजने का समर्थन नहीं करता)');
        return;
      }
    }

    setSending(true);
    try {
      let res: Response;
      if (activeConv.platform === 'email') {
        res = await fetch(`/api/email/inbox/conversations/${activeConv.id}/reply`, {
          method: 'POST',
          headers: { 'x-workspace-id': wId, 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: composer.trim() }),
        });
      } else if (activeConv.platform === 'whatsapp') {
        res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'x-workspace-id': wId, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: activeConv.phone,
            text: composer.trim(),
            conversationId: activeConv.id,
            phoneNumberId: activeConv.phone_number_id || undefined,
          }),
        });
      } else {
        showToast('error', 'इस प्लेटफ़ॉर्म से भेजना अभी समर्थित नहीं है');
        setSending(false);
        return;
      }

      const data: any = await res.json();
      if (data.success || res.ok) {
        setComposer('');
        showToast('success', 'संदेश भेज दिया गया');
        openConversation(activeConv);
        loadConversations();
      } else {
        showToast('error', data.error || 'संदेश भेजने में समस्या');
      }
    } catch (e: any) {
      showToast('error', e.message || 'संदेश भेजने में समस्या');
    } finally {
      setSending(false);
    }
  };

  const isAiCapable = ['whatsapp', 'email'].includes(activeConv?.platform);

  // ---------- Render ----------
  return (
    <div className="h-full flex bg-white dark:bg-surface-950 relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl border ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : 'bg-rose-600 text-white border-rose-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ================= LEFT: Conversation List ================= */}
      <div className="w-full md:w-[380px] lg:w-[400px] shrink-0 border-r border-surface-200 dark:border-surface-800 flex flex-col min-h-0">
        {/* Header / Search */}
        <div className="p-4 border-b border-surface-200 dark:border-surface-800 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="नाम, नंबर या ईमेल से खोजें..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 focus:border-primary-500 outline-none transition-colors"
            />
          </div>

          {/* Platform tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {PLATFORMS.map(p => (
              <button
                key={p.key}
                onClick={() => setPlatform(p.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
                  platform === p.key
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : 'bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-800 hover:border-primary-400'
                }`}
              >
                <span className={platform === p.key ? 'text-white' : p.color}>{p.icon}</span>
                {p.label}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  platform === p.key ? 'bg-white/20' : 'bg-surface-100 dark:bg-surface-800'
                }`}>
                  {counts(p.key)}
                </span>
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-surface-200 dark:border-surface-800 overflow-hidden">
              {(['open', 'all', 'closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                    statusFilter === s
                      ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                      : 'bg-surface-50 dark:bg-surface-900 text-surface-500 hover:text-surface-800 dark:hover:text-surface-200'
                  }`}
                >
                  {s === 'open' ? 'सक्रिय' : s === 'closed' ? 'बंद' : 'सभी'}
                </button>
              ))}
            </div>

            <select
              value={aiFilter}
              onChange={(e) => setAiFilter(e.target.value)}
              className="flex-1 min-w-0 text-[11px] font-medium px-2.5 py-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 outline-none cursor-pointer"
            >
              {AI_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>

            <button
              onClick={runAIClassify}
              disabled={aiClassifying}
              title="Gemini से सभी बातचीत को ऑटो-लेबल करें"
              className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-primary-600 to-violet-600 text-white hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {aiClassifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">AI लेबल</span>
            </button>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-surface-400 px-6 text-center">
              <Inbox className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm font-medium text-surface-500 dark:text-surface-400">कोई बातचीत नहीं मिली</p>
              <p className="text-xs mt-1">फ़िल्टर बदलकर देखें या नया संदेश आने का इंतज़ार करें</p>
              {platform === 'instagram' || platform === 'facebook' ? (
                <button
                  onClick={onGoIntegrations}
                  className="mt-3 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-500 transition-all"
                >
                  🔗 Integrations से जोड़ें
                </button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-800/70">
              {filtered.map(conv => {
                const isActive = activeConv?.id === conv.id;
                const pMeta = PLATFORMS.find(p => p.key === conv.platform) || PLATFORMS[0];
                const subject = parseEmailMedia(conv.last_message).subject || '';
                return (
                  <div
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-500/10 border-l-2 border-primary-600'
                        : 'hover:bg-surface-50 dark:hover:bg-surface-900/50 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                        {(conv.contact_name || conv.phone || '?')[0]?.toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-900 dark:bg-surface-800 border border-surface-700 flex items-center justify-center ${pMeta.color}`}>
                        {pMeta.icon}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-sm text-surface-900 dark:text-white truncate">
                          {conv.contact_name || conv.phone || 'अज्ञात'}
                        </h4>
                        <span className="text-[10px] text-surface-400 whitespace-nowrap shrink-0">
                          {conv.customer_last_message_at ? fmtDay(conv.customer_last_message_at) : fmtDay(conv.updated_at)}
                        </span>
                      </div>
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">
                        {conv.platform === 'email' ? (subject || conv.phone) : (conv.last_message || conv.phone || 'कोई संदेश नहीं')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide ${pMeta.color}`}>
                          {pMeta.label}
                        </span>
                        {(conv.status || 'open') === 'open' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                            सक्रिय
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-500/10 text-surface-500 font-semibold">
                            बंद
                          </span>
                        )}
                        {conv.ai_label && conv.ai_label !== 'other' && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${AI_LABEL_STYLE[conv.ai_label] || AI_LABEL_STYLE.spam}`}>
                            {AI_LABEL_TEXT[conv.ai_label] || conv.ai_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT: Chat / Reply Pane ================= */}
      <div className="flex-1 hidden md:flex flex-col min-w-0 min-h-0">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-surface-400">
            <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-primary-500" />
            </div>
            <p className="text-lg font-semibold text-surface-600 dark:text-surface-300">यूनिफाइड इनबॉक्स</p>
            <p className="text-sm mt-1 max-w-xs text-center">
              WhatsApp, Email और आने वाले Instagram/Facebook संदेश — सब एक ही जगह
            </p>
          </div>
        ) : (
          <>
            {/* Pane header */}
            <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between gap-3 bg-white dark:bg-surface-950 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
                  {(activeConv.contact_name || activeConv.phone || '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-surface-900 dark:text-white truncate">
                    {activeConv.contact_name || 'अज्ञात'}
                  </h3>
                  <p className="text-xs text-surface-500 truncate flex items-center gap-1">
                    {activeConv.phone}
                    {activeConv.platform === 'email' && <span className="text-surface-400">• ईमेल</span>}
                    {activeConv.platform === 'whatsapp' && activeConv.phone_number_id && (
                      <span className="text-surface-400">• {activeConv.phone_number_id.slice(0, 8)}...</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`hidden sm:flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border font-semibold ${
                  PLATFORMS.find(p => p.key === activeConv.platform)?.color || 'text-surface-400'
                } bg-surface-50 dark:bg-surface-900`}>
                  {PLATFORMS.find(p => p.key === activeConv.platform)?.icon}
                  {PLATFORMS.find(p => p.key === activeConv.platform)?.label}
                </span>
                {activeConv.ai_summary && (
                  <div className="hidden lg:block max-w-[220px] text-[10px] text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-primary-500">AI:</span> {activeConv.ai_summary}
                  </div>
                )}
              </div>
            </div>

            {/* IG/FB not-yet-supported state */}
            {(activeConv.platform === 'instagram' || activeConv.platform === 'facebook') && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-900 flex items-center justify-center mb-3">
                  {activeConv.platform === 'instagram' ? <Instagram className="w-7 h-7 text-pink-500" /> : <Facebook className="w-7 h-7 text-blue-500" />}
                </div>
                <h4 className="font-bold text-surface-800 dark:text-surface-200">
                  {activeConv.platform === 'instagram' ? 'Instagram DM' : 'Facebook Messenger'} इंटीग्रेशन जल्द आ रहा है
                </h4>
                <p className="text-sm text-surface-500 mt-1 max-w-sm">
                  Meta की messaging permissions + webhook सेटअप के बाद यहाँ DMs आएंगे। तब तक आप WhatsApp और Email का इस्तेमाल कर सकते हैं।
                </p>
                {onGoIntegrations && (
                  <button onClick={onGoIntegrations} className="mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-500 transition-all">
                    Integrations देखें
                  </button>
                )}
              </div>
            )}

            {/* Messages */}
            {activeConv.platform !== 'instagram' && activeConv.platform !== 'facebook' && (
              <div className="flex-1 overflow-y-auto px-5 py-4 bg-surface-50 dark:bg-surface-950/40 min-h-0">
                {convLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-surface-400">
                    <MessageCircle className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">अभी कोई संदेश नहीं</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m: any) => {
                      const isContact = m.sender_type === 'contact';
                      const emailMeta = m.message_type === 'email' ? parseEmailMedia(m.media_url) : {};
                      return (
                        <div key={m.id} className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                            isContact
                              ? 'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-tl-sm text-surface-800 dark:text-surface-200'
                              : 'bg-primary-600 text-white rounded-tr-sm'
                          }`}>
                            {m.message_type === 'email' && emailMeta.subject && (
                              <p className="text-xs font-bold mb-1 opacity-80">📧 {emailMeta.subject}</p>
                            )}
                            {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                            {m.message_type !== 'text' && m.message_type !== 'email' && m.message_type !== 'agent' && (
                              <p className="text-xs mt-1 opacity-70">📎 {m.message_type}</p>
                            )}
                            <p className={`text-[9px] mt-1 ${isContact ? 'text-surface-400' : 'text-white/70'}`}>
                              {fmtTime(m.created_at)}
                              {m.status === 'read' && !isContact && <span className="ml-1">✓✓</span>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            )}

            {/* Composer */}
            {activeConv.platform !== 'instagram' && activeConv.platform !== 'facebook' && (
              <div className="border-t border-surface-200 dark:border-surface-800 p-4 bg-white dark:bg-surface-950 shrink-0">
                {activeConv.platform === 'whatsapp' && activeConv.customer_last_message_at && (
                  (() => {
                    const last = ensureUTC(activeConv.customer_last_message_at).getTime();
                    const expired = currentTimeMs() - last > 24 * 60 * 60 * 1000;
                    if (!expired) return null;
                    return (
                      <div className="mb-2 flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        24 घंटे की विंडो पूरी — WhatsApp टेम्पलेट भेजना ज़रूरी है। यह संस्करण टेम्पलेट भेजने का समर्थन नहीं करता।
                      </div>
                    );
                  })()
                )}

                <div className="flex items-end gap-2">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder={activeConv.platform === 'email' ? 'ईमेल का जवाब लिखें...' : 'संदेश लिखें...'}
                    rows={2}
                    className="flex-1 resize-none px-4 py-2.5 text-sm rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 focus:border-primary-500 outline-none transition-colors min-h-[46px]"
                  />
                  {isAiCapable && (
                    <button
                      onClick={runAISuggest}
                      disabled={aiSuggesting}
                      title="Gemini से AI जवाब सुझाएं"
                      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {aiSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      AI सुझाव
                    </button>
                  )}
                  <button
                    onClick={sendReply}
                    disabled={sending || !composer.trim()}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-40 transition-all"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    भेजें
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile: chat pane as overlay */}
      {activeConv && (
        <div className="md:hidden fixed inset-0 z-40 bg-white dark:bg-surface-950 flex flex-col">
          <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(activeConv.contact_name || '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-surface-900 dark:text-white truncate">{activeConv.contact_name || 'अज्ञात'}</h4>
                <p className="text-[10px] text-surface-500 truncate">{activeConv.phone}</p>
              </div>
            </div>
            <button onClick={() => setActiveConv(null)} className="p-2 text-surface-500">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 bg-surface-50 dark:bg-surface-950/40 space-y-3">
            {messages.map((m: any) => {
              const isContact = m.sender_type === 'contact';
              return (
                <div key={m.id} className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    isContact ? 'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800' : 'bg-primary-600 text-white'
                  }`}>
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    <p className={`text-[9px] mt-1 ${isContact ? 'text-surface-400' : 'text-white/70'}`}>{fmtTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-surface-200 dark:border-surface-800 p-3 flex items-end gap-2">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              rows={1}
              placeholder="संदेश लिखें..."
              className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 outline-none"
            />
            <button
              onClick={sendReply}
              disabled={sending || !composer.trim()}
              className="shrink-0 p-3 rounded-2xl bg-primary-600 text-white disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
