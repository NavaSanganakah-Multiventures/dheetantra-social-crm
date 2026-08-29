import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Settings, Search, Phone, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '@/components/ui/Toast';
import { formatUserDateTime } from '../lib/dates';
import { useTwilioVoice } from './TwilioVoiceProvider';
import { usePlivoVoice } from './PlivoVoiceProvider';
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
  const twilioVoice = useTwilioVoice();
  const plivoVoice = usePlivoVoice();
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
  const [plivoConfigs, setPlivoConfigs] = useState<any[]>([]);
  const [plivoConfigsLoading, setPlivoConfigsLoading] = useState(true);
  const [plivoConfigsError, setPlivoConfigsError] = useState(false);
  const [fromNumberPicker, setFromNumberPicker] = useState<{
    contact: any;
    options: { configId: string; fromNumber: string; name: string }[];
  } | null>(null);

  const fetchCallsAndConfigs = useCallback(() => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;

    // Fetch calls
    fetch('/api/calls', {
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

    // Fetch Plivo configs so outbound calls can choose a from-number
    setPlivoConfigsLoading(true);
    setPlivoConfigsError(false);
    fetch('/api/plivo/configs', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.configs) setPlivoConfigs(data.configs);
      setPlivoConfigsLoading(false);
    })
    .catch(err => {
      console.error(err);
      setPlivoConfigsError(true);
      setPlivoConfigsLoading(false);
    });

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

  const callWithFromNumber = async (
    contact: any,
    phone: string,
    option: { configId: string; fromNumber: string; name: string }
  ) => {
    if (!plivoVoice) {
      alert('Plivo वॉयस सेवा उपलब्ध नहीं है।');
      return;
    }
    try {
      await plivoVoice.startCall(
        { id: contact?.id, name: contact?.name || phone, phone },
        { fromNumber: option.fromNumber, plivoConfigId: option.configId || undefined }
      );
    } catch (e: any) {
      alert('कॉल शुरू करने में विफल: ' + (e?.message || 'अज्ञात त्रुटि'));
    }
  };

  const startOutgoingCall = async (contact: any) => {
    const phone = ((contact?.phone || contact?.platform_contact_id) || '').replace(/[^0-9+]/g, '');
    if (!phone) {
      alert('इस कॉन्टैक्ट का फ़ोन नंबर उपलब्ध नहीं है।');
      return;
    }
    if (!plivoVoice) {
      alert('Plivo वॉयस सेवा उपलब्ध नहीं है। पहले Settings में Plivo अकाउंट जोड़ें और SIP Endpoint लिंक करें।');
      return;
    }

    if (plivoConfigsLoading) {
      alert('Plivo कॉन्फ़िगरेशन लोड हो रहा है। एक पल रुककर दोबारा कोशिश करें।');
      return;
    }
    if (plivoConfigsError) {
      alert('Plivo कॉन्फ़िगरेशन लोड नहीं हो सका। नेटवर्क जाँचें और दोबारा कोशिश करें।');
      return;
    }

    // Gather active Plivo from-numbers so the user can choose which caller ID
    // to dial from (when more than one is configured).
    const options: { configId: string; fromNumber: string; name: string }[] = [];
    for (const cfg of plivoConfigs) {
      const configId = cfg?.id ? String(cfg.id) : '';
      const configName = cfg?.name ? String(cfg.name) : 'Plivo';
      const fromNumbers = Array.isArray(cfg?.fromNumbers) ? cfg.fromNumbers : [];
      for (const fn of fromNumbers) {
        const fromNumber = fn?.fromNumber ? String(fn.fromNumber) : '';
        if (!fromNumber) continue;
        if (fn?.isActive === false) continue;
        options.push({ configId, fromNumber, name: configName });
      }
    }

    if (options.length === 0) {
      alert('Plivo के लिए कोई सक्रिय from-number नहीं है। पहले Settings में Plivo नंबर जोड़ें।');
      return;
    }
    if (options.length === 1) {
      await callWithFromNumber(contact, phone, options[0]);
      return;
    }
    setFromNumberPicker({ contact, options });
  };

  const filteredCalls = calls.filter(c => {
    const matchesSearch = 
      (c.contact_name || "").toLowerCase().includes(search.toLowerCase()) || 
      (c.phone || "").includes(search);
    
    if (!matchesSearch) return false;

    if (filter === "all") return true;
    if (filter === "incoming") return c.direction === "incoming";
    if (filter === "outgoing") return c.direction === "outgoing";
    if (filter === "missed") return missedStatuses.includes(c.status);
    return true;
  });

  const completedStatuses = ['completed', 'answered', 'ended'];
  const missedStatuses = ['missed', 'no_answer', 'busy', 'failed', 'canceled'];

  function callStatusInfo(status: string) {
    switch (status) {
      case 'completed': case 'answered': case 'ended':
        return { label: 'सफल', cls: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' };
      case 'in_progress':
        return { label: 'चालू', cls: 'bg-sky-50 dark:bg-sky-950/20 text-sky-600' };
      case 'ringing': case 'queued':
        return { label: 'बज रहा है', cls: 'bg-amber-50 dark:bg-amber-950/20 text-amber-600' };
      case 'missed':
        return { label: 'छूट गया', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      case 'no_answer':
        return { label: 'कोई जवाब नहीं', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      case 'busy':
        return { label: 'व्यस्त', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      case 'failed':
        return { label: 'विफल', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      case 'canceled':
        return { label: 'रद्द', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      case 'declined':
        return { label: 'अस्वीकृत', cls: 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' };
      default:
        return { label: 'अस्वीकृत', cls: 'bg-surface-100 dark:bg-surface-800 text-surface-500' };
    }
  }
  const totalCalls = calls.length;
  const missedCalls = calls.filter(c => missedStatuses.includes(c.status)).length;
  const completedCalls = calls.filter(c => completedStatuses.includes(c.status)).length;
  const outgoingCalls = calls.filter(c => c.direction === 'outgoing').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 w-full animate-fade-in">
      {/* Top Banner & Calling Switch */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-surface-900 p-6 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-surface-900 dark:text-white font-display">à¤à¥à¤² à¤ªà¥à¤°à¤¬à¤à¤§à¤¨ à¤à¤° à¤à¤¤à¤¿à¤¹à¤¾à¤¸</h2>
          <p className="text-xs text-surface-500 mt-1">Plivo और WhatsApp के सभी कॉल्स को ट्रैक करें और Plivo सॉफ्टफोन से नए कॉल डायल करें</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => setShowDialer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-primary-500/10"
          >
            <Phone className="w-3.5 h-3.5" />
            à¤¨à¤¯à¤¾ à¤à¥à¤² à¤¡à¤¾à¤¯à¤² à¤à¤°à¥à¤
          </button>
          
          <div className="flex items-center gap-3 bg-surface-50 dark:bg-surface-950 p-2 rounded-xl border border-surface-200/50 dark:border-surface-800">
            <span className="text-xs font-semibold text-surface-600 dark:text-surface-400">à¤à¥à¤²à¤¿à¤à¤ à¤¸à¥à¤µà¤¾</span>
            <button
              onClick={toggleCalling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 outline-none ${
                callingEnabled ? 'bg-emerald-500' : 'bg-surface-300 dark:bg-surface-800'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  callingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${callingEnabled ? 'text-emerald-500' : 'text-surface-400'}`}>
              {callingEnabled ? 'à¤¸à¤à¥à¤°à¤¿à¤¯' : 'à¤¬à¤à¤¦'}
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
                ? 'WhatsApp Calling à¤¤à¥à¤¯à¤¾à¤° à¤¹à¥: à¤à¤¨à¤à¤®à¤¿à¤à¤ à¤à¥à¤²à¥à¤¸ à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤ à¤¹à¥à¤à¤à¥à¥¤'
                : `WhatsApp Calling à¤¸à¥à¤à¤à¤ª à¤à¤§à¥à¤°à¤¾ à¤¹à¥: webhook ${health.webhook_subscribed ? 'à¤ à¥à¤ à¤¹à¥' : 'à¤à¤¾à¤¯à¤¬ à¤¹à¥'}, TURN ${health.turn_configured ? 'à¤ à¥à¤ à¤¹à¥' : 'à¤à¤¾à¤¯à¤¬ à¤¹à¥'}à¥¤ à¤¸à¥à¤à¤¿à¤à¤à¥à¤¸ à¤®à¥à¤ à¤à¤¾à¤à¤° à¤à¤¾à¤à¤ à¤à¤°à¥à¤à¥¤`}
            </span>
          </div>
          <button
            onClick={() => fetchCallsAndConfigs()}
            className="px-2 py-1 rounded-md bg-white dark:bg-surface-900 border border-current opacity-80 hover:opacity-100"
          >
            à¤°à¤¿à¤«à¥à¤°à¥à¤¶
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-surface-900 p-4 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-xl">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase font-bold tracking-wider">à¤à¥à¤² à¤à¥à¤²à¥à¤¸</p>
            <p className="text-xl font-bold text-surface-900 dark:text-white mt-0.5">{totalCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-900 p-4 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
            <X className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase font-bold tracking-wider">à¤®à¤¿à¤¸à¥à¤¡ à¤à¥à¤²à¥à¤¸</p>
            <p className="text-xl font-bold text-surface-900 dark:text-white mt-0.5">{missedCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-900 p-4 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase font-bold tracking-wider">à¤¸à¤«à¤² à¤à¤¤à¥à¤¤à¤°</p>
            <p className="text-xl font-bold text-surface-900 dark:text-white mt-0.5">{completedCalls}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-surface-900 p-4 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase font-bold tracking-wider">à¤à¤à¤à¤à¥à¤à¤à¤</p>
            <p className="text-xl font-bold text-surface-900 dark:text-white mt-0.5">{outgoingCalls}</p>
          </div>
        </div>
      </div>

      
      {/* Main Table Container */}
      <div className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm overflow-hidden">
        {/* Filters and Search */}
        <div className="p-4 border-b border-surface-200 dark:border-surface-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex bg-surface-50 dark:bg-surface-950 p-1 rounded-xl border border-surface-200/50 dark:border-surface-800 w-full sm:w-auto">
            {(["all", "incoming", "outgoing", "missed"] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  filter === type 
                    ? 'bg-white dark:bg-surface-800 text-primary-600 dark:text-primary-400 shadow-sm border border-surface-200/50 dark:border-surface-700/50' 
                    : 'text-surface-500 hover:text-surface-900 dark:hover:text-white'
                }`}
              >
                {type === 'all' ? 'à¤¸à¤­à¥' : type === 'incoming' ? 'à¤à¤¨à¤à¤®à¤¿à¤à¤' : type === 'outgoing' ? 'à¤à¤à¤à¤à¥à¤à¤à¤' : 'à¤®à¤¿à¤¸à¥à¤¡'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="à¤¨à¤¾à¤® à¤¯à¤¾ à¤¨à¤à¤¬à¤° à¤¸à¥ à¤à¥à¤à¥à¤..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 focus:bg-white dark:focus:bg-surface-900 focus:border-primary-500 rounded-xl outline-none transition-all"
            />
          </div>
        </div>

        {/* Call Logs List */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs text-surface-500">à¤à¥à¤² à¤²à¥à¤à¥à¤¸ à¤²à¥à¤¡ à¤¹à¥ à¤°à¤¹à¥ à¤¹à¥à¤...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="p-16 text-center">
            <Phone className="w-10 h-10 text-surface-300 dark:text-surface-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-surface-700 dark:text-surface-300">à¤à¥à¤ à¤à¥à¤² à¤²à¥à¤ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾</p>
            <p className="text-xs text-surface-400 mt-1">à¤à¤¸ à¤«à¤¼à¤¿à¤²à¥à¤à¤° à¤à¥ à¤¸à¤¾à¤¥ à¤à¥à¤ à¤°à¤¿à¤à¥à¤°à¥à¤¡ à¤¨à¤¹à¥à¤ à¤¹à¥à¥¤</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-50 dark:bg-surface-950 text-[10px] font-bold text-surface-500 uppercase tracking-wider border-b border-surface-200 dark:border-surface-800">
                  <th className="px-6 py-3">à¤¸à¤®à¥à¤ªà¤°à¥à¤</th>
                  <th className="px-6 py-3">à¤¦à¤¿à¤¶à¤¾/à¤ªà¥à¤°à¤à¤¾à¤°</th>
                  <th className="px-6 py-3">à¤¸à¥à¤¥à¤¿à¤¤à¤¿</th>
                  <th className="px-6 py-3">à¤à¥à¤² à¤à¥ à¤¤à¤¾à¤°à¥à¤ à¤à¤° à¤¸à¤®à¤¯</th>
                  <th className="px-6 py-3">à¤à¤µà¤§à¤¿</th>
                  <th className="px-6 py-3 text-right">à¤à¤¾à¤°à¥à¤°à¤µà¤¾à¤</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-surface-800 text-xs">
                {filteredCalls.map((call) => {
                  const dateStr = formatUserDateTime(call.created_at, 'hi-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  });

                  return (
                    <tr key={call.id} className="hover:bg-surface-50/50 dark:hover:bg-surface-950/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center font-bold text-surface-700 dark:text-surface-300">
                            {call.contact_name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-surface-800 dark:text-surface-200">{call.contact_name || 'à¤à¤à¥à¤à¤¾à¤¤ à¤¸à¤à¤ªà¤°à¥à¤'}</p>
                            <p className="text-[10px] text-surface-400">+{call.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {call.direction === 'incoming' ? (
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 rounded-lg text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                              à¤à¤¨à¤à¤®à¤¿à¤à¤
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              à¤à¤à¤à¤à¥à¤à¤à¤
                            </span>
                          )}
                          <span className="text-[10px] text-surface-500 dark:text-surface-400 capitalize">
                            {call.type === 'voice' ? 'à¤µà¥à¤¯à¤¸ à¤à¥à¤²' : 'à¤µà¥à¤¡à¤¿à¤¯à¥ à¤à¥à¤²'}
                          </span>
                          {call.source && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-500 font-bold uppercase">
                              {call.source}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${callStatusInfo(call.status).cls}`}>
                          {callStatusInfo(call.status).label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-surface-500 dark:text-surface-400">{dateStr}</td>
                      <td className="px-6 py-4 font-mono text-[11px] text-surface-600 dark:text-surface-400">
                        {completedStatuses.includes(call.status) ? `${Math.floor((call.duration || 0) / 60)}m ${(call.duration || 0) % 60}s` : '-'}
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
                            className="p-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
                            title="à¤à¤¨à¤¬à¥à¤à¥à¤¸ à¤à¥à¤ à¤à¥à¤²à¥à¤"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startOutgoingCall({ id: call.contact_id, name: call.contact_name, phone: call.phone })}
                            className="p-1.5 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg transition-colors"
                            title="à¤à¥à¤² à¤¬à¥à¤ à¤à¤°à¥à¤"
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
              className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 max-w-sm w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowDialer(false)}
                className="absolute top-4 right-4 p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-white rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-surface-950 dark:text-white">à¤¨à¤¯à¤¾ à¤à¥à¤² à¤¶à¥à¤°à¥ à¤à¤°à¥à¤</h3>
                <p className="text-[10px] text-surface-400 mt-1">किसी भी कॉन्टैक्ट को Plivo सॉफ्टफोन से डायल करें</p>
              </div>

              {/* Contact List */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {contacts.length === 0 ? (
                  <p className="text-center text-xs text-surface-400 py-6">à¤à¥à¤ à¤­à¥ à¤µà¥à¤¹à¤¾à¤à¥à¤¸à¤à¤ª à¤à¤¾à¤à¤à¥à¤à¥à¤ à¤à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥à¤ à¤¹à¥à¥¤</p>
                ) : (
                  contacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => startOutgoingCall(c)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-surface-100 dark:border-surface-800/50 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center font-bold text-xs text-surface-700 dark:text-surface-300 shrink-0">
                        {c.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-surface-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-[10px] text-surface-400 font-mono">+{c.phone || c.platform_contact_id}</p>
                      </div>
                      <Phone className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* From-number chooser modal */}
      <AnimatePresence>
        {fromNumberPicker && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-surface-900 rounded-2xl border border-surface-200 dark:border-surface-800 max-w-sm w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setFromNumberPicker(null)}
                className="absolute top-4 right-4 p-1.5 text-surface-400 hover:text-surface-600 dark:hover:text-white rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-surface-950 dark:text-white">किस नंबर से कॉल करें?</h3>
                <p className="text-[10px] text-surface-400 mt-1">अपनी Plivo caller ID चुनें</p>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {fromNumberPicker.options.map(o => (
                  <button
                    key={o.configId + ':' + o.fromNumber}
                    onClick={() => {
                      const pick = fromNumberPicker;
                      setFromNumberPicker(null);
                      const phone = ((pick.contact?.phone || pick.contact?.platform_contact_id) || '').replace(/[^0-9+]/g, '');
                      callWithFromNumber(pick.contact, phone, o);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-surface-100 dark:border-surface-800/50 hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-surface-900 dark:text-white truncate">{o.fromNumber}</p>
                      <p className="text-[10px] text-surface-400 truncate">{o.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

