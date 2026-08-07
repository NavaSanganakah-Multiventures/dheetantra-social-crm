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
        setMetaError(data.error || "टेंपलेट्स लोड करने में विफल");
      }
    } catch (e) {
      setMetaError("सर्वर से संपर्क करने में असमर्थ।");
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
            setMetaError(data.error || "टेंपलेट्स लोड करने में विफल");
          }
        }
      } catch (e) {
        if (active) setMetaError("सर्वर से संपर्क करने में असमर्थ।");
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
      setCreateMessage("कृपया सभी आवश्यक फ़ील्ड भरें।");
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
        setCreateMessage("सफलता: " + data.message);
        setTemplateName("");
        setBodyText("");
        setTimeout(() => {
          setShowCreateModal(false);
          setCreateMessage("");
          fetchTemplates();
        }, 1500);
      } else {
        setCreateMessage("त्रुटि: " + (data.metaError || data.error || "सहेजने में असमर्थ"));
      }
    } catch (e) {
      setCreateMessage("सर्वर एरर।");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteLocalTemplate = async (id: string) => {
    if (!confirm("क्या आप वाकई इस लोकल टेम्पलेट को हटाना चाहते हैं?")) return;
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
        alert(data.error || "हटाने में विफलता");
      }
    } catch (e) {
      alert("सर्वर एरर");
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
      setSendMessage("कृपया प्राप्तकर्ता का फ़ोन नंबर दर्ज करें।");
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
        setSendMessage("सफलतापूर्वक भेजा गया! संदेश आपके लाइव इनबॉक्स में दिखाई देगा।");
        setTimeout(() => {
          setShowSendModal(false);
          setSendMessage("");
        }, 2000);
      } else {
        setSendMessage("त्रुटि: " + (data.error || "भेजने में असमर्थ"));
      }
    } catch (e) {
      setSendMessage("सर्वर एरर");
    } finally {
      setSendLoading(false);
    }
  };

  const formatBodyText = (text: string) => {
    if (!text) return "कोई बॉडी कंटेंट नहीं";
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, index) => {
      if (part.match(/\{\{\d+\}\}/)) {
        return (
          <span key={index} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 text-xs font-semibold font-mono">
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
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const templatesToShow = activeSubTab === 'meta' ? metaTemplates : localTemplates;

  return (
    <div className="p-6 md:p-8 w-full max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white font-display">WhatsApp टेम्पलेट्स</h2>
          <p className="text-sm text-surface-500">अपने WhatsApp Business Account के स्वीकृत टेम्पलेट्स प्रबंधित करें और अभियान शुरू करें।</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchTemplates} disabled={syncing} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
            <Activity className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Meta से सिंक करें
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md shadow-primary-600/10 flex items-center gap-2">
            <Plus className="w-4 h-4" /> नया टेम्पलेट बनाएं
          </button>
        </div>
      </div>

      <div className="border-b border-surface-200 dark:border-surface-800 flex gap-4">
        <button onClick={() => setActiveSubTab('meta')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'meta' ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
          <Megaphone className="w-4 h-4" /> Meta API स्वीकृत ({metaTemplates.length})
        </button>
        <button onClick={() => setActiveSubTab('local')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'local' ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-surface-400 hover:text-surface-600'}`}>
          <FileText className="w-4 h-4" /> लोकल ड्राफ्ट्स ({localTemplates.length})
        </button>
      </div>

      {metaError && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-xs text-amber-800 dark:text-amber-400 flex flex-col gap-1">
          <span className="font-bold text-sm">Meta API सिंक चेतावनी:</span>
          <span>{metaError}</span>
          <span className="mt-2 text-surface-500">सुझाव: सुनिश्चित करें कि सेटिंग्स में मान्य WABA ID और Permanent Access Token सेट किया गया है। तब तक आप लोकल ड्राफ्ट्स का उपयोग कर सकते हैं।</span>
        </div>
      )}

      {templatesToShow.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-3xl bg-white dark:bg-surface-950/30 flex flex-col items-center justify-center">
          <FileText className="w-12 h-12 text-surface-300 dark:text-surface-700 mb-4 animate-pulse" />
          <h3 className="font-bold text-lg text-surface-800 dark:text-surface-200 mb-1">कोई टेम्पलेट नहीं मिला</h3>
          <p className="text-sm text-surface-500 max-w-md">इस श्रेणी में कोई सक्रिय टेम्पलेट उपलब्ध नहीं है। आप सीधे नया टेम्पलेट बना सकते हैं।</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templatesToShow.map((tmpl) => (
            <motion.div key={tmpl.id} layout className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-surface-300 dark:hover:border-surface-700 transition-all">
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-surface-900 dark:text-white font-mono text-sm truncate">{tmpl.name}</h3>
                    <p className="text-xs text-surface-400 mt-1 uppercase tracking-wider font-semibold">{tmpl.category}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    tmpl.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                    tmpl.status === 'PENDING' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                    'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                  }`}>
                    {tmpl.status}
                  </span>
                </div>

                <div className="p-4 bg-surface-50 dark:bg-surface-950 border border-surface-100 dark:border-surface-900 rounded-xl text-sm leading-relaxed text-surface-700 dark:text-surface-300 break-words min-h-[100px] whitespace-pre-wrap">
                  {formatBodyText(tmpl.body_text)}
                </div>

                <div className="flex justify-between items-center text-xs text-surface-400 font-medium">
                  <span>भाषा: <span className="font-mono text-surface-600 dark:text-surface-400">{tmpl.language}</span></span>
                  {tmpl.is_meta && <span className="text-primary-500 font-semibold flex items-center gap-1">● Meta API</span>}
                </div>
              </div>

              <div className="bg-surface-50 dark:bg-surface-950/50 border-t border-surface-100 dark:border-surface-900/50 p-4 flex gap-3">
                <button onClick={() => openSendModal(tmpl)} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                  <Send className="w-3.5 h-3.5" /> टेम्पलेट भेजें
                </button>
                {!tmpl.is_meta && (
                  <button onClick={() => handleDeleteLocalTemplate(tmpl.id)} className="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all" title="हटाएं">
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
          <div className="bg-white dark:bg-surface-900 rounded-3xl w-full max-w-lg overflow-hidden border border-surface-200 dark:border-surface-800 shadow-2xl">
            <div className="p-6 border-b border-surface-100 dark:border-surface-800 flex justify-between items-center bg-surface-50 dark:bg-surface-900">
              <div>
                <h3 className="font-bold text-lg text-surface-900 dark:text-white">नया टेम्पलेट बनाएं</h3>
                <p className="text-xs text-surface-500">टेम्पलेट सीधे Meta API पर सबमिट किया जाएगा</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded-full hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">टेम्पलेट नाम (केवल अल्फ़ान्यूमेरिक और अंडरस्कोर)</label>
                <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g. welcome_offer_new" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 font-mono" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">श्रेणी</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500">
                    <option value="UTILITY">उपयोगिता</option>
                    <option value="MARKETING">विपणन</option>
                    <option value="AUTHENTICATION">प्रमाणीकरण</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">भाषा</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 font-mono">
                    <option value="en_US">अंग्रेज़ी</option>
                    <option value="hi_IN">हिंदी</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">टेम्पलेट बॉडी टेक्स्ट</label>
                <textarea rows={4} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="नमस्ते {{1}}, आपके ऑर्डर {{2}} की पुष्टि हो गई है!" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 resize-none" required />
                <p className="text-[10px] text-surface-400 mt-1.5">पैरामीटर वेरिएबल जोड़ने के लिए {"{{1}}"}, {"{{2}}"} आदि का उपयोग करें।</p>
              </div>

              {createMessage && (
                <div className="p-3 bg-primary-50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-950/30 rounded-xl text-xs font-medium text-primary-700 dark:text-primary-400">
                  {createMessage}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={createLoading} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {createLoading ? "प्रसंस्करण हो रहा है..." : "टेम्पलेट सबमिट करें"}
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-6 rounded-xl text-sm font-medium transition-all">
                  रद्द करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND TEMPLATE MODAL */}
      {showSendModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-900 rounded-3xl w-full max-w-lg overflow-hidden border border-surface-200 dark:border-surface-800 shadow-2xl">
            <div className="p-6 border-b border-surface-100 dark:border-surface-800 flex justify-between items-center bg-surface-50 dark:bg-surface-900">
              <div>
                <h3 className="font-bold text-lg text-surface-900 dark:text-white">टेम्पलेट संदेश भेजें</h3>
                <p className="text-xs text-surface-500">टेम्पलेट: <span className="font-mono">{selectedTemplate.name}</span></p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded-full hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendTemplate} className="p-6 space-y-4">
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">प्रेषक नंबर</label>
                  <select 
                    value={chosenWaba?.id || ''} 
                    onChange={e => {
                      const selected = configs.find(c => c.id === e.target.value);
                      setChosenWaba(selected);
                    }}
                    className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 font-mono"
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
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">प्राप्तकर्ता का मोबाइल नंबर (देश कोड के साथ)</label>
                <input type="text" value={recipient} onChange={e => setRecipient(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="e.g. +919876543210" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 font-mono" required />
              </div>

              {paramValues.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">पैरामीटर मान</h4>
                  {paramValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-12 text-xs font-bold font-mono text-primary-500 text-center bg-primary-50 dark:bg-primary-950/20 py-2 rounded-lg border border-primary-100 dark:border-primary-950/30">
                        {"{{" + (idx + 1) + "}}"}
                      </span>
                      <input type="text" value={val} onChange={e => {
                        const copy = [...paramValues];
                        copy[idx] = e.target.value;
                        setParamValues(copy);
                      }} placeholder={`{{${idx+1}}} के लिए वैल्यू दर्ज करें`} className="flex-1 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary-500" required />
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-surface-50 dark:bg-surface-950 border border-surface-100 dark:border-surface-900 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-surface-400">पूर्वावलोकन:</span>
                <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-wrap">
                  {selectedTemplate.body_text.replace(/\{\{(\d+)\}\}/g, (match: string, p1: string) => {
                    const idx = parseInt(p1) - 1;
                    return paramValues[idx] || match;
                  })}
                </p>
              </div>

              {sendMessage && (
                <div className="p-3 bg-primary-50 dark:bg-primary-950/20 border border-primary-100 dark:border-primary-950/30 rounded-xl text-xs font-medium text-primary-700 dark:text-primary-400">
                  {sendMessage}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={sendLoading} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {sendLoading ? "भेजा जा रहा है..." : "टेम्पलेट भेजें"}
                </button>
                <button type="button" onClick={() => setShowSendModal(false)} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-6 rounded-xl text-sm font-medium transition-all">
                  रद्द करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

