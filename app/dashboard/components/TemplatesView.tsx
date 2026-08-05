import React, { useState, useEffect } from 'react';
import { Megaphone, Send, X, Activity, FileText, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '@/components/ui/Toast';

export function TemplatesView({ selectedWaba }: { selectedWaba?: any }) {
  const { toast } = useToast();
  const [localTemplates, setLocalTemplates] = useState<any[]>([]);
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // Multi-WABA configs state
  const [configs, setConfigs] = useState<any[]>([]);
  const [chosenWaba, setChosenWaba] = useState<any>(null);

  // Create template form state
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("en_US");
  const [bodyText, setBodyText] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState("");

  // Send template form state
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [recipient, setRecipient] = useState("");
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMessage, setSendMessage] = useState("");

  const [activeSubTab, setActiveSubTab] = useState<'meta' | 'local'>('meta');

  const fetchTemplates = async () => {
    setSyncing(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/templates', {
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        setLocalTemplates(data.local || []);
        setMetaTemplates(data.meta || []);
        setMetaError(data.metaError || null);
      } else {
        setMetaError(data.error || "à¤Ÿà¥‡à¤‚à¤ªà¤²à¥‡à¤Ÿà¥à¤¸ à¤²à¥‹à¤¡ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (e) {
      setMetaError("à¤¸à¤°à¥à¤µà¤° à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥à¥¤");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const wId = localStorage.getItem('workspaceId');
      try {
        // Fetch WABA configs
        const configRes = await fetch('/api/whatsapp/config', {
          headers: { 'x-workspace-id': wId || '' }
        });
        const configData: any = await configRes.json();
        if (active && configData.configs) {
          setConfigs(configData.configs);
          if (configData.configs.length > 0) {
            const matched = selectedWaba && selectedWaba.phone_number_id !== 'all'
              ? configData.configs.find((c: any) => c.phone_number_id === selectedWaba.phone_number_id)
              : null;
            setChosenWaba(matched || configData.configs[0]);
          }
        }

        const res = await fetch('/api/whatsapp/templates', {
          headers: { 'x-workspace-id': wId || '' }
        });
        const data: any = await res.json();
        if (active) {
          if (data.success) {
            setLocalTemplates(data.local || []);
            setMetaTemplates(data.meta || []);
            setMetaError(data.metaError || null);
          } else {
            setMetaError(data.error || "à¤Ÿà¥‡à¤‚à¤ªà¤²à¥‡à¤Ÿà¥à¤¸ à¤²à¥‹à¤¡ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
          }
        }
      } catch (e) {
        if (active) setMetaError("à¤¸à¤°à¥à¤µà¤° à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥à¥¤");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [selectedWaba]);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName || !bodyText) {
      setCreateMessage("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤­à¥€ à¤†à¤µà¤¶à¥à¤¯à¤• à¤«à¤¼à¥€à¤²à¥à¤¡ à¤­à¤°à¥‡à¤‚à¥¤");
      return;
    }
    setCreateLoading(true);
    setCreateMessage("");

    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({
          name: templateName,
          category,
          language,
          body_text: bodyText
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setCreateMessage("à¤¸à¤«à¤²à¤¤à¤¾: " + data.message);
        setTemplateName("");
        setBodyText("");
        setTimeout(() => {
          setShowCreateModal(false);
          setCreateMessage("");
          fetchTemplates();
        }, 1500);
      } else {
        setCreateMessage("à¤¤à¥à¤°à¥à¤Ÿà¤¿: " + (data.metaError || data.error || "à¤¸à¤¹à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥"));
      }
    } catch (e) {
      setCreateMessage("à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°à¥¤");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteLocalTemplate = async (id: string) => {
    if (!confirm("à¤•à¥à¤¯à¤¾ à¤†à¤ª à¤µà¤¾à¤•à¤ˆ à¤‡à¤¸ à¤²à¥‹à¤•à¤² à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤•à¥‹ à¤¹à¤Ÿà¤¾à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚?")) return;
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch(`/api/whatsapp/templates/${id}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        fetchTemplates();
      } else {
        alert(data.error || "à¤¹à¤Ÿà¤¾à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
      }
    } catch (e) {
      alert("à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°");
    }
  };

  const openSendModal = (tmpl: any) => {
    setSelectedTemplate(tmpl);
    setRecipient("");
    // Detect number of parameters {{1}}, {{2}}...
    const matches = tmpl.body_text.match(/\{\{\d+\}\}/g);
    const paramCount = matches ? new Set(matches).size : 0;
    setParamValues(Array(paramCount).fill(""));
    setSendMessage("");
    setShowSendModal(true);
  };

  const handleSendTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient) {
      setSendMessage("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤à¤•à¤°à¥à¤¤à¤¾ à¤•à¤¾ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚à¥¤");
      return;
    }
    setSendLoading(true);
    setSendMessage("");

    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/templates/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({
          to: recipient,
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          parameters: paramValues,
          phoneNumberId: chosenWaba ? chosenWaba.phone_number_id : undefined
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setSendMessage("à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• à¤­à¥‡à¤œà¤¾ à¤—à¤¯à¤¾! à¤¸à¤‚à¤¦à¥‡à¤¶ à¤†à¤ªà¤•à¥‡ à¤²à¤¾à¤‡à¤µ à¤‡à¤¨à¤¬à¥‰à¤•à¥à¤¸ à¤®à¥‡à¤‚ à¤¦à¤¿à¤–à¤¾à¤ˆ à¤¦à¥‡à¤—à¤¾à¥¤");
        setTimeout(() => {
          setShowSendModal(false);
          setSendMessage("");
        }, 2000);
      } else {
        setSendMessage("à¤¤à¥à¤°à¥à¤Ÿà¤¿: " + (data.error || "à¤­à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥"));
      }
    } catch (e) {
      setSendMessage("à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°");
    } finally {
      setSendLoading(false);
    }
  };

  const formatBodyText = (text: string) => {
    if (!text) return "No body content";
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, index) => {
      if (part.match(/\{\{\d+\}\}/)) {
        return (
          <span key={index} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs font-semibold font-mono">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const templatesToShow = activeSubTab === 'meta' ? metaTemplates : localTemplates;

  return (
    <div className="p-6 md:p-8 w-full max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">WhatsApp à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿà¥à¤¸ (Templates)</h2>
          <p className="text-sm text-zinc-500">à¤…à¤ªà¤¨à¥‡ WhatsApp Business Account à¤•à¥‡ à¤¸à¥à¤µà¥€à¤•à¥ƒà¤¤ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿà¥à¤¸ à¤ªà¥à¤°à¤¬à¤‚à¤§à¤¿à¤¤ à¤•à¤°à¥‡à¤‚ à¤”à¤° à¤…à¤­à¤¿à¤¯à¤¾à¤¨ à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚à¥¤</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchTemplates} disabled={syncing} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
            <Activity className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Meta à¤¸à¥‡ à¤¸à¤¿à¤‚à¤• à¤•à¤°à¥‡à¤‚
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md shadow-indigo-600/10 flex items-center gap-2">
            <Plus className="w-4 h-4" /> à¤¨à¤¯à¤¾ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¬à¤¨à¤¾à¤à¤‚
          </button>
        </div>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 flex gap-4">
        <button onClick={() => setActiveSubTab('meta')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'meta' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
          <Megaphone className="w-4 h-4" /> Meta API à¤¸à¥à¤µà¥€à¤•à¥ƒà¤¤ ({metaTemplates.length})
        </button>
        <button onClick={() => setActiveSubTab('local')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'local' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
          <FileText className="w-4 h-4" /> à¤²à¥‹à¤•à¤² à¤¡à¥à¤°à¤¾à¤«à¥à¤Ÿà¥à¤¸ ({localTemplates.length})
        </button>
      </div>

      {metaError && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-xs text-amber-800 dark:text-amber-400 flex flex-col gap-1">
          <span className="font-bold text-sm">Meta API à¤¸à¤¿à¤‚à¤• à¤šà¥‡à¤¤à¤¾à¤µà¤¨à¥€ (Sync Warning):</span>
          <span>{metaError}</span>
          <span className="mt-2 text-zinc-500">à¤¸à¥à¤à¤¾à¤µ: à¤¸à¥à¤¨à¤¿à¤¶à¥à¤šà¤¿à¤¤ à¤•à¤°à¥‡à¤‚ à¤•à¤¿ à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸ à¤®à¥‡à¤‚ à¤®à¤¾à¤¨à¥à¤¯ WABA ID à¤”à¤° Permanent Access Token à¤¸à¥‡à¤Ÿ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾ à¤¹à¥ˆà¥¤ à¤¤à¤¬ à¤¤à¤• à¤†à¤ª à¤²à¥‹à¤•à¤² à¤¡à¥à¤°à¤¾à¤«à¥à¤Ÿà¥à¤¸ à¤•à¤¾ à¤‰à¤ªà¤¯à¥‹à¤— à¤•à¤° à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤</span>
        </div>
      )}

      {templatesToShow.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950/30 flex flex-col items-center justify-center">
          <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4 animate-pulse" />
          <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200 mb-1">à¤•à¥‹à¤ˆ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾</h3>
          <p className="text-sm text-zinc-500 max-w-md">à¤‡à¤¸ à¤¶à¥à¤°à¥‡à¤£à¥€ à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤†à¤ª à¤¸à¥€à¤§à¥‡ à¤¨à¤¯à¤¾ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¬à¤¨à¤¾ à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templatesToShow.map((tmpl) => (
            <motion.div key={tmpl.id} layout className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-zinc-900 dark:text-white font-mono text-sm truncate">{tmpl.name}</h3>
                    <p className="text-xs text-zinc-400 mt-1 uppercase tracking-wider font-semibold">{tmpl.category}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    tmpl.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                    tmpl.status === 'PENDING' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                    'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                  }`}>
                    {tmpl.status}
                  </span>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 break-words min-h-[100px] whitespace-pre-wrap">
                  {formatBodyText(tmpl.body_text)}
                </div>

                <div className="flex justify-between items-center text-xs text-zinc-400 font-medium">
                  <span>à¤­à¤¾à¤·à¤¾: <span className="font-mono text-zinc-600 dark:text-zinc-400">{tmpl.language}</span></span>
                  {tmpl.is_meta && <span className="text-indigo-500 font-semibold flex items-center gap-1">â— Meta API</span>}
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-900/50 p-4 flex gap-3">
                <button onClick={() => openSendModal(tmpl)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                  <Send className="w-3.5 h-3.5" /> à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚
                </button>
                {!tmpl.is_meta && (
                  <button onClick={() => handleDeleteLocalTemplate(tmpl.id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all" title="à¤¹à¤Ÿà¤¾à¤à¤‚">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* CREATE TEMPLATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
              <div>
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">à¤¨à¤¯à¤¾ à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¬à¤¨à¤¾à¤à¤‚</h3>
                <p className="text-xs text-zinc-500">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¸à¥€à¤§à¥‡ Meta API à¤ªà¤° à¤¸à¤¬à¤®à¤¿à¤Ÿ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾à¤à¤—à¤¾</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¨à¤¾à¤® (Alphanumeric and underscores only)</label>
                <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g. welcome_offer_new" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤¶à¥à¤°à¥‡à¤£à¥€ (Category)</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                    <option value="UTILITY">UTILITY (à¤‰à¤ªà¤¯à¥‹à¤—à¤¿à¤¤à¤¾)</option>
                    <option value="MARKETING">MARKETING (à¤µà¤¿à¤ªà¤£à¤¨)</option>
                    <option value="AUTHENTICATION">AUTHENTICATION (à¤ªà¥à¤°à¤®à¤¾à¤£à¥€à¤•à¤°à¤£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤­à¤¾à¤·à¤¾ (Language Code)</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono">
                    <option value="en_US">en_US (à¤…à¤‚à¤—à¥à¤°à¥‡à¤œà¤¼à¥€)</option>
                    <option value="hi_IN">hi_IN (à¤¹à¤¿à¤‚à¤¦à¥€)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¬à¥‰à¤¡à¥€ à¤Ÿà¥‡à¤•à¥à¤¸à¥à¤Ÿ (Template Body)</label>
                <textarea rows={4} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="à¤¨à¤®à¤¸à¥à¤¤à¥‡ {{1}}, à¤†à¤ªà¤•à¥‡ à¤‘à¤°à¥à¤¡à¤° {{2}} à¤•à¥€ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤¹à¥‹ à¤—à¤ˆ à¤¹à¥ˆ!" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 resize-none" required />
                <p className="text-[10px] text-zinc-400 mt-1.5">à¤ªà¥ˆà¤°à¤¾à¤®à¥€à¤Ÿà¤° à¤µà¥‡à¤°à¤¿à¤à¤¬à¤² à¤œà¥‹à¤¡à¤¼à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ {"{{1}}"}, {"{{2}}"} à¤†à¤¦à¤¿ à¤•à¤¾ à¤‰à¤ªà¤¯à¥‹à¤— à¤•à¤°à¥‡à¤‚à¥¤</p>
              </div>

              {createMessage && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/30 rounded-xl text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  {createMessage}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={createLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {createLoading ? "à¤ªà¥à¤°à¤¸à¤‚à¤¸à¥à¤•à¤°à¤£ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ..." : "à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¸à¤¬à¤®à¤¿à¤Ÿ à¤•à¤°à¥‡à¤‚"}
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 rounded-xl text-sm font-medium transition-all">
                  à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND TEMPLATE MODAL */}
      {showSendModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
              <div>
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚</h3>
                <p className="text-xs text-zinc-500">à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ: <span className="font-mono">{selectedTemplate.name}</span></p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendTemplate} className="p-6 space-y-4">
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤ªà¥à¤°à¥‡à¤·à¤• à¤¨à¤‚à¤¬à¤° (Sender WABA)</label>
                  <select 
                    value={chosenWaba?.id || ''} 
                    onChange={e => {
                      const selected = configs.find(c => c.id === e.target.value);
                      setChosenWaba(selected);
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono"
                  >
                    {configs.map((cfg) => (
                      <option key={cfg.id} value={cfg.id}>
                        {cfg.phone_number_id} ({cfg.reply_mode || 'manual'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤à¤•à¤°à¥à¤¤à¤¾ à¤•à¤¾ à¤®à¥‹à¤¬à¤¾à¤‡à¤² à¤¨à¤‚à¤¬à¤° (à¤¦à¥‡à¤¶ à¤•à¥‹à¤¡ à¤•à¥‡ à¤¸à¤¾à¤¥)</label>
                <input type="text" value={recipient} onChange={e => setRecipient(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="e.g. +919876543210" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono" required />
              </div>

              {paramValues.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">à¤ªà¥ˆà¤°à¤¾à¤®à¥€à¤Ÿà¤° à¤®à¤¾à¤¨ (Dynamic Values)</h4>
                  {paramValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-12 text-xs font-bold font-mono text-indigo-500 text-center bg-indigo-50 dark:bg-indigo-950/20 py-2 rounded-lg border border-indigo-100 dark:border-indigo-950/30">
                        {"{{" + (idx + 1) + "}}"}
                      </span>
                      <input type="text" value={val} onChange={e => {
                        const copy = [...paramValues];
                        copy[idx] = e.target.value;
                        setParamValues(copy);
                      }} placeholder={`à¤µà¥ˆà¤²à¥à¤¯à¥‚ à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚ (Value for {{${idx+1}}})`} className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500" required />
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-400">à¤ªà¥‚à¤°à¥à¤µà¤¾à¤µà¤²à¥‹à¤•à¤¨ (Preview):</span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                  {selectedTemplate.body_text.replace(/\{\{(\d+)\}\}/g, (match: string, p1: string) => {
                    const idx = parseInt(p1) - 1;
                    return paramValues[idx] || match;
                  })}
                </p>
              </div>

              {sendMessage && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/30 rounded-xl text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  {sendMessage}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={sendLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {sendLoading ? "à¤­à¥‡à¤œà¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ..." : "à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚"}
                </button>
                <button type="button" onClick={() => setShowSendModal(false)} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 rounded-xl text-sm font-medium transition-all">
                  à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

