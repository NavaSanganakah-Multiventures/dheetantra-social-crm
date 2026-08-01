"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Plus, Trash2, RefreshCw, Copy, Check, Globe, Send, FileText, X,
  ShieldCheck, Clock, AlertCircle, Loader2, KeyRound, ChevronDown, ChevronUp, Inbox
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
  };
  const label: Record<string, string> = {
    active: 'Active (Verified)',
    pending: 'Pending Verification',
    failed: 'Failed',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || map.pending}`}>
      {status === 'active' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
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
      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : (label || 'Copy')}
    </button>
  );
}

function DnsRecordRow({ record }: { record: any }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 text-xs py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="w-10 font-mono font-bold text-zinc-500 dark:text-zinc-400">{record.type || 'TXT'}</span>
      <span className="flex-1 font-mono text-zinc-800 dark:text-zinc-200 break-all min-w-0">{record.name || '@'}</span>
      <span className="flex-1 font-mono text-zinc-600 dark:text-zinc-400 break-all min-w-0">{record.content}</span>
      {record.priority !== undefined && <span className="w-8 text-zinc-400">P:{record.priority}</span>}
      <CopyButton text={`${record.name || ''} ${record.content}`} />
    </div>
  );
}

export default function EmailServiceView() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'domains' | 'compose' | 'templates' | 'logs'>('domains');
  const [domains, setDomains] = useState<any[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

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
    fetch('/api/domains', { headers: getHeaders() })
      .then(r => r.json())
      .then((data: any) => { if (data.domains) setDomains(data.domains); })
      .catch((e) => console.error('Failed to load domains', e))
      .finally(() => setLoadingDomains(false));
  }, []);

  const verifyDomain = async (id: string) => {
    try {
      const res = await fetch(`/api/domains/${id}/verify`, { method: 'POST', headers: getHeaders() });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'डोमेन स्थिति अपडेट हो गई (Domain status updated)');
        refreshDomains();
      } else {
        toast('error', data.error || 'Verification failed');
      }
    } catch (e: any) {
      toast('error', e.message || 'Verification failed');
    }
  };

  const removeDomain = async (id: string, name: string) => {
    if (!window.confirm(`क्या आप डोमेन "${name}" हटाना चाहते हैं? Zone और Email Routing Cloudflare से भी हट जाएगा।`)) return;
    try {
      const res = await fetch(`/api/domains/${id}`, { method: 'DELETE', headers: getHeaders() });
      const data: any = await res.json();
      if (data.success) {
        toast('success', 'डोमेन हटा दिया गया (Domain removed)');
        refreshDomains();
      } else {
        toast('error', data.error || 'Failed to remove domain');
      }
    } catch (e: any) {
      toast('error', e.message || 'Failed to remove domain');
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
        toast('error', data.error || 'Test email failed');
      }
    } catch (e: any) {
      toast('error', e.message || 'Test email failed');
    }
  };

  const activeDomains = domains.filter(d => d.status === 'active');

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">ईमेल सेवा (Email Service)</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            अपना डोमेन जोड़ें और Cloudflare Email Service से ईमेल भेजें व पाएं।
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> डोमेन जोड़ें (Add Domain)
        </button>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {([
          ['domains', 'डोमेन', Globe],
          ['compose', 'ईमेल भेजें', Send],
          ['templates', 'टेम्पलेट्स', FileText],
          ['logs', 'सेंड लॉग्स', Inbox],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

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

      {showAddModal && <AddDomainModal onClose={() => setShowAddModal(false)} onAdded={refreshDomains} />}
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
  onVerify: (id: string) => void;
  onRemove: (id: string, name: string) => void;
  onTestSend: (domain: any, to: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mailboxes, setMailboxes] = useState<Record<string, any[]>>({});
  const [newMailbox, setNewMailbox] = useState<Record<string, { localPart: string; forwardTo: string }>>({});
  const [testTo, setTestTo] = useState<Record<string, string>>({});

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
        toast('error', data.error || 'Failed to delete mailbox');
      }
    } catch (e: any) {
      toast('error', e.message || 'Failed to delete mailbox');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!domains.length) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
        <div className="w-14 h-14 mx-auto bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4">
          <Mail className="w-7 h-7" />
        </div>
        <h3 className="font-semibold text-zinc-900 dark:text-white">कोई डोमेन नहीं जुड़ा है</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
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
        return (
          <div key={domain.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Card header */}
            <div className="p-5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{domain.domain_name}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {domain.setup_mode === 'cname' ? 'CNAME (DNS-only) Setup' : 'Full Setup (Nameservers)'}
                    {domain.sending_onboarded ? ' • Sending: Ready' : ' • Sending: Pending'}
                  </p>
                </div>
              </div>
              <StatusBadge status={domain.status} />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onVerify(domain.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                  title="फिर से जांचें"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> जांचें
                </button>
                <button
                  onClick={() => onRemove(domain.id, domain.domain_name)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> हटाएं
                </button>
                <button
                  onClick={() => toggle(domain.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition-colors"
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
                {/* DNS instructions */}
                {domain.status !== 'active' && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                      <KeyRound className="w-4 h-4" /> Setup Instructions (DNS जोड़ें)
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
                            <span className="flex-1 font-mono text-zinc-800 dark:text-zinc-200">{ns}</span>
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
                    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">DNS Records (Cloudflare द्वारा बनाए गए)</h4>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 rounded-xl px-4 border border-zinc-100 dark:border-zinc-800">
                      {records.map((r: any, i: number) => <DnsRecordRow key={i} record={r} />)}
                    </div>
                  </div>
                )}

                {/* Test send */}
                {domain.status === 'active' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={testTo[domain.id] || ''}
                      onChange={e => setTestTo(prev => ({ ...prev, [domain.id]: e.target.value }))}
                      placeholder="test@example.com (test email किसे भेजें)"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => onTestSend(domain, testTo[domain.id] || '')}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" /> टेस्ट ईमेल भेजें
                    </button>
                  </div>
                )}

                {/* Mailboxes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Mailboxes (ईमेल पते)</h4>
                  </div>
                  <div className="space-y-2">
                    {(mailboxes[domain.id] || []).map((mb: any) => (
                      <div key={mb.id} className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-xl">
                        <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="flex-1 font-mono text-sm text-zinc-800 dark:text-zinc-200 truncate">{mb.email_address}</span>
                        {mb.forward_to && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden md:block">→ {mb.forward_to}</span>
                        )}
                        {mb.is_default ? (
                          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">Default</span>
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
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1">कोई mailbox नहीं। नीचे से जोड़ें।</p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2">
                    <input
                      value={newMailbox[domain.id]?.localPart || ''}
                      onChange={e => setNewMailbox(prev => ({ ...prev, [domain.id]: { ...(prev[domain.id] || {}), localPart: e.target.value } }))}
                      placeholder={`mailbox name (जैसे: hello → hello@${domain.domain_name})`}
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      value={newMailbox[domain.id]?.forwardTo || ''}
                      onChange={e => setNewMailbox(prev => ({ ...prev, [domain.id]: { ...(prev[domain.id] || {}), forwardTo: e.target.value } }))}
                      placeholder="forward to (optional, e.g. you@gmail.com)"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => addMailbox(domain)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
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

function AddDomainModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
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
      const data: any = await res.json();
      if (data.success) {
        toast('success', `डोमेन ${data.domain?.domain_name} जोड़ दिया गया!`);
        onAdded();
        onClose();
      } else {
        toast('error', data.error || 'डोमेन जोड़ने में त्रुटि');
      }
    } catch (e: any) {
      toast('error', e.message || 'डोमेन जोड़ने में त्रुटि');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">डोमेन जोड़ें (Add Domain)</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">डोमेन नाम (जैसे: example.com)</label>
            <input
              type="text"
              value={domainName}
              onChange={e => setDomainName(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Setup Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSetupMode('full')}
                className={`p-3 rounded-xl border text-left transition-colors ${setupMode === 'full' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}
              >
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Full Setup (Recommended)</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1">Nameservers बदलें — बाकी सब automatic</span>
              </button>
              <button
                type="button"
                onClick={() => setSetupMode('cname')}
                className={`p-3 rounded-xl border text-left transition-colors ${setupMode === 'cname' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}
              >
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">CNAME Setup</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-1">DNS records खुद जोड़ें (Business+ plan)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Default Mailbox</label>
              <input
                type="text"
                value={defaultEmailPrefix}
                onChange={e => setDefaultEmailPrefix(e.target.value.replace(/[^a-z0-9._+-]/gi, '').toLowerCase())}
                placeholder="info"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Forward To (optional)</label>
              <input
                type="email"
                value={forwardTo}
                onChange={e => setForwardTo(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
            >
              रद्द करें
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
        <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          ईमेल भेजने के लिए पहले किसी डोमेन को verify करें (Status: Active)। &quot;डोमेन&quot; टैब में जाएं।
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">From (आपके डोमेन से)</label>
            <select
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {mailboxes.map((m, i) => (
                <option key={`${m.id}-${i}`} value={m.email_address}>{m.email_address}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">To (किसे भेजना है)</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="customer@example.com"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="ईमेल का subject"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
            Body (HTML support) — वेरिएबल: {'{{name}} {{otp}} {{link}}'}
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            placeholder="<h1>नमस्ते {{name}}!</h1><p>आपका OTP है: {{otp}}</p>"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'भेज रहे हैं...' : 'ईमेल भेजें'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 h-fit">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">टेम्पलेट इस्तेमाल करें</h4>
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
    return <p className="text-xs text-zinc-400">कोई टेम्पलेट नहीं बना है। &quot;टेम्पलेट्स&quot; टैब में बनाएं।</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map(t => (
        <button
          key={t.id}
          onClick={() => applyTemplate(t)}
          className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${value === t.template_type ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}
        >
          <span className="font-semibold text-zinc-900 dark:text-white">{t.template_type}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{t.subject}</span>
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">टेम्पलेट्स ({templates.length})</h4>
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-xl">
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{t.template_type}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{t.subject}</p>
              </div>
              <button
                onClick={() => setEditing(t)}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                Edit
              </button>
            </div>
          ))}
          {!templates.length && <p className="text-xs text-zinc-400">कोई टेम्पलेट नहीं। दाईं ओर से बनाएं।</p>}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 h-fit space-y-3">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{editing ? 'टेम्पलेट एडिट करें' : 'नया टेम्पलेट'}</h4>
        <input
          value={editing?.template_type || ''}
          onChange={e => setEditing((p: any) => ({ ...p, template_type: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
          placeholder="template_type (जैसे: welcome, invoice, otp)"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={editing?.subject || ''}
          onChange={e => setEditing((p: any) => ({ ...p, subject: e.target.value }))}
          placeholder="Subject"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <textarea
          value={editing?.body_html || ''}
          onChange={e => setEditing((p: any) => ({ ...p, body_html: e.target.value }))}
          rows={8}
          placeholder="HTML body — {{name}} {{otp}} {{link}} use करें"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
        <button
          onClick={save}
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl transition-colors"
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
        <div className="w-8 h-8 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">सेंड लॉग्स (पिछले 100)</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
              <th className="px-5 py-3 font-semibold">समय</th>
              <th className="px-5 py-3 font-semibold">From</th>
              <th className="px-5 py-3 font-semibold">To</th>
              <th className="px-5 py-3 font-semibold">Subject</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                <td className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  {new Date((l.created_at || '').replace(' ', 'T') + 'Z').toLocaleString()}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.from_email}</td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">{l.to_email}</td>
                <td className="px-5 py-3 text-xs text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate">{l.subject || ''}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${l.status === 'sent' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                    {l.status === 'sent' ? 'Sent' : (l.error_code || 'Failed')}
                  </span>
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-400">अभी तक कोई ईमेल नहीं भेजा गया</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
