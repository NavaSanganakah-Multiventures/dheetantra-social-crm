import { useState, useEffect, useMemo } from 'react';
import { MessageCircle, Megaphone, Search, Send } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function BroadcastView() {
  const { toast } = useToast();
  const [campaignName, setCampaignName] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [chosenWaba, setChosenWaba] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; sent: number; failed: number; pending: number } | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [activeContactIds, setActiveContactIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    Promise.all([
      fetch('/api/crm/contacts', { headers: { 'x-workspace-id': wId || '' }, credentials: 'include' }).then(r => r.json()),
      fetch('/api/whatsapp/templates', { headers: { 'x-workspace-id': wId || '' }, credentials: 'include' }).then(r => r.json()),
      fetch('/api/whatsapp/config', { headers: { 'x-workspace-id': wId || '' }, credentials: 'include' }).then(r => r.json()),
    ]).then(([contactData, templateData, configData]: any[]) => {
      if (contactData.contacts) setContacts(contactData.contacts);
      if (templateData.success) {
        const all = [...(templateData.meta || []), ...(templateData.local || [])];
        setTemplates(all.filter((t: any) => (t.status || '').toUpperCase() === 'APPROVED'));
      }
      if (configData.configs?.length) {
        setConfigs(configData.configs);
        setChosenWaba(configData.configs[0]);
      }
      // Build set of contact IDs that have active (open) conversations
      const wId = localStorage.getItem('workspaceId');
      if (wId) {
        fetch('/api/inbox/conversations?status=open&limit=500', {
          headers: { 'x-workspace-id': wId }
        }).then(r => r.json()).then((convData: any) => {
          if (convData.conversations) {
            const activeIds = new Set<string>();
            convData.conversations.forEach((c: any) => {
              if (c.contact_id) activeIds.add(c.contact_id);
            });
            setActiveContactIds(activeIds);
          }
        }).catch(() => {});
      }
    }).finally(() => setLoading(false));
  }, []);

  // Poll progress
  useEffect(() => {
    if (!campaignId) return;
    const wId = localStorage.getItem('workspaceId');
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/broadcast/${campaignId}/progress`, { headers: { 'x-workspace-id': wId || '' }, credentials: 'include' });
        const data: any = await res.json();
        setProgress(data);
        if (data.status === 'completed' || (data.sent + data.failed >= data.total && data.total > 0)) {
          clearInterval(poll);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [campaignId]);

  // ⚡ Bolt: Memoize filtered array to prevent expensive string operations on every re-render
  const filteredContacts = useMemo(() => contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    const matchesSearch = (c.name || '').toLowerCase().includes(q) || (c.phone || c.platform_contact_id || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    // Active conversations filter
    if (activeOnly && !activeContactIds.has(c.id)) return false;
    return true;
  }), [contacts, contactSearch, activeOnly, activeContactIds]);

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleTemplateSelect = (tmpl: any) => {
    setSelectedTemplate(tmpl);
    const matches = (tmpl.body_text || '').match(/\{\{\d+\}\}/g);
    setTemplateParams(matches ? new Array(matches.length).fill('') : []);
  };

  const handleSend = async () => {
    if (!campaignName || !selectedTemplate || selectedContactIds.size === 0) return;
    setSending(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId || '' },
        credentials: 'include',
        body: JSON.stringify({
          campaignName,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language || 'en_US',
          parameters: templateParams.filter(p => p.trim()),
          contactIds: Array.from(selectedContactIds),
          phoneNumberId: chosenWaba?.phone_number_id
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setCampaignId(data.campaignId);
        setProgress({ total: data.total, sent: 0, failed: 0, pending: data.total });
      } else {
        alert(data.error || 'Failed to create broadcast');
      }
    } catch {
      alert('Server error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex w-12 h-12 rounded-full bg-surface-100 dark:bg-surface-800 items-center justify-center text-surface-500 border border-surface-200 dark:border-surface-700">
          <Megaphone className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">WhatsApp Broadcast</h2>
          <p className="text-sm text-surface-500">Send template messages to all your contacts</p>
        </div>
      </div>

      {campaignId && progress ? (
        <div className="bg-white dark:bg-surface-900 p-8 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{campaignName}</h3>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${progress.sent + progress.failed >= progress.total ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'}`}>
              {progress.sent + progress.failed >= progress.total ? 'Complete' : 'In progress...'}
            </span>
          </div>
          <div className="w-full bg-surface-100 dark:bg-surface-800 rounded-full h-4 overflow-hidden">
            <div className="h-full bg-primary-600 dark:bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${progress.total > 0 ? ((progress.sent + progress.failed) / progress.total * 100) : 0}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{progress.sent}</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Sent</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{progress.failed}</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">Failed</p>
            </div>
            <div className="bg-surface-50 dark:bg-surface-800 p-4 rounded-xl">
              <p className="text-2xl font-bold text-surface-600 dark:text-surface-400">{progress.pending}</p>
              <p className="text-xs text-surface-500 mt-1">Remaining</p>
            </div>
          </div>
          {progress.sent + progress.failed >= progress.total && (
            <button onClick={() => { setCampaignId(null); setProgress(null); setCampaignName(''); setSelectedContactIds(new Set()); setSelectedTemplate(null); }} className="w-full bg-surface-900 text-white dark:bg-surface-100 dark:text-surface-900 font-medium rounded-lg px-4 py-3 hover:scale-[0.99] transition-transform">
              Create new broadcast
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-surface-900 p-6 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm">Broadcast settings</h3>
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Campaign name</label>
                <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Summer Promo Blast" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
              </div>
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Sender WABA</label>
                  <select value={chosenWaba?.id || ''} onChange={e => setChosenWaba(configs.find(c => c.id === e.target.value))} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500 font-mono">
                    {configs.map(cfg => <option key={cfg.id} value={cfg.id}>{cfg.phone_number_id}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-surface-900 p-6 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm space-y-3">
              <h3 className="font-semibold text-sm">Choose template</h3>
              {templates.length === 0 ? (
                <p className="text-xs text-surface-400">No approved templates found</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {templates.map(t => (
                    <button key={t.id || t.name} onClick={() => handleTemplateSelect(t)} className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${selectedTemplate?.name === t.name ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400' : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                      <p className="font-mono font-semibold truncate">{t.name}</p>
                      <p className="text-surface-500 mt-1 line-clamp-2">{t.body_text?.substring(0, 80)}...</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedTemplate && templateParams.length > 0 && (
              <div className="bg-white dark:bg-surface-900 p-6 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm">Parameter values</h3>
                {templateParams.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-primary-500 bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded">{'{{' + (idx + 1) + '}}'}</span>
                    <input type="text" value={val} onChange={e => { const c = [...templateParams]; c[idx] = e.target.value; setTemplateParams(c); }} placeholder={`Value ${idx + 1}`} className="flex-1 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Contact selection */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm flex flex-col h-[calc(100vh-12rem)]">
              <div className="p-4 border-b border-surface-200 dark:border-surface-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Choose recipients <span className="text-surface-400 font-normal">({selectedContactIds.size} selected)</span></h3>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${activeOnly ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400'}`}>
                      {activeContactIds.size} Active
                    </span>
                    <button onClick={toggleAll} className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">
                      {selectedContactIds.size === filteredContacts.length ? 'Remove all' : 'Select all'}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search by name or number..." className="w-full pl-9 pr-4 py-2.5 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg text-sm outline-none focus:border-primary-500" />
                </div>
                {/* Active conversations filter toggle */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setActiveOnly(!activeOnly)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      activeOnly
                        ? 'bg-primary-50 dark:bg-primary-950/40 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-400'
                        : 'bg-surface-50 dark:bg-surface-950 border-surface-200 dark:border-surface-800 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Only with active conversations
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-surface-400">No contacts found</div>
                ) : (
                  filteredContacts.map(c => (
                    <label key={c.id} className={`flex items-center gap-3 px-4 py-3 border-b border-surface-100 dark:border-surface-800/50 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors ${selectedContactIds.has(c.id) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                      <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)} className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {activeContactIds.has(c.id) && (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active conversation" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{c.name || 'Unknown'}</p>
                          <p className="text-xs text-surface-500">{c.phone || c.platform_contact_id}</p>
                        </div>
                      </div>
                      {c.email && <span className="text-[10px] text-surface-400 hidden md:block">{c.email}</span>}
                    </label>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-surface-200 dark:border-surface-800">
                <button onClick={handleSend} disabled={!campaignName || !selectedTemplate || selectedContactIds.size === 0 || sending} className="w-full disabled:opacity-40 bg-primary-600 hover:bg-primary-700 disabled:hover:bg-primary-600 text-white font-medium rounded-lg px-4 py-3 transition-all flex items-center justify-center gap-2">
                  {sending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Sending...</> : <><Send className="w-4 h-4" /> {selectedContactIds.size} Send broadcast to</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

