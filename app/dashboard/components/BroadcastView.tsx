import { useState, useEffect } from 'react';
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

  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    const matchesSearch = (c.name || '').toLowerCase().includes(q) || (c.phone || c.platform_contact_id || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    // Active conversations filter
    if (activeOnly && !activeContactIds.has(c.id)) return false;
    return true;
  });

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
        alert(data.error || 'à¤¬à¥à¤°à¥‰à¤¡à¤•à¤¾à¤¸à¥à¤Ÿ à¤¬à¤¨à¤¾à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²');
      }
    } catch {
      alert('à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center text-zinc-500 border border-zinc-200 dark:border-zinc-700">
          <Megaphone className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">WhatsApp Broadcast</h2>
          <p className="text-sm text-zinc-500">Template messages à¤­à¥‡à¤œà¥‡à¤‚ à¤…à¤ªà¤¨à¥‡ à¤¸à¤­à¥€ contacts à¤•à¥‹</p>
        </div>
      </div>

      {campaignId && progress ? (
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{campaignName}</h3>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${progress.sent + progress.failed >= progress.total ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
              {progress.sent + progress.failed >= progress.total ? 'à¤ªà¥‚à¤°à¥à¤£' : 'à¤ªà¥à¤°à¤—à¤¤à¤¿ à¤®à¥‡à¤‚...'}
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-4 overflow-hidden">
            <div className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress.total > 0 ? ((progress.sent + progress.failed) / progress.total * 100) : 0}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{progress.sent}</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">à¤­à¥‡à¤œà¥‡ à¤—à¤</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{progress.failed}</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">à¤µà¤¿à¤«à¤²</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl">
              <p className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">{progress.pending}</p>
              <p className="text-xs text-zinc-500 mt-1">à¤¬à¤¾à¤•à¥€</p>
            </div>
          </div>
          {progress.sent + progress.failed >= progress.total && (
            <button onClick={() => { setCampaignId(null); setProgress(null); setCampaignName(''); setSelectedContactIds(new Set()); setSelectedTemplate(null); }} className="w-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-lg px-4 py-3 hover:scale-[0.99] transition-transform">
              à¤¨à¤¯à¤¾ à¤¬à¥à¤°à¥‰à¤¡à¤•à¤¾à¤¸à¥à¤Ÿ à¤¬à¤¨à¤¾à¤à¤‚
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm">à¤¬à¥à¤°à¥‰à¤¡à¤•à¤¾à¤¸à¥à¤Ÿ à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸</h3>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">à¤…à¤­à¤¿à¤¯à¤¾à¤¨ à¤•à¤¾ à¤¨à¤¾à¤®</label>
                <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="à¤œà¥ˆà¤¸à¥‡: Summer Promo Blast" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">à¤ªà¥à¤°à¥‡à¤·à¤• WABA</label>
                  <select value={chosenWaba?.id || ''} onChange={e => setChosenWaba(configs.find(c => c.id === e.target.value))} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 font-mono">
                    {configs.map(cfg => <option key={cfg.id} value={cfg.id}>{cfg.phone_number_id}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <h3 className="font-semibold text-sm">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤šà¥à¤¨à¥‡à¤‚</h3>
              {templates.length === 0 ? (
                <p className="text-xs text-zinc-400">à¤•à¥‹à¤ˆ approved à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {templates.map(t => (
                    <button key={t.id || t.name} onClick={() => handleTemplateSelect(t)} className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${selectedTemplate?.name === t.name ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-400' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                      <p className="font-mono font-semibold truncate">{t.name}</p>
                      <p className="text-zinc-500 mt-1 line-clamp-2">{t.body_text?.substring(0, 80)}...</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedTemplate && templateParams.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <h3 className="font-semibold text-sm">à¤ªà¥ˆà¤°à¤¾à¤®à¥€à¤Ÿà¤° à¤®à¤¾à¤¨</h3>
                {templateParams.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">{'{{' + (idx + 1) + '}}'}</span>
                    <input type="text" value={val} onChange={e => { const c = [...templateParams]; c[idx] = e.target.value; setTemplateParams(c); }} placeholder={`à¤®à¤¾à¤¨ ${idx + 1}`} className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Contact selection */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col h-[calc(100vh-12rem)]">
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤à¤•à¤°à¥à¤¤à¤¾ à¤šà¥à¤¨à¥‡à¤‚ <span className="text-zinc-400 font-normal">({selectedContactIds.size} à¤šà¥à¤¨à¥‡ à¤—à¤)</span></h3>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${activeOnly ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>
                      {activeContactIds.size} à¤¸à¤•à¥à¤°à¤¿à¤¯
                    </span>
                    <button onClick={toggleAll} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                      {selectedContactIds.size === filteredContacts.length ? 'à¤¸à¤­à¥€ à¤¹à¤Ÿà¤¾à¤à¤‚' : 'à¤¸à¤­à¥€ à¤šà¥à¤¨à¥‡à¤‚'}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="à¤¨à¤¾à¤® à¤¯à¤¾ à¤¨à¤‚à¤¬à¤° à¤¸à¥‡ à¤–à¥‹à¤œà¥‡à¤‚..." className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500" />
                </div>
                {/* Active conversations filter toggle */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setActiveOnly(!activeOnly)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      activeOnly
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    à¤•à¥‡à¤µà¤² à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤µà¤¾à¤²à¥‡
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">à¤•à¥‹à¤ˆ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾</div>
                ) : (
                  filteredContacts.map(c => (
                    <label key={c.id} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${selectedContactIds.has(c.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                      <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {activeContactIds.has(c.id) && (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active conversation" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.name || 'à¤…à¤œà¥à¤žà¤¾à¤¤'}</p>
                          <p className="text-xs text-zinc-500">{c.phone || c.platform_contact_id}</p>
                        </div>
                      </div>
                      {c.email && <span className="text-[10px] text-zinc-400 hidden md:block">{c.email}</span>}
                    </label>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                <button onClick={handleSend} disabled={!campaignName || !selectedTemplate || selectedContactIds.size === 0 || sending} className="w-full disabled:opacity-40 bg-indigo-600 hover:bg-indigo-700 disabled:hover:bg-indigo-600 text-white font-medium rounded-lg px-4 py-3 transition-all flex items-center justify-center gap-2">
                  {sending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> à¤­à¥‡à¤œ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚...</> : <><Send className="w-4 h-4" /> {selectedContactIds.size} à¤•à¥‹ à¤¬à¥à¤°à¥‰à¤¡à¤•à¤¾à¤¸à¥à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

