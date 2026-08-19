"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Plus, Trash2, RefreshCw, Copy, Check, Globe, Send, FileText, X,
  ShieldCheck, Clock, AlertCircle, Loader2, KeyRound, ChevronDown, ChevronUp, Inbox,
  CornerUpLeft, ArrowLeft, Paperclip, ExternalLink, User
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const getWorkspaceId = () => (typeof window !== 'undefined' ? localStorage.getItem('workspaceId') : null);
const getHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const wId = getWorkspaceId();
  if (wId) headers['x-workspace-id'] = wId;
  return headers;
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    suspended: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };
  const label: Record<string, string> = {
    active: 'सक्रिय (वेरिफाइड)',
    pending: 'वेरिफिकेशन बाकी',
    failed: 'विफल',
    suspended: 'सस्पेंड (ऑटो)',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || map.pending}`}>
      {status === 'active' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
      {label[status] || status}
    </span>
  );
}

function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_review: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    approved: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };
  const label: Record<string, string> = {
    pending_review: 'रिव्यू बाकी',
    approved: 'स्वीकृत',
    rejected: 'अस्वीकृत',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${map[status] || map.pending_review}`}>
      {label[status] || status}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 px-2 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'कॉपी हो गया!' : (label || 'कॉपी करें')}
    </button>
  );
}

function DnsRecordRow({ record }: { record: any }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 text-xs py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
      <span className="w-10 font-mono font-bold text-surface-500 dark:text-surface-400">{record.type || 'TXT'}</span>
      <span className="flex-1 font-mono text-surface-800 dark:text-surface-200 break-all min-w-0">{record.name || '@'}</span>
      <span className="flex-1 font-mono text-surface-600 dark:text-surface-400 break-all min-w-0">{record.content}</span>
      {record.priority !== undefined && <span className="w-8 text-surface-400">P:{record.priority}</span>}
      <CopyButton text={`${record.name || ''} ${record.content}`} />
    </div>
  );
}

export default function EmailServiceView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'inbox' | 'domains' | 'compose' | 'templates' | 'logs'>('inbox');
  const [domains, setDomains] = useState<any[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ entitlement: string | null; domains_allowed: number; domains_used: number; can_add_domain: boolean; email_enabled: boolean } | null>(null);

  const loadEmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/email-status', { headers: getHeaders() });
      const data: any = await res.json();
      if (res.ok) setEmailStatus(data);
    } catch (e) {
      console.error('Failed to load email status', e);
    }
  }, []);

  const refreshDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains', { headers: getHeaders() });
      const data: any = await res.json();
      if (data.domains) setDomains(data.domains);
    } catch (e) {
      console.error('Failed to load domains', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/domains', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (!cancelled && data.domains) setDomains(data.domains); })
      .catch((e) => console.error('Failed to load domains', e))
      .finally(() => { if (!cancelled) setLoadingDomains(false); });
    fetch('/api/billing/email-status', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (!cancelled && data) setEmailStatus(data); })
      .catch((e) => console.error('Failed to load email status', e));
    return () => { cancelled = true; };
  }, []);

  const verifyDomain = async (id: string) => {
    try {
      const res = await fetch(`/api/domains/${id}/verify`, { method: 'POST', headers: getHeaders() });
      const data: any = await res.json();
      if (data.success) {
        // The endpoint now runs the check synchronously and returns the FRESH
        // status, so apply it immediately (no more stale "pending" display).
        if (data.domain) {
          setDomains(prev => prev.map(d => d.id === id ? { ...d, ...data.domain } : d));
        }
        toast('success', data.message || 'जांच पूरी — status अपडेट हो गया');
        refreshDomains();
      } else {
        toast('error', data.error || 'वेरिफिकेशन विफल');
        refreshDomains();
      }
    } catch (e: any) {
      toast('error', e.message || 'वेरिफिकेशन विफल');
      refreshDomains();
    }
  };

  const removeDomain = async (id: string, name: string) => {
    if (!window.confirm(`क्या आप डोमेन "${name}" हटाना चाहते हैं? Zone और Email Routing Cloudflare से भी हट जाएगा।`)) return;
    try {
      const res = await fetch(`/api/domains/${id}`, { method: 'DELETE', headers: getHeaders() });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'डोमेन हटा दिया गया');
        refreshDomains();
      } else {
        const detail = (data.errors && data.errors.length) ? ` — ${data.errors.join('; ')}` : '';
        toast('error', `${data.error || 'डोमेन हटाने में विफल'}${detail}`);
        refreshDomains();
      }
    } catch (e: any) {
      toast('error', e.message || 'डोमेन हटाने में विफल');
    }
  };

  const testSend = async (domain: any, to: string) => {
    if (!to) {
      toast('warning', 'टेस्ट ईमेल भेजने के लिए recipient email डालें');
      return;
    }
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ domainId: domain.id, to }),
      });
      const data: any = await res.json();
      if (data.success) {
        toast('success', `टेस्ट ईमेल भेजा गया → ${to}`);
      } else {
        toast('error', data.error || 'टेस्ट ईमेल विफल');
      }
    } catch (e: any) {
      toast('error', e.message || 'टेस्ट ईमेल विफल');
    }
  };

  const activeDomains = domains.filter(d => d.status === 'active' && d.review_status === 'approved');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-white">ईमेल सेवा</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            अपना डोमेन जोड़ें और Cloudflare Email Service से ईमेल भेजें व पाएं।
          </p>
        </div>
        <div className="flex items-center gap-3">
          {emailStatus && (
            <div className="text-xs text-surface-600 dark:text-surface-300 bg-surface-100 dark:bg-surface-800 px-3 py-1.5 rounded-lg">
              {emailStatus.can_add_domain ? (
                <span>डोमेन: <strong>{emailStatus.domains_used} / {emailStatus.domains_allowed}</strong> {emailStatus.entitlement === 'plan' ? '(Plan)' : '(Add-on)'}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">डोमेन लिमिट पूरी ({emailStatus.domains_used}/{emailStatus.domains_allowed})</span>
              )}
            </div>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!!emailStatus && !emailStatus.can_add_domain}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> डोमेन जोड़ें
          </button>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 border-b border-surface-200 dark:border-surface-800">
        {([
          ['inbox', 'इनबॉक्स', Inbox],
          ['domains', 'डोमेन', Globe],
          ['compose', 'ईमेल भेजें', Send],
          ['templates', 'टेम्पलेट्स', FileText],
          ['logs', 'सेंड लॉग्स', Mail],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary-600 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'inbox' && <InboxSection domains={domains} />}
      {tab === 'domains' && (
        <DomainsSection
          domains={domains}
          loading={loadingDomains}
          onVerify={verifyDomain}
          onRemove={removeDomain}
          onTestSend={testSend}
        />
      )}
      {tab === 'compose' && <ComposeSection domains={activeDomains} />}
      {tab === 'templates' && <TemplatesSection />}
      {tab === 'logs' && <LogsSection />}

      {showAddModal && <AddDomainModal emailStatus={emailStatus} onClose={() => setShowAddModal(false)} onAdded={() => { refreshDomains(); loadEmailStatus(); }} />}
    </div>
  );
}

// ==========================================
// INBOX
// ==========================================

function InboxSection({ domains }: { domains: any[] }) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/email/inbox/conversations?limit=200', { headers: getHeaders() });
      const data: any = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (e) {
      console.error('Failed to load email inbox', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/email/inbox/conversations/${id}`, { headers: getHeaders() });
      const data: any = await res.json();
      if (data.messages && data.conversation) setDetail(data);
    } catch (e) {
      console.error('Failed to load conversation', e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const sendReply = async () => {
    if (!selectedId || !replyBody.trim()) {
      toast('warning', 'Reply खाली है');
      return;
    }
    if (!detail?.replyMailbox) {
      toast('error', 'भेजने वाला mailbox set नहीं है। पहले Domain / Mailbox बनाएं और verify करें।');
      return;
    }
    setReplySending(true);
    try {
      const res = await fetch(`/api/email/inbox/conversations/${selectedId}/reply`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ html: replyBody }),
      });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'Reply भेज दिया गया');
        setReplyBody('');
        loadDetail(selectedId);
        loadConversations();
      } else {
        toast('error', data.error || 'Reply भेजने में समस्या');
      }
    } catch (e: any) {
      toast('error', e.message || 'Reply भेजने में समस्या');
    } finally {
      setReplySending(false);
    }
  };

  useEffect(() => {
    (async () => {
      await loadConversations();
    })();
    const t = setInterval(() => {
      loadConversations();
      if (selectedId) loadDetail(selectedId);
    }, 10000);
    return () => clearInterval(t);
  }, [loadConversations, selectedId, loadDetail]);

  const openConversation = async (id: string) => {
    setSelectedId(id);
    await loadDetail(id);
  };

  const formatDate = (value: string) => {
    if (!value) return '';
    try { return new Date((value).replace(' ', 'T') + 'Z').toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }); } catch { return value; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!domains.length) {
    return (
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-dashed border-surface-300 dark:border-surface-700 p-10 text-center">
        <Inbox className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <h3 className="font-semibold text-surface-900 dark:text-white">पहले अपना डोमेन जोड़ें</h3>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-2 max-w-md mx-auto">
          ईमेल inbox का उपयोग करने के लिए सबसे पहले &quot;डोमेन&quot; टैब पर जाकर अपना domain जोड़ें और verify करें।
          उसके बाद आए हुए emails यहाँ दिखेंगे।
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-13rem)] min-h-[500px] grid grid-cols-1 md:grid-cols-3 gap-0 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
      {/* Conversation list */}
      <div className={`${selectedId ? 'hidden md:flex' : 'flex'} md:flex flex-col border-r border-surface-200 dark:border-surface-800`}>
        <div className="p-4 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between">
          <h3 className="font-semibold text-surface-900 dark:text-white">ईमेल बातचीत</h3>
          <button onClick={loadConversations} className="p-1.5 text-surface-500 hover:text-primary-600 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800" title="रिफ्रेश करें">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => openConversation(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-surface-100 dark:border-surface-800 transition-colors ${
                selectedId === conv.id ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-surface-50 dark:hover:bg-surface-900/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">
                    {conv.contact_name || conv.sender_email}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{conv.sender_email}</p>
                  <p className="text-xs text-surface-700 dark:text-surface-300 mt-1 truncate">
                    {conv.subject ? <span className="font-medium">{conv.subject}</span> : <span className="text-surface-400">(कोई विषय नहीं)</span>}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 truncate">{conv.preview || ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-surface-400 whitespace-nowrap">{formatDate(conv.last_message_at)}</span>
                  {conv.has_attachments && <Paperclip className="w-3.5 h-3.5 text-surface-400" />}
                  {conv.unverified && <span className="text-[9px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 rounded-full">?</span>}
                </div>
              </div>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="p-8 text-center text-surface-500 dark:text-surface-400 text-sm">
              अभी तक कोई ईमेल नहीं आया।<br />
              <span className="text-xs">सक्रिय domain के mailbox पर email भेजकर test करें।</span>
            </div>
          )}
        </div>
      </div>

      {/* Reading pane */}
      <div className={`${selectedId ? 'flex' : 'hidden md:flex'} md:col-span-2 flex-col`}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-surface-400 dark:text-surface-500 p-8">
            <Mail className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">बाईं ओर से कोई conversation चुनें</p>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : detail ? (
          <>
            <div className="p-4 border-b border-surface-200 dark:border-surface-800 flex items-start gap-3">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden p-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-surface-900 dark:text-white truncate">
                  {detail.conversation.contact_name || detail.conversation.sender_email}
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{detail.conversation.sender_email}</p>
                <p className="text-xs text-surface-400 mt-1 truncate">Reply भेजने वाला: {detail.replyMailbox || '—'}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${detail.conversation.status === 'open' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'}`}>
                {detail.conversation.status === 'open' ? 'सक्रिय' : 'बंद'}
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {(detail.messages || []).map((m: any) => {
                const isContact = m.sender_type === 'contact';
                const html = m.media?.html || '';
                const body = html || m.content || '';
                const srcDoc = `<html><head><style>body{font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#111827;max-width:100%;word-wrap:break-word;}</style></head><body>${body}</body></html>`;
                return (
                  <div key={m.id} className={`flex ${isContact ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-full md:max-w-[80%] rounded-2xl p-4 ${isContact ? 'bg-surface-100 dark:bg-surface-900 text-surface-900 dark:text-surface-100' : 'bg-primary-600 text-white'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isContact ? <User className="w-3.5 h-3.5" /> : <CornerUpLeft className="w-3.5 h-3.5" />}
                        <span className="text-xs font-medium">{isContact ? (detail.conversation.contact_name || 'ग्राहक') : 'आप'}</span>
                        <span className="text-[10px] opacity-70">{formatDate(m.created_at)}</span>
                      </div>
                      {m.media?.subject && (
                        <p className={`text-xs font-semibold mb-2 ${isContact ? 'text-surface-800 dark:text-surface-200' : 'text-primary-100'}`}>विषय: {m.media.subject}</p>
                      )}
                      <div className={`text-sm overflow-auto ${isContact ? 'text-surface-800 dark:text-surface-200' : 'text-white'}`}>
                        {html ? (
                          <iframe
                            title={`email-${m.id}`}
                            srcDoc={srcDoc}
                            sandbox=""
                            className="w-full min-h-[120px] bg-transparent"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap">{m.content || '(कोई सामग्री नहीं)'}</p>
                        )}
                      </div>
                      {(m.media?.attachments || []).length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {(m.media.attachments as any[]).map((att, i) => (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                                isContact
                                  ? 'bg-white dark:bg-surface-800 text-primary-600 dark:text-primary-400 hover:bg-primary-50'
                                  : 'bg-primary-700 text-white hover:bg-primary-800'
                              }`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span className="truncate">{att.name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950/50">
              <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-2">Reply भेजें</label>
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                rows={4}
                placeholder="<p>नमस्ते...</p>"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={sendReply}
                  disabled={replySending || !replyBody.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 rounded-xl transition-colors disabled:opacity-60"
                >
                  {replySending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerUpLeft className="w-4 h-4" />}
                  {replySending ? 'भेज रहे हैं...' : 'Reply भेजें'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ==========================================
// DOMAINS
// ==========================================

function DomainsSection({
  domains, loading, onVerify, onRemove, onTestSend,
}: {
  domains: any[];
  loading: boolean;
  onVerify: (id: string) => Promise<void> | void;
  onRemove: (id: string, name: string) => void;
  onTestSend: (domain: any, to: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mailboxes, setMailboxes] = useState<Record<string, any[]>>({});
  const [newMailbox, setNewMailbox] = useState<Record<string, { localPart: string; forwardTo: string }>>({});
  const [testTo, setTestTo] = useState<Record<string, string>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await onVerify(id);
    } finally {
      setVerifyingId(null);
    }
  };

  const loadMailboxes = useCallback(async (domainId: string) => {
    try {
      const res = await fetch(`/api/domain-emails/${domainId}`, { headers: getHeaders() });
      const data: any = await res.json();
      if (data.emails) setMailboxes(prev => ({ ...prev, [domainId]: data.emails }));
    } catch { /* ignore */ }
  }, []);

  const toggle = (id: string) => {
    const next = !expanded[id];
    setExpanded(prev => ({ ...prev, [id]: next }));
    if (next) loadMailboxes(id);
  };

  const addMailbox = async (domain: any) => {
    const form = newMailbox[domain.id] || { localPart: '', forwardTo: '' };
    if (!form.localPart.trim()) {
      toast('warning', 'Mailbox name (local part) डालें');
      return;
    }
    try {
      const res = await fetch('/api/domain-emails', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ domainId: domain.id, localPart: form.localPart, forwardTo: form.forwardTo || null }),
      });
      const data: any = await res.json();
      if (data.success) {
        toast('success', `Mailbox ${data.email.email_address} बन गया`);
        setNewMailbox(prev => ({ ...prev, [domain.id]: { localPart: '', forwardTo: '' } }));
        loadMailboxes(domain.id);
      } else {
        toast('error', data.error || 'Mailbox बनाने में त्रुटि');
      }
    } catch (e: any) {
      toast('error', e.message || 'Mailbox बनाने में त्रुटि');
    }
  };

  const removeMailbox = async (id: string, email: string, domainId: string) => {
    if (!window.confirm(`Mailbox "${email}" हटाएं?`)) return;
    try {
      const res = await fetch(`/api/domain-emails/${id}`, { method: 'DELETE', headers: getHeaders() });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'Mailbox हटा दिया गया');
        loadMailboxes(domainId);
      } else {
        toast('error', data.error || 'Mailbox हटाने में विफल');
      }
    } catch (e: any) {
      toast('error', e.message || 'Mailbox हटाने में विफल');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!domains.length) {
    return (
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-dashed border-surface-300 dark:border-surface-700 p-12 text-center">
        <div className="w-14 h-14 mx-auto bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mb-4">
          <Mail className="w-7 h-7" />
        </div>
        <h3 className="font-semibold text-surface-900 dark:text-white">कोई डोमेन नहीं जुड़ा है</h3>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 max-w-md mx-auto">
          &quot;डोमेन जोड़ें&quot; पर क्लिक करें। डोमेन Cloudflare पर onboard होगा — nameservers या DNS records जोड़ने के बाद
          आप उस डोमेन से ईमेल भेज और पा सकेंगे।
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {domains.map((domain) => {
        const isOpen = expanded[domain.id];
        const records = [
          ...(domain.mx_records || []).map((r: any) => ({ ...r, type: 'MX' })),
          ...(domain.spf_records || []),
          ...(domain.dkim_records || []),
          ...(domain.dmarc_records || []),
        ];
        const pendingRecords = domain.pending_records || [];
        return (
          <div key={domain.id} className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
            {/* Card header */}
            <div className="p-5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-surface-900 dark:text-white truncate">{domain.domain_name}</h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                    {domain.setup_mode === 'cname' ? 'CNAME (सिर्फ DNS) सेटअप' : 'फुल सेटअप (Nameservers)'}
                    {domain.sending_onboarded ? ' • भेजना: तैयार' : ' • भेजना: बाकी'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={domain.status} />
                <ReviewBadge status={domain.review_status} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVerify(domain.id)}
                  disabled={domain.review_status !== 'approved' || verifyingId === domain.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    domain.review_status === 'approved' && verifyingId !== domain.id
                      ? 'text-surface-700 dark:text-surface-200 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700'
                      : 'text-surface-400 bg-surface-100 dark:bg-surface-800 cursor-not-allowed'
                  }`}
                  title={domain.review_status === 'approved' ? 'फिर से जांचें' : 'Admin की मंज़ूरी बाकी'}
                >
                  {verifyingId === domain.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  {verifyingId === domain.id ? 'जांच हो रही है...' : 'जांचें'}
                </button>
                <button
                  onClick={() => onRemove(domain.id, domain.domain_name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> हटाएं
                </button>
                <button
                  onClick={() => toggle(domain.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200 rounded-lg transition-colors"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {isOpen ? 'बंद करें' : 'विवरण'}
                </button>
              </div>
            </div>

            {domain.error_message && (
              <div className="mx-5 mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                {domain.error_message}
              </div>
            )}

            {isOpen && (
              <div className="px-5 pb-5 space-y-5">
                {domain.review_status !== 'approved' && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    यह डोमेन Admin review में है। Admin approve करने के बाद ही Cloudflare onboarding, DNS records और mailbox setup शुरू होगा।
                  </div>
                )}

                {/* DNS instructions */}
                {domain.status !== 'active' && domain.review_status === 'approved' && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                      <KeyRound className="w-4 h-4" /> सेटअप निर्देश (DNS जोड़ें)
                    </h4>
                    {domain.setup_mode === 'cname' ? (
                      <div className="space-y-2">
                        {(domain.verification_records || []).map((rec: any, i: number) => (
                          <DnsRecordRow key={i} record={rec} />
                        ))}
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                          ये record अपने DNS provider पर जोड़ें। Cloudflare verify करने के बाद &quot;जांचें&quot; दबाएं।
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(domain.nameservers || []).map((ns: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-xs py-1.5">
                            <span className="w-24 font-semibold text-amber-700 dark:text-amber-400">Nameserver {i + 1}</span>
                            <span className="flex-1 font-mono text-surface-800 dark:text-surface-200">{ns}</span>
                            <CopyButton text={ns} />
                          </div>
                        ))}
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                          अपने registrar (जहां से डोमेन खरीदा है) में nameservers बदलें। Cloudflare activate करने के बाद &quot;जांचें&quot; दबाएं।
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* DNS records created by Cloudflare */}
                {records.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-2">DNS Records (Cloudflare द्वारा बनाए गए)</h4>
                    <div className="bg-surface-50 dark:bg-surface-950/50 rounded-xl px-4 border border-surface-100 dark:border-surface-800">
                      {records.map((r: any, i: number) => <DnsRecordRow key={i} record={r} />)}
                    </div>
                  </div>
                )}

                {/* Fallback records that are NOT in the zone yet — must be added at the provider */}
                {pendingRecords.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">DNS Records (अभी active नहीं — अपने provider पर जोड़ें)</h4>
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-1">
                      {pendingRecords.map((r: any, i: number) => <DnsRecordRow key={i} record={r} />)}
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                      ये record Cloudflare में list नहीं हो सके, इसलिए इन्हें अपने DNS provider पर manually जोड़ें। MX records के बिना इस डोमेन पर email receive नहीं होगा।
                    </p>
                  </div>
                )}

                {/* Test send */}
                {domain.status === 'active' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={testTo[domain.id] || ''}
                      onChange={e => setTestTo(prev => ({ ...prev, [domain.id]: e.target.value }))}
                      placeholder="test@example.com (टेस्ट ईमेल किसे भेजें)"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      onClick={() => onTestSend(domain, testTo[domain.id] || '')}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" /> टेस्ट ईमेल भेजें
                    </button>
                  </div>
                )}

                {/* Mailboxes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200">Mailboxes (ईमेल पते)</h4>
                  </div>
                  <div className="space-y-2">
                    {(mailboxes[domain.id] || []).map((mb: any) => (
                      <div key={mb.id} className="flex items-center gap-3 px-4 py-2.5 bg-surface-50 dark:bg-surface-950/50 border border-surface-100 dark:border-surface-800 rounded-xl">
                        <Mail className="w-4 h-4 text-surface-400 shrink-0" />
                        <span className="flex-1 font-mono text-sm text-surface-800 dark:text-surface-200 truncate">{mb.email_address}</span>
                        {mb.forward_to && (
                          <span className="text-xs text-surface-500 dark:text-surface-400 hidden md:block">→ {mb.forward_to}</span>
                        )}
                        {mb.is_default ? (
                          <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full">डिफ़ॉल्ट</span>
                        ) : null}
                        <button
                          onClick={() => removeMailbox(mb.id, mb.email_address, domain.id)}
                          className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {!mailboxes[domain.id]?.length && (
                      <p className="text-xs text-surface-400 dark:text-surface-500 px-1">कोई mailbox नहीं। नीचे से जोड़ें।</p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <input
                      value={newMailbox[domain.id]?.localPart || ''}
                      onChange={e => setNewMailbox(prev => ({ ...prev, [domain.id]: { ...(prev[domain.id] || {}), localPart: e.target.value } }))}
                      placeholder={domain.review_status === 'approved' ? `mailbox name (जैसे: hello → hello@${domain.domain_name})` : 'Admin की मंज़ूरी बाकी'}
                      disabled={domain.review_status !== 'approved'}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <input
                      value={newMailbox[domain.id]?.forwardTo || ''}
                      onChange={e => setNewMailbox(prev => ({ ...prev, [domain.id]: { ...(prev[domain.id] || {}), forwardTo: e.target.value } }))}
                      placeholder="फॉरवर्ड करें (वैकल्पिक, जैसे: you@gmail.com)"
                      disabled={domain.review_status !== 'approved'}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => addMailbox(domain)}
                      disabled={domain.review_status !== 'approved'}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-surface-700 dark:text-surface-200 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700"
                    >
                      <Plus className="w-4 h-4" /> जोड़ें
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// ADD DOMAIN MODAL
// ==========================================

function AddDomainModal({ emailStatus, onClose, onAdded }: { emailStatus: { entitlement: string | null; domains_allowed: number; domains_used: number; can_add_domain: boolean; email_enabled: boolean } | null; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [domainName, setDomainName] = useState('');
  const [setupMode, setSetupMode] = useState<'full' | 'cname'>('full');
  const [defaultEmailPrefix, setDefaultEmailPrefix] = useState('info');
  const [forwardTo, setForwardTo] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!domainName.trim()) {
      toast('warning', 'डोमेन नाम डालें');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ domainName: domainName.trim(), setupMode, defaultEmailPrefix, forwardTo: forwardTo || null }),
      });
      // Read raw text first so a non-JSON server response (e.g. an unhandled
      // 500) never becomes an opaque "Unexpected token" parse error in the UI.
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { error: 'सर्वर से अमान्य प्रतिक्रिया — कुछ गड़बड़ हो गई।' }; }
      if (data.success) {
        toast('success', `${data.domain?.domain_name} admin review के लिए submit हो गया।`);
        onAdded();
        onClose();
      } else {
        // Surface the actionable reason instead of a raw/technical string.
        let msg = data.error || 'डोमेन जोड़ने में त्रुटि';
        if (data.code === 'E_EMAIL_ADDON_REQUIRED') msg = 'ईमेल ऐड-ऑन सक्रिय नहीं है। पहले ईमेल ऐड-ॉन प्लान खरीदें।';
        else if (data.code === 'E_EMAIL_ADDON_LIMIT') msg = `डोमेन लिमिट पूरी: ${data.error} ऐड-ऑन अपग्रेड करें।`;
        else if (data.code === 'E_DOMAIN_LIMIT') msg = data.error;
        else if (data.code === 'E_DOMAIN_RATE_LIMIT') msg = 'बहुत ज़्यादा डोमेन जोड़ने की कोशिश — थोड़ी देर बाद कोशिश करें।';
        toast('error', msg);
      }
    } catch (e: any) {
      toast('error', e.message || 'डोमेन जोड़ने में त्रुटि');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-surface-900 dark:text-white">डोमेन जोड़ें</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {emailStatus && !emailStatus.can_add_domain && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              {emailStatus.domains_allowed === 0 ? (
                <p>ईमेल डोमेन जोड़ने का विकल्प उपलब्ध नहीं है। कृपया एक ईमेल ऐड-ऑन खरीदें या ऐसा प्लान चुनें जिसमें ईमेल डोमेन शामिल हों।</p>
              ) : (
                <p>डोमेन लिमिट पूरी हो चुकी है ({emailStatus.domains_used}/{emailStatus.domains_allowed})। और डोमेन जोड़ने के लिए प्लान/ऐड-ऑन अपग्रेड करें।</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">डोमेन नाम (जैसे: example.com)</label>{emailStatus && !emailStatus.can_add_domain && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              {emailStatus.domains_allowed === 0 ? (
                <p>ईमेल डोमेन जोड़ने का विकल्प उपलब्ध नहीं है। कृपया एक ईमेल ऐड-ऑन खरीदें या ऐसा प्लान चुनें जिसमें ईमेल डोमेन शामिल हों।</p>
              ) : (
                <p>डोमेन लिमिट पूरी हो चुकी है ({emailStatus.domains_used}/{emailStatus.domains_allowed})। और डोमेन जोड़ने के लिए प्लान/ऐड-ऑन अपग्रेड करें।</p>
              )}
            </div>
          )}

          
            <input
              type="text"
              value={domainName}
              onChange={e => setDomainName(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">सेटअप मोड</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSetupMode('full')}
                className={`p-3 rounded-xl border text-left transition-colors ${setupMode === 'full' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'}`}
              >
                <span className="block text-sm font-semibold text-surface-900 dark:text-white">फुल सेटअप (सुझाया गया)</span>
                <span className="block text-xs text-surface-500 dark:text-surface-400 mt-1">Nameservers बदलें — बाकी सब automatic</span>
              </button>
              <button
                type="button"
                disabled={true}
                onClick={() => {}}
                className={`p-3 rounded-xl border text-left transition-colors ${setupMode === 'cname' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300'}`}
              >
                <span className="block text-sm font-semibold text-surface-900 dark:text-white">CNAME सेटअप</span>
                <span className="block text-xs text-surface-500 dark:text-surface-400 mt-1">Email Routing के लिए उपलब्ध नहीं — केवल Full Setup चुनें</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">डिफ़ॉल्ट Mailbox</label>
              <input
                type="text"
                value={defaultEmailPrefix}
                onChange={e => setDefaultEmailPrefix(e.target.value.replace(/[^a-z0-9._+-]/gi, '').toLowerCase())}
                placeholder="info"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">फॉरवर्ड करें (वैकल्पिक)</label>
              <input
                type="email"
                value={forwardTo}
                onChange={e => setForwardTo(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-surface-600 dark:text-surface-300 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-xl transition-colors"
            >
              रद्द करें
            </button>
            <button
              onClick={submit}
              disabled={saving || (emailStatus !== null && !emailStatus.can_add_domain)}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 rounded-xl transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'जोड़ रहे हैं...' : 'डोमेन जोड़ें'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPOSE
// ==========================================

function ComposeSection({ domains }: { domains: any[] }) {
  const { toast } = useToast();
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateType, setTemplateType] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Single workspace-wide query instead of one request per domain
        const res = await fetch('/api/email/mailboxes', { headers: getHeaders() });
        const data: any = await res.json();
        if (cancelled) return;
        const activeDomains = new Set(domains.map(d => d.id));
        const all = (data.mailboxes || [])
          .filter((m: any) => activeDomains.has(m.domain_id))
          .map((m: any) => ({ ...m }));
        setMailboxes(all);
        if (all.length) setFrom(prev => prev || all[0].email_address);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [domains]);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast('warning', 'To, Subject और Body भरें');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ to: to.trim(), subject, html: body, fromAddress: from }),
      });
      const data: any = await res.json();
      if (data.success) {
        toast('success', `ईमेल भेज दिया गया → ${to.trim()}`);
        setTo(''); setSubject(''); setBody('');
      } else {
        toast('error', data.error || 'ईमेल भेजने में त्रुटि');
      }
    } catch (e: any) {
      toast('error', e.message || 'ईमेल भेजने में त्रुटि');
    } finally {
      setSending(false);
    }
  };

  if (!domains.length) {
    return (
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-dashed border-surface-300 dark:border-surface-700 p-10 text-center">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-surface-500 dark:text-surface-400">
          ईमेल भेजने के लिए पहले किसी डोमेन को verify करें (Status: Active)। &quot;डोमेन&quot; टैब में जाएं।
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">किससे भेजें (आपके डोमेन से)</label>
            <select
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {mailboxes.map((m, i) => (
                <option key={`${m.id}-${i}`} value={m.email_address}>{m.email_address}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">किसे भेजना है</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">विषय</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="ईमेल का विषय"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1">
            Body — वेरिएबल: {'{{name}} {{otp}} {{link}}'}
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            placeholder="<h1>नमस्ते {{name}}!</h1><p>आपका OTP है: {{otp}}</p>"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'भेज रहे हैं...' : 'ईमेल भेजें'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-6 h-fit">
        <h4 className="text-sm font-semibold text-surface-900 dark:text-white mb-3">टेम्पलेट इस्तेमाल करें</h4>
        <TemplatePicker value={templateType} onChange={setTemplateType} />
      </div>
    </div>
  );
}

// ==========================================
// TEMPLATES
// ==========================================

function TemplatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/email-templates', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (data.templates) setTemplates(data.templates); })
      .catch(() => {});
  }, []);

  const applyTemplate = async (t: any) => {
    try {
      await navigator.clipboard.writeText(t.body_html);
      onChange(t.template_type);
      toast('info', 'टेम्पलेट body copy हो गया — body में paste करें');
    } catch {
      onChange(t.template_type);
    }
  };

  if (!templates.length) {
    return <p className="text-xs text-surface-400">कोई टेम्पलेट नहीं बना है। &quot;टेम्पलेट्स&quot; टैब में बनाएं।</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map(t => (
        <button
          key={t.id}
          onClick={() => applyTemplate(t)}
          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${value === t.template_type ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'}`}
        >
          <span className="font-semibold text-surface-900 dark:text-white">{t.template_type}</span>
          <span className="block text-xs text-surface-500 dark:text-surface-400 truncate mt-0.5">{t.subject}</span>
        </button>
      ))}
    </div>
  );
}

function TemplatesSection() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email-templates', { headers: getHeaders() });
      const data: any = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch('/api/email-templates', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (data.templates) setTemplates(data.templates); })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!editing?.template_type || !editing?.subject || !editing?.body_html) {
      toast('warning', 'Template type, subject और body भरें');
      return;
    }
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ templateType: editing.template_type, subject: editing.subject, bodyHtml: editing.body_html }),
      });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'टेम्पलेट सेव हो गया');
        setEditing(null);
        load();
      } else {
        toast('error', data.error || 'सेव करने में त्रुटि');
      }
    } catch (e: any) {
      toast('error', e.message || 'सेव करने में त्रुटि');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-6">
        <h4 className="text-sm font-semibold text-surface-900 dark:text-white mb-3">टेम्पलेट्स ({templates.length})</h4>
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 bg-surface-50 dark:bg-surface-950/50 border border-surface-100 dark:border-surface-800 rounded-xl">
              <FileText className="w-4 h-4 text-primary-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-900 dark:text-white">{t.template_type}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{t.subject}</p>
              </div>
              <button
                onClick={() => setEditing(t)}
                className="px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              >
                एडिट करें
              </button>
            </div>
          ))}
          {!templates.length && <p className="text-xs text-surface-400">कोई टेम्पलेट नहीं। दाईं ओर से बनाएं।</p>}
        </div>
      </div>

      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 p-6 h-fit space-y-3">
        <h4 className="text-sm font-semibold text-surface-900 dark:text-white">{editing ? 'टेम्पलेट एडिट करें' : 'नया टेम्पलेट'}</h4>
        <input
          value={editing?.template_type || ''}
          onChange={e => setEditing((p: any) => ({ ...p, template_type: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
          placeholder="template_type (जैसे: welcome, invoice, otp)"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <input
          value={editing?.subject || ''}
          onChange={e => setEditing((p: any) => ({ ...p, subject: e.target.value }))}
          placeholder="विषय"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <textarea
          value={editing?.body_html || ''}
          onChange={e => setEditing((p: any) => ({ ...p, body_html: e.target.value }))}
          rows={8}
          placeholder="HTML body — {{name}} {{otp}} {{link}} use करें"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
        />
        <button
          onClick={save}
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 rounded-xl transition-colors"
        >
          {editing ? 'अपडेट करें' : 'टेम्पलेट बनाएं'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// SEND LOGS
// ==========================================

function LogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/email/send-logs?limit=100', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (data.logs) setLogs(data.logs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-600 dark:border-primary-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
        <h4 className="text-sm font-semibold text-surface-900 dark:text-white">सेंड लॉग्स (पिछले 100)</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-500 dark:text-surface-400 border-b border-surface-100 dark:border-surface-800">
              <th className="px-5 py-3 font-semibold">समय</th>
              <th className="px-5 py-3 font-semibold">किससे</th>
              <th className="px-5 py-3 font-semibold">किसको</th>
              <th className="px-5 py-3 font-semibold">विषय</th>
              <th className="px-5 py-3 font-semibold">स्थिति</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-surface-50 dark:border-surface-800/50 last:border-0">
                <td className="px-5 py-3 text-xs text-surface-500 dark:text-surface-400 whitespace-nowrap">
                  {new Date((l.created_at || '').replace(' ', 'T') + 'Z').toLocaleString()}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-surface-700 dark:text-surface-300">{l.from_email}</td>
                <td className="px-5 py-3 font-mono text-xs text-surface-700 dark:text-surface-300">{l.to_email}</td>
                <td className="px-5 py-3 text-xs text-surface-600 dark:text-surface-400 max-w-[200px] truncate">{l.subject || ''}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${l.status === 'sent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                    {l.status === 'sent' ? 'भेजा गया' : (l.error_code || 'विफल')}
                  </span>
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-surface-400">अभी तक कोई ईमेल नहीं भेजा गया</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
