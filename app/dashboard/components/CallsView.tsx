import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Settings, Search, Phone, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '@/components/ui/Toast';
import { formatUserDateTime } from '../lib/dates';
import { activeTab } from '../lib/types';

export function CallsView({ 
  setActiveTab, 
  setActiveCall, 
  setPreselectedChat,
}: { 
  setActiveTab: (tab: activeTab) => void, 
  setActiveCall: (call: any) => void, 
  setPreselectedChat: (chat: any) => void,
}) {
  const { toast } = useToast();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingEnabled, setCallingEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "incoming" | "outgoing" | "missed">("all");
  const [contacts, setContacts] = useState<any[]>([]);
  const [showDialer, setShowDialer] = useState(false);
  const [health, setHealth] = useState<{
    phone_numbers: any[];
    webhook_subscribed: boolean;
    turn_configured: boolean;
    all_ready: boolean;
  } | null>(null);

  const fetchCallsAndConfigs = useCallback(() => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;

    // Fetch calls
    fetch('/api/whatsapp/calls', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.calls) setCalls(data.calls);
    })
    .catch(err => console.error(err));

    // Fetch config
    fetch('/api/whatsapp/calls/config', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.calling_enabled !== undefined) {
        setCallingEnabled(data.calling_enabled);
      }
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });

    // Fetch contacts for outbound call dialer
    fetch(`/api/crm/contacts?limit=100`, {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.contacts) setContacts(data.contacts);
    })
    .catch(err => console.error(err));

    // Fetch calling readiness health from backend
    fetch('/api/whatsapp/calls/status', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.phone_numbers) {
        setHealth(data);
      }
    })
    .catch(err => console.error(err));

      }, []);

  useEffect(() => {
    fetchCallsAndConfigs();
  }, [fetchCallsAndConfigs]);

  const toggleCalling = async () => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;

    try {
      const nextVal = !callingEnabled;
      const res = await fetch('/api/whatsapp/calls/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId
        },
        body: JSON.stringify({ calling_enabled: nextVal })
      });
      const data: any = await res.json();
      if (data.success) {
        setCallingEnabled(nextVal);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const startOutgoingCall = async (contact: any) => {
    alert('WhatsApp आउटबाउंड कॉल्स अभी सपोर्ट नहीं हैं। सिर्फ इनकमिंग कॉल्स ही प्राप्त हो सकती हैं।');
  };

  const filteredCalls = calls.filter(c => {
    const matchesSearch = 
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) || 
      (c.phone || "").includes(search);
    
    if (!matchesSearch) return false;

    if (filter === "all") return true;
    if (filter === "incoming") return c.direction === "incoming";
    if (filter === "outgoing") return c.direction === "outgoing";
    if (filter === "missed") return c.status === "missed";
    return true;
  });

  const totalCalls = calls.length;
  const missedCalls = calls.filter(c => c.status === 'missed').length;
  const completedCalls = calls.filter(c => c.status === 'completed' || c.status === 'answered').length;
  const outgoingCalls = calls.filter(c => c.direction === 'outgoing').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 w-full animate-fade-in">
      {/* Top Banner & Calling Switch */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">कॉल प्रबंधन और इतिहास</h2>
          <p className="text-xs text-zinc-500 mt-1">व्हाट्सएप बिजनेस क्लाउड एपीआई के माध्यम से सभी कॉल्स को सक्षम/अक्षम करें और ट्रैक करें</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => setShowDialer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/10"
          >
            <Phone className="w-3.5 h-3.5" />
            नया कॉल डायल करें
          </button>
          
          <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-xl border border-zinc-200/50 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">कॉलिंग सेवा</span>
            <button
              onClick={toggleCalling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 outline-none ${
                callingEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-800'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  callingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${callingEnabled ? 'text-emerald-500' : 'text-zinc-400'}`}>
              {callingEnabled ? 'सक्रिय' : 'बंद'}
            </span>
          </div>
        </div>
      </div>

      {/* Calling Readiness Health */}
      {health && (
        <div className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${health.all_ready ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300'}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${health.all_ready ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            <span>
              {health.all_ready
                ? 'WhatsApp Calling तैयार है: इनकमिंग कॉल्स प्राप्त होंगी।'
                : `WhatsApp Calling सेटअप अधूरा है: webhook ${health.webhook_subscribed ? 'ठीक है' : 'गायब है'}, TURN ${health.turn_configured ? 'ठीक है' : 'गायब है'}। सेटिंग्स में जाकर जांच करें।`}
            </span>
          </div>
          <button
            onClick={() => fetchCallsAndConfigs()}
            className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-current opacity-80 hover:opacity-100"
          >
            रिफ्रेश
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">कुल कॉल्स</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">{totalCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
            <X className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">मिस्ड कॉल्स</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">{missedCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">सफल उत्तर</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">{completedCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">आउटगोइंग</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-white mt-0.5">{outgoingCalls}</p>
          </div>
        </div>
      </div>

      
      {/* Main Table Container */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {/* Filters and Search */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex bg-zinc-50 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/50 dark:border-zinc-800 w-full sm:w-auto">
            {(["all", "incoming", "outgoing", "missed"] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  filter === type 
                    ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {type === 'all' ? 'सभी' : type === 'incoming' ? 'इनकमिंग' : type === 'outgoing' ? 'आउटगोइंग' : 'मिस्ड'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="नाम या नंबर से खोजें..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:bg-white dark:focus:bg-zinc-900 focus:border-indigo-500 rounded-xl outline-none transition-all"
            />
          </div>
        </div>

        {/* Call Logs List */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs text-zinc-500">कॉल लॉग्स लोड हो रहे हैं...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="p-16 text-center">
            <Phone className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">कोई कॉल लॉग नहीं मिला</p>
            <p className="text-xs text-zinc-400 mt-1">इस फ़िल्टर के साथ कोई रिकॉर्ड नहीं है।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3">सम्पर्क</th>
                  <th className="px-6 py-3">दिशा/प्रकार</th>
                  <th className="px-6 py-3">स्थिति</th>
                  <th className="px-6 py-3">कॉल की तारीख और समय</th>
                  <th className="px-6 py-3">अवधि</th>
                  <th className="px-6 py-3 text-right">कार्रवाई</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                {filteredCalls.map((call) => {
                  const dateStr = formatUserDateTime(call.created_at, 'hi-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  });

                  return (
                    <tr key={call.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-700 dark:text-zinc-300">
                            {call.contact_name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-800 dark:text-zinc-200">{call.contact_name || 'अज्ञात संपर्क'}</p>
                            <p className="text-[10px] text-zinc-400">+{call.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {call.direction === 'incoming' ? (
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 rounded-lg text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                              इनकमिंग
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              आउटगोइंग
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize">
                            {call.type === 'voice' ? 'वॉयस कॉल' : 'वीडियो कॉल'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          call.status === 'completed' || call.status === 'answered'
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
                            : call.status === 'missed'
                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                        }`}>
                          {call.status === 'completed' || call.status === 'answered' ? 'सफल' : call.status === 'missed' ? 'छूट गया' : 'अस्वीकृत'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">{dateStr}</td>
                      <td className="px-6 py-4 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {call.status === 'missed' ? '-' : `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              fetch(`/api/inbox/conversations/initiate`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'x-workspace-id': localStorage.getItem('workspaceId') || ''
                                },
                                body: JSON.stringify({ contactId: call.contact_id, platform: 'whatsapp' })
                              })
                              .then(r => r.json())
                              .then((res: any) => {
                                if (res.conversation) {
                                  setPreselectedChat(res.conversation);
                                  setActiveTab('inbox');
                                }
                              });
                            }}
                            className="p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title="इनबॉक्स चैट खोलें"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startOutgoingCall({ id: call.contact_id, name: call.contact_name, phone: call.phone })}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                            title="कॉल बैक करें"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialer Overlay / Modal */}
      <AnimatePresence>
        {showDialer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 max-w-sm w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowDialer(false)}
                className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-zinc-950 dark:text-white">नया कॉल शुरू करें</h3>
                <p className="text-[10px] text-zinc-400 mt-1">अपने किसी भी व्हाट्सएप कांटेक्ट को डायल करें</p>
              </div>

              {/* Contact List */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {contacts.length === 0 ? (
                  <p className="text-center text-xs text-zinc-400 py-6">कोई भी व्हाट्सएप कांटेक्ट उपलब्ध नहीं है।</p>
                ) : (
                  contacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => startOutgoingCall(c)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300 shrink-0">
                        {c.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">+{c.phone || c.platform_contact_id}</p>
                      </div>
                      <Phone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

