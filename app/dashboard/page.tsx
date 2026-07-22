"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download,  Upload, Bot, MessageSquare, MessageCircle, Megaphone, CalendarClock, Settings, LayoutDashboard, Search, Bell, Menu, Send, Paperclip, LogOut, User, Blocks, AlertCircle, Phone, PhoneCall, X, History, MapPin, Building2, Tag, ChevronDown, ChevronRight, Activity, Users, Zap, Check, CheckCheck, FileText, Plus, Trash2, Edit, Archive, RefreshCw, Instagram, Facebook, Mail, TrendingUp, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { useWhatsAppWebRTC } from '@/lib/hooks/useWhatsAppWebRTC';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import GeminiVoiceBridge from "@/app/components/GeminiVoiceBridge";
import ActiveConversationsView from '@/components/ActiveConversationsView';
import { useToast } from '@/components/ui/Toast';
type activeTab = 'dashboard' | 'inbox' | 'active-conversations' | 'broadcast' | 'templates' | 'schedule' | 'settings' | 'contacts' | 'calls' | 'integrations' | 'accounts-whatsapp';

const getUserTimezone = () => {
  if (typeof window === 'undefined') return 'Asia/Kolkata';
  return localStorage.getItem('userTimezone')
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'Asia/Kolkata';
};

const ensureUTC = (dateStr: string | Date | number) => {
  if (typeof dateStr === 'string') {
    // Already has timezone info
    if (dateStr.endsWith('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    // SQLite format: "2024-01-01 12:00:00" or with milliseconds
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
      const d = new Date(dateStr.replace(' ', 'T') + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
    // ISO-like but missing Z: "2024-01-01T12:00:00"
    if (dateStr.includes('T')) {
      const d = new Date(dateStr + 'Z');
      return isNaN(d.getTime()) ? new Date() : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

export const formatUserTimeOnly = (dateStr: string | Date | number, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleTimeString([], { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}

export const formatUserDateOnly = (dateStr: string | Date | number, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleDateString([], { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}

export const formatUserDateTime = (dateStr: string | Date | number, locales?: string | string[], options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  try {
    return ensureUTC(dateStr).toLocaleString(locales || 'hi-IN', { timeZone: getUserTimezone(), ...options });
  } catch(e) { return ''; }
}

export default function DashboardWrapper() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: any) => {
         if (data.user) {
             setUser(data.user);
             localStorage.setItem('userTimezone', data.user.timezone || 'Asia/Kolkata');
         } else {
             router.push('/login');
         }
         setLoading(false);
      })
      .catch(() => {
          setLoading(false);
          router.push('/login');
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Dashboard user={user} onLogout={() => { setUser(null); router.push('/login'); }} />;
}

function Dashboard({ user, onLogout }: { user: any, onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<activeTab>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [openConversationsCount, setOpenConversationsCount] = useState<number>(0);
  const [preselectedChat, setPreselectedChat] = useState<any>(null);

  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [incomingCallNoSdp, setIncomingCallNoSdp] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [callingEnabled, setCallingEnabled] = useState<boolean>(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [callsFieldStatus, setCallsFieldStatus] = useState<'checking' | 'subscribed' | 'not_subscribed' | 'unknown'>('unknown');

  const { status: rtcStatus, answer: answerWebRTC, hangup: hangupWebRTC, handleRemoteHangup, remoteStream: rtcRemoteStream, localStream: rtcLocalStream } = useWhatsAppWebRTC();

  // Load Calling Config
  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;
    
    // Load general calling enabled setting
    fetch('/api/whatsapp/calls/config', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.calling_enabled !== undefined) {
        setCallingEnabled(data.calling_enabled);
      }
    })
    .catch(err => console.error("Error loading calling config:", err));

    // Check if 'calls' field is subscribed in Meta webhook
    fetch('/api/whatsapp/calls/status', {
      headers: { 'x-workspace-id': wId }
    })
    .then(r => r.json())
    .then((data: any) => {
      if (data.webhook_subscribed === true) {
        setCallsFieldStatus('subscribed');
      } else if (data.webhook_subscribed === false) {
        setCallsFieldStatus('not_subscribed');
      } else {
        setCallsFieldStatus('unknown');
      }
    })
    .catch(() => setCallsFieldStatus('unknown'));

    // No SIP config to load anymore
  }, []);

  // Update activeCall state based on WebRTC status
  useEffect(() => {
    if (rtcStatus === 'connecting' || rtcStatus === 'connected') {
      // Handled by initiation logic
    } else if (rtcStatus === 'ended' || rtcStatus === 'idle') {
      Promise.resolve().then(() => {
        setActiveCall(null);
        setIncomingCall(null);
        setIncomingCallNoSdp(null);
      });
    }
  }, [rtcStatus]);



  // Call timeout ref for auto-dismiss after 30s
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss incoming call after 30 seconds (Meta timeout)
  useEffect(() => {
    if (incomingCall && incomingCall.status === 'ringing') {
      callTimeoutRef.current = setTimeout(async () => {
        const wId = localStorage.getItem('workspaceId');
        if (wId && incomingCall.phoneNumberId) {
          try {
            await fetch(`/api/whatsapp/calls/${incomingCall.id}/reject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
              body: JSON.stringify({ phoneNumberId: incomingCall.phoneNumberId })
            });
          } catch(e) {}
          await fetch(`/api/whatsapp/calls/${incomingCall.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
            body: JSON.stringify({ status: 'missed', duration: 0 })
          }).catch(() => {});
        }
        setIncomingCall(null);
      }, 30000);
    }
    return () => {
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    };
  }, [incomingCall?.id, incomingCall?.status]);

  // Auto-dismiss missed call notification after 8 seconds safely
  useEffect(() => {
    if (incomingCallNoSdp) {
      const timer = setTimeout(() => {
        setIncomingCallNoSdp(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [incomingCallNoSdp?.id]);

  // Global WebSocket listener for real-time incoming call alerts
  const incomingCallRef = useRef(incomingCall);
  const activeCallRef = useRef(activeCall);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
    activeCallRef.current = activeCall;
  }, [incomingCall, activeCall]);

  // Play ringtone instantly and robustly
  useEffect(() => {
    let interval: any;
    let audioCtx: any = null;
    if (incomingCall && incomingCall.status === 'ringing') {
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const playRing = () => {
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 1.2);
        };
        playRing();
        interval = setInterval(playRing, 2000);
      } catch (e) {
        console.error("Audio playback error", e);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [incomingCall?.status]);

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    if (!wId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/global-${wId}`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let active = true;

    function connectGlobalWs() {
      if (!active) return;
      try {
        setWsStatus('connecting');
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('[WS] Global WebSocket connected');
          setWsStatus('connected');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'whatsapp_incoming_call') {
              // Calls field handler — has SDP, user can answer
              setIncomingCall({
                id: data.callId,
                from: data.from,
                contact_name: '+' + data.from,
                phone: data.from,
                status: 'ringing',
                direction: 'incoming',
                sdp: data.sdp,
                phoneNumberId: data.phoneNumberId,
                workspace_id: user?.workspace_id || localStorage.getItem('workspaceId')
              });
              // Clear any no-sdp notification
              setIncomingCallNoSdp(null);
              // Ringtone is now handled by the useEffect watching incomingCall.status
            } else if (data.type === 'incoming_call' && data.call) {
              // System message fallback — NO SDP, show as missed call notification
              setIncomingCallNoSdp({
                id: data.call.id,
                contact_name: data.call.contact_name,
                phone: data.call.phone,
                phoneNumberId: data.call.phoneNumberId,
                workspace_id: data.call.workspace_id,
                created_at: data.call.created_at
              });
              // Auto-dismiss after 8 seconds
              // Auto-dismiss is handled by a dedicated useEffect hook
            } else if (data.type === 'call_status_updated' || data.type === 'whatsapp_call_terminated') {
              const callIdToUpdate = data.call_id || data.callId;
              const newStatus = data.status || 'ended';
              
              if (data.type === 'whatsapp_call_terminated') {
                 handleRemoteHangup();
                 // Instant cut
                 if (incomingCallNoSdp && incomingCallNoSdp.id === callIdToUpdate) {
                   setIncomingCallNoSdp(null);
                 }
                 if (incomingCallRef.current && incomingCallRef.current.id === callIdToUpdate) {
                   setIncomingCall(null);
                 }
                 if (activeCallRef.current && activeCallRef.current.id === callIdToUpdate) {
                   setActiveCall(null);
                 }
              } else {
                 if (incomingCallNoSdp && incomingCallNoSdp.id === callIdToUpdate) {
                   setIncomingCallNoSdp(null);
                 }
                 if (incomingCallRef.current && incomingCallRef.current.id === callIdToUpdate) {
                   setIncomingCall((prev: any) => prev ? { ...prev, status: newStatus } : null);
                 }
                 if (activeCallRef.current && activeCallRef.current.id === callIdToUpdate) {
                   setActiveCall((prev: any) => prev ? { ...prev, status: newStatus, duration: data.duration } : null);
                 }
              }
            }
          } catch (e) {
            console.error("Error handling global WS message:", e);
          }
        };

        socket.onclose = () => {
          setWsStatus('disconnected');
          if (active) reconnectTimeout = setTimeout(connectGlobalWs, 3000);
        };

        socket.onerror = (err) => {
          console.error('[WS] Global WebSocket error:', err);
          setWsStatus('disconnected');
          if (socket) socket.close();
        };
      } catch (err) {
        console.error("Global WS connection error:", err);
        if (active) reconnectTimeout = setTimeout(connectGlobalWs, 3000);
      }
    }

    connectGlobalWs();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, [user?.workspace_id]);

  useEffect(() => {
    const checkScreenSize = () => {
      setSidebarOpen(window.innerWidth >= 768);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    const fetchStats = () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      fetch('/api/workspace', {
        headers: { 'x-workspace-id': wId }
      })
      .then(r => r.json())
      .then((data: any) => {
        if (data.stats) {
          setOpenConversationsCount(data.stats.openConversations || 0);
        }
      })
      .catch(err => console.error("Error fetching stats for badge:", err));
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false); }}
            className="fixed inset-0 bg-black/50 z-20 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -280, width: 0, opacity: 0 }}
            animate={{ x: 0, width: 280, opacity: 1 }}
            exit={{ x: -280, width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="fixed md:static inset-y-0 left-0 flex-shrink-0 bg-zinc-950 dark:bg-zinc-900 border-r border-zinc-800 flex flex-col text-zinc-300 z-30 shadow-2xl md:shadow-none"
          >
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight font-display text-white">DheeTantra</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 -mr-2 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-3">ओवरव्यू</div>
              <NavItem icon={<LayoutDashboard />} label="डैशबोर्ड" isActive={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<MessageSquare />} label="इनबॉक्स" isActive={activeTab === 'inbox'} onClick={() => { setActiveTab('inbox'); if (window.innerWidth < 768) setSidebarOpen(false); }} badge={openConversationsCount > 0 ? openConversationsCount.toString() : undefined} />
              <NavItem icon={<Activity />} label="सक्रिय चैट" isActive={activeTab === 'active-conversations'} onClick={() => { setActiveTab('active-conversations'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<Users />} label="संपर्क और लीड्स" isActive={activeTab === 'contacts'} onClick={() => { setActiveTab('contacts'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<Phone />} label="कॉल लॉग्स" isActive={activeTab === 'calls'} onClick={() => { setActiveTab('calls'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">अकाउंट्स (Accounts)</div>
              <NavItem icon={<Phone />} label="WhatsApp" isActive={activeTab === 'accounts-whatsapp'} onClick={() => { setActiveTab('accounts-whatsapp'); if (window.innerWidth < 768) setSidebarOpen(false); }} />

              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">मार्केटिंग</div>
              <NavItem icon={<Megaphone />} label="ब्रॉडकास्ट" isActive={activeTab === 'broadcast'} onClick={() => { setActiveTab('broadcast'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<CalendarClock />} label="शेड्यूल्ड पोस्ट्स" isActive={activeTab === 'schedule'} onClick={() => { setActiveTab('schedule'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
            </nav>

            <div className="p-4 bg-zinc-900/50 dark:bg-zinc-950/50 mt-auto border-t border-zinc-800">
              <NavItem icon={<Blocks />} label="इंटीग्रेशन्स (Integrations)" isActive={activeTab === 'integrations'} onClick={() => { setActiveTab('integrations'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<Settings />} label="सेटिंग्स" isActive={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              
              <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-3 px-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg shrink-0">
                  {user?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name || "उपयोगकर्ता"}</p>
                  <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                </div>
                <button onClick={onLogout} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white shrink-0" title="लॉगआउट">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold capitalize text-zinc-900 dark:text-white font-display">
              {activeTab === 'dashboard' ? 'डैशबोर्ड' : activeTab === 'inbox' ? 'इनबॉक्स' : activeTab === 'active-conversations' ? 'सक्रिय बातचीत' : activeTab === 'broadcast' ? 'ब्रॉडकास्ट' : activeTab === 'schedule' ? 'शेड्यूलर' : activeTab === 'contacts' ? 'संपर्क और लीड्स' : activeTab === 'accounts-whatsapp' ? 'WhatsApp अकाउंट्स' : activeTab === 'calls' ? 'कॉल लॉग्स' : 'सेटिंग्स'}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="text" 
                placeholder="खोजें..." 
                className="pl-9 pr-4 py-2 w-64 text-sm bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:bg-white dark:focus:bg-zinc-950 focus:border-indigo-500 rounded-full outline-none transition-all shadow-sm"
              />
            </div>
            {/* WebSocket Connection Status */}
            <div className="flex items-center gap-1.5 text-[10px] font-medium" title={wsStatus === 'connecting' ? 'WebSocket कनेक्ट हो रहा है...' : wsStatus === 'connected' ? 'WebSocket कनेक्टेड' : 'WebSocket डिस्कनेक्टेड - कॉल नहीं आएंगी'}>
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-400' : wsStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span className="text-zinc-400 hidden sm:inline">
                {wsStatus === 'connecting' ? 'Connecting...' : wsStatus === 'connected' ? 'Live' : 'Offline'}
              </span>
            </div>
            <button className="p-2 relative rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-zinc-950"></span>
            </button>
          </div>
        </header>

        {/* Dynamic View Area */}
        <main className={`flex-1 relative bg-zinc-50 dark:bg-zinc-950/50 ${activeTab === 'inbox' ? 'h-[calc(100vh-4rem)] overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col ${activeTab === 'inbox' ? 'h-full overflow-hidden flex-1' : 'min-h-full'}`}
            >
              {activeTab === 'dashboard' && <DashboardOverview />}
              {activeTab === 'inbox' && (
                <InboxView 
                  preselectedChat={preselectedChat} 
                  setPreselectedChat={setPreselectedChat} 
                  onInitiateCall={(contact: any) => {
                    alert('WhatsApp Outbound calls abhi supported nahi hain. Sirf incoming calls receive ho sakti hain.');
                  }}
                />
              )}
              {activeTab === 'active-conversations' && (
                <ActiveConversationsView 
                  setActiveTab={setActiveTab} 
                  setPreselectedChat={setPreselectedChat} 
                />
              )}
              {activeTab === 'broadcast' && <BroadcastView />}
              {activeTab === 'accounts-whatsapp' && <WhatsAppManagerView />}
              {activeTab === 'schedule' && <ScheduleView />}
              {activeTab === 'integrations' && <IntegrationsView />}
              {activeTab === 'settings' && <SettingsView />}
              {activeTab === 'contacts' && <ContactsView setActiveTab={setActiveTab} setActiveChat={setPreselectedChat} />}
              {activeTab === 'calls' && (
                <CallsView 
                  setActiveTab={setActiveTab} 
                  setActiveCall={setActiveCall} 
                  setPreselectedChat={setPreselectedChat} 
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Gemini Voice Agent Bridge (Client-side connection via Secure Proxy) */}
        {typeof window !== 'undefined' && localStorage.getItem('workspaceId') && (
          <GeminiVoiceBridge workspaceId={localStorage.getItem('workspaceId') as string} />
        )}

      </div>

      {/* Floating Calling Overlays */}
      <AnimatePresence>
        {/* 1. Incoming Call Alert */}
        {incomingCall && incomingCall.status === 'ringing' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-sm w-full p-8 text-center text-white shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none"></div>

              <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20 animate-ping"></span>
                <span className="absolute inline-flex h-20 w-20 rounded-full bg-indigo-500 opacity-15 animate-pulse"></span>
                <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold shadow-lg shadow-indigo-500/30">
                  {incomingCall.contact_name?.[0] || '?'}
                </div>
              </div>

              <div className="flex flex-col items-center mb-3 gap-2">
                <span className="inline-block px-3 py-1 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full">
                  इनकमिंग कॉल (Incoming Call)
                </span>
                <span className="inline-block px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-semibold rounded-md border border-amber-500/20">
                  ⚠️ कृपया 30 सेकंड के अंदर जवाब दें
                </span>
              </div>

              <h3 className="text-xl font-bold font-display tracking-tight text-white truncate">{incomingCall.contact_name || 'अज्ञात'}</h3>
              <p className="text-xs text-zinc-400 font-mono mt-1">+{incomingCall.phone}</p>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={async () => {
                    if (!incomingCall) return;
                    try {
                      // Meta API reject (stops ringing on caller's side)
                      if (incomingCall.phoneNumberId) {
                        await fetch(`/api/whatsapp/calls/${incomingCall.id}/reject`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-workspace-id': incomingCall.workspace_id
                          },
                          body: JSON.stringify({ phoneNumberId: incomingCall.phoneNumberId })
                        });
                      }
                      // Local DB status update
                      await fetch(`/api/whatsapp/calls/${incomingCall.id}/status`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-workspace-id': incomingCall.workspace_id
                        },
                        body: JSON.stringify({ status: 'declined' })
                      });
                    } catch(e) {}
                    setIncomingCall(null);
                  }}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  काटें (Decline)
                </button>

                <button
                  onClick={async () => {
                    try {
                      if (!incomingCall.sdp) {
                        alert('SDP डेटा उपलब्ध नहीं है। कृपया WhatsApp Cloud API की Calling Webhook सेटिंग जांचें और सुनिश्चित करें कि "calls" field subscribed है।');
                        setIncomingCall(null);
                        return;
                      }
                      await answerWebRTC({
                        id: incomingCall.id,
                        from: incomingCall.from || incomingCall.phone,
                        sdp: incomingCall.sdp,
                        phoneNumberId: incomingCall.phoneNumberId,
                        workspace_id: incomingCall.workspace_id
                      });
                      try {
                        await fetch(`/api/whatsapp/calls/${incomingCall.id}/status`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-workspace-id': incomingCall.workspace_id
                          },
                          body: JSON.stringify({ status: 'connected' })
                        });
                      } catch(e) {}
                      setActiveCall({
                        ...incomingCall,
                        status: 'connected',
                        connectedAt: Date.now()
                      });
                      setIncomingCall(null);
                    } catch(e) {
                      console.error("WebRTC answer failed", e);
                      alert('कॉल उत्तर देने में विफल: ' + (e instanceof Error ? e.message : 'अज्ञात त्रुटि'));
                    }
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  उठाएं (Accept)
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 2. Active/Outgoing Call Widget */}
        {activeCall && (
          <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:w-80 z-50">
            <motion.div
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 shadow-2xl w-full text-white flex flex-col relative overflow-hidden backdrop-blur-xl animate-slide-up"
            >
              <ActiveCallManager 
                activeCall={activeCall} 
                setActiveCall={setActiveCall} 
                remoteStream={rtcRemoteStream}
                localStream={rtcLocalStream}
                onHangup={async () => {
                   await hangupWebRTC({
                     id: activeCall.id,
                     from: activeCall.from || activeCall.phone,
                     sdp: activeCall.sdp,
                     phoneNumberId: activeCall.phoneNumberId,
                     workspace_id: activeCall.workspace_id
                   });
                   setActiveCall(null);
                }}
               />
            </motion.div>
          </div>
        )}

        {/* 3. Missed Call Toast (from system_call without SDP) */}
        {incomingCallNoSdp && (
          <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50">
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-2xl text-white flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white">मिस्ड कॉल (Missed Call)</h4>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">
                  {incomingCallNoSdp.contact_name || 'अज्ञात'} ({incomingCallNoSdp.phone || 'unknown'})
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    {callsFieldStatus === 'not_subscribed'
                      ? '⚠️ WhatsApp Cloud API में "calls" field subscribe नहीं है — कॉल कनेक्ट नहीं हो सकती'
                      : '⚡ WebRTC SDP उपलब्ध नहीं — केवल Missed Call ही दिखाया जा सकता है'}
                  </span>
                </div>
              </div>
              <button onClick={() => setIncomingCallNoSdp(null)} className="text-zinc-500 hover:text-white flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick, badge }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, badge?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive 
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`}>
          {icon}
        </span>
        {label}
      </div>
      {badge && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white text-indigo-600' : 'bg-zinc-800 text-zinc-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function DashboardOverview() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/workspace', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      setStats(data.stats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">डैशबोर्ड लोड हो रहा है...</div>;
  }

  return (
    <div className="p-6 md:p-10 w-full max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">आपका स्वागत है!</h2>
        <p className="text-zinc-500 dark:text-zinc-400">यहाँ आपके वर्कस्पेस का अवलोकन है।</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="कुल संपर्क (Contacts)" value={stats?.totalContacts?.toString() || "0"} trend="+12% पिछले सप्ताह से" icon={<Users />} />
        <StatCard title="खुली बातचीत" value={stats?.openConversations?.toString() || "0"} trend="सक्रिय कनेक्शन" icon={<Activity />} />
        <StatCard title="ब्रॉडकास्ट भेजे गए" value={stats?.broadcastsSent?.toString() || "0"} trend="+5% पिछले महीने से" icon={<Zap />} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">हाल की बातचीत</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">सभी देखें</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">कोई सक्रिय बातचीत नहीं मिली।</p>
              <p className="text-xs text-zinc-500 mt-1">अपना API सिंक करें या संदेश प्राप्त करें।</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white font-display">आगामी पोस्ट्स</h3>
            <button className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:underline">शेड्यूल करें</button>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
              <CalendarClock className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">कोई पोस्ट शेड्यूल नहीं है।</p>
              <p className="text-xs text-zinc-500 mt-1">शेड्यूलिंग टैब पर जाकर नई पोस्ट बनाएँ।</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, icon }: { title: string, value: string, trend: string, icon?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:border-indigo-500/30 transition-all group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{title}</h3>
        {icon && <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">{value}</span>
      </div>
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 font-medium bg-emerald-50 dark:bg-emerald-500/10 inline-block px-2 py-1 rounded-md">{trend}</p>
    </div>
  );
}

function InboxView({
  preselectedChat,
  setPreselectedChat,
  onInitiateCall
}: {
  preselectedChat?: any,
  setPreselectedChat?: (chat: any) => void,
  onInitiateCall?: (contact: any) => void
}) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<any>(preselectedChat || null);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'open' | 'closed'>('open');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const lastCustomerMessageAt = activeChat?.customer_last_message_at ? ensureUTC(activeChat.customer_last_message_at) : null;
  const isExpired = lastCustomerMessageAt ? (currentTime.getTime() - lastCustomerMessageAt.getTime() > 24 * 60 * 60 * 1000) : true;
  
  const timeRemaining = lastCustomerMessageAt && !isExpired 
    ? (24 * 60 * 60 * 1000) - (currentTime.getTime() - lastCustomerMessageAt.getTime()) 
    : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const isTemplateRequired = isExpired;

  useEffect(() => {
    if (preselectedChat) {
      setActiveChat(preselectedChat);
      if (setPreselectedChat) {
        setPreselectedChat(null);
      }
    }
  }, [preselectedChat, setPreselectedChat]);

  const [configs, setConfigs] = useState<any[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<any>({ id: 'all', phone_number_id: 'all' });
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'text' | 'image' | 'video' | 'document' | 'location' | 'contacts' | null>(null);

  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaFileState, setMediaFileState] = useState<File | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [docFilenameInput, setDocFilenameInput] = useState('');

  const [latInput, setLatInput] = useState('28.6139');
  const [lngInput, setLngInput] = useState('77.2090');
  const [locNameInput, setLocNameInput] = useState('Dhitantra Headquarters');
  const [locAddressInput, setLocAddressInput] = useState('New Delhi, India');

  const [contactNameInput, setContactNameInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');

  // Inbox template picker state
  const [inboxTemplates, setInboxTemplates] = useState<any[]>([]);
  const [selectedInboxTemplate, setSelectedInboxTemplate] = useState<any>(null);
  const [inboxTemplateParams, setInboxTemplateParams] = useState<string[]>([]);
  const [inboxTemplateSending, setInboxTemplateSending] = useState(false);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollThrottleRef = useRef<number>(0);

  // Business Profile + Call Schedule state (used in contact info panel)
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [callScheduleEnabled, setCallScheduleEnabled] = useState(false);
  const [callScheduleStart, setCallScheduleStart] = useState("09:00");
  const [callScheduleEnd, setCallScheduleEnd] = useState("17:00");
  const [callScheduleDays, setCallScheduleDays] = useState<number[]>([1,2,3,4,5]);
  const [callingEnabled, setCallingEnabled] = useState(true);

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/whatsapp/config', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      if (data.configs) {
        setConfigs(data.configs);
      }
    }).catch(err => console.error("Error loading configs:", err));

    fetch('/api/whatsapp/templates', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      if (data.success) {
        const all = [...(data.meta || []), ...(data.local || [])];
        setInboxTemplates(all.filter((t: any) => t.status === 'APPROVED'));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (mediaFileState) {
        objectUrl = URL.createObjectURL(mediaFileState);
        setMediaPreviewUrl(objectUrl);
      } else if (mediaUrlInput.trim()) {
        setMediaPreviewUrl(mediaUrlInput.trim());
      } else {
        setMediaPreviewUrl(null);
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaFileState, mediaUrlInput]);

  const activeWabaPhoneId = activeChat?.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : null);
  const activeWabaConfig = configs.find(c => c.phone_number_id === activeWabaPhoneId);
  const currentReplyMode = activeWabaConfig?.reply_mode || "manual";

  const toggleAI = async () => {
    const targetPhoneId = activeWabaPhoneId;
    if (!targetPhoneId) {
      alert("AI टॉगल करने के लिए कृपया एक विशिष्ट WhatsApp लाइन या बातचीत चुनें।");
      return;
    }

    const targetConfig = configs.find(c => c.phone_number_id === targetPhoneId);
    const currentMode = targetConfig?.reply_mode || "manual";
    const newMode = currentMode === 'ai' ? 'manual' : 'ai';
    
    setConfigs(prev => prev.map(c => c.phone_number_id === targetPhoneId ? { ...c, reply_mode: newMode } : c));
    if (selectedWaba && selectedWaba.phone_number_id === targetPhoneId) {
      setSelectedWaba((prev: any) => ({ ...prev, reply_mode: newMode }));
    }

    try {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
        body: JSON.stringify({ 
          id: targetConfig?.id,
          phone_number_id: targetPhoneId, 
          verify_token: targetConfig?.verify_token || "", 
          reply_mode: newMode 
        })
      });
    } catch (e) {
      console.error("Failed to toggle AI", e);
    }
  };

  const sendRichMessage = async () => {
    if (!activeChat || sending || !attachmentType || isTemplateRequired) return;
    
    const resolvedPhoneId = activeChat.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : undefined);

    let payload: any = {
      to: activeChat.phone,
      conversationId: activeChat.id,
      type: attachmentType,
      phoneNumberId: resolvedPhoneId
    };

    if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') {
      let finalMediaUrl = mediaUrlInput.trim();
      let finalR2Url = null;
      if (mediaFileState) {
         // Upload sequential; sending is set at the call site
         const formData = new FormData();
         formData.append('file', mediaFileState);
         
         try {
            const uploadRes = await fetch('/api/whatsapp/upload', {
               method: 'POST',
               headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
               body: formData
            });
            const uploadData: any = await uploadRes.json();
            if (uploadData.success && uploadData.mediaUrl) {
               finalMediaUrl = uploadData.mediaUrl;
               finalR2Url = uploadData.r2Url;
            } else {
               alert('File upload failed: ' + uploadData.error);
               setSending(false);
               return;
            }
         } catch(e) {
            alert('File upload error');
            setSending(false);
            return;
         }
      }
      
      if (!finalMediaUrl) {
        alert("कृपया मीडिया चुनें या यूआरएल प्रदान करें");
        setSending(false);
        return;
      }
      payload.mediaUrl = finalMediaUrl;
      payload.r2Url = finalR2Url;
      if (attachmentType === 'document') {
        payload.filename = docFilenameInput.trim() || 'Document.pdf';
        payload.text = docFilenameInput.trim() || 'Document.pdf';
      } else {
        payload.text = captionInput.trim();
      }
    } else if (attachmentType === 'location') {
      if (!latInput.trim() || !lngInput.trim() || !locNameInput.trim()) {
        alert("कृपया अक्षांश, देशांतर और लोकेशन का नाम प्रदान करें");
        return;
      }
      const latNum = parseFloat(latInput);
      const lngNum = parseFloat(lngInput);
      if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        alert("कृपया वैध अक्षांश (-90 से 90) और देशांतर (-180 से 180) दर्ज करें");
        return;
      }
      payload.location = {
        latitude: latNum,
        longitude: lngNum,
        name: locNameInput.trim(),
        address: locAddressInput.trim()
      };
    } else if (attachmentType === 'contacts') {
      if (!contactNameInput.trim() || !contactPhoneInput) {
        alert("कृपया संपर्क का नाम और फ़ोन नंबर प्रदान करें");
        return;
      }
      if (!isValidPhoneNumber(contactPhoneInput)) {
        alert("कृपया सही फ़ोन नंबर दर्ज करें। (Invalid phone number)");
        return;
      }
      const sanitizedPhone = contactPhoneInput.startsWith('+') ? contactPhoneInput.slice(1) : contactPhoneInput;

      payload.contacts = [{
        name: {
          first_name: contactNameInput.trim(),
          formatted_name: contactNameInput.trim()
        },
        phones: [{
          phone: sanitizedPhone,
          type: "MOBILE"
        }]
      }];
    }

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setAttachmentType(null); setMediaFileState(null);
        setAttachmentMenuOpen(false);
        setMediaUrlInput('');
        setCaptionInput('');
        setDocFilenameInput('');
        setContactNameInput('');
        setContactPhoneInput('');
        loadMessages(activeChat.id);
      } else {
        alert(data.error || "संदेश भेजने में विफल");
      }
    } catch (e) {
      alert("त्रुटि हुई");
    } finally {
      setSending(false);
    }
  };

  const fetchConversations = useCallback((wabaId?: string) => {
    const activeWaba = wabaId || (selectedWaba ? selectedWaba.phone_number_id : '');
    const url = activeWaba && activeWaba !== 'all'
      ? `/api/inbox/conversations?phoneNumberId=${activeWaba}` 
      : '/api/inbox/conversations';

    fetch(url, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.conversations) {
            setConversations(data.conversations);
            // Update activeChat if it's still the same conversation
            setActiveChat((prev: any) => {
                if (!prev) return null;
                const updated = data.conversations.find((c: any) => c.id === prev.id);
                return updated ? { ...prev, ...updated } : prev;
            });
        }
        setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedWaba]);

  // Ref to always have latest fetchConversations without causing WebSocket reconnects
  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(), 30000); // 30s fallback
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const loadMessages = useCallback((conversationId: string) => {
    fetch(`/api/inbox/messages/${conversationId}`, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.messages) {
            // Merge with existing state to not overwrite concurrent WebSocket updates
            setMessages(prev => {
                const serverIds = new Set(data.messages.map((m: any) => m.id));
                const localOnly = prev.filter(m => m.id.startsWith('optimistic-') && !serverIds.has(m.id));
                return [...data.messages, ...localOnly].sort(
                    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            });
        }
    }).catch(err => console.error("Failed to load messages:", err));
  }, []);

  useEffect(() => {
    if (!activeChat) return;

    loadMessages(activeChat.id);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/${activeChat.id}`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let active = true;
    const convId = activeChat.id;

    function connectWs() {
      if (!active) return;
      try {
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message' && data.message) {
              fetchConversationsRef.current();

              if (data.message.conversation_id === convId) {
                setMessages(prev => {
                  if (prev.some(m => m.id === data.message.id)) return prev;
                  // Match optimistic messages by ID if server assigned our tempId's content, else by content+timer
                  const matchedOptimisticIndex = prev.findIndex(m => {
                    if (!m.id.startsWith('optimistic-')) return false;
                    // If server returned this message and we matched it already in sendMessage callback, skip
                    if (m.status === 'sent' || m.status === 'failed') return false;
                    if (m.content !== data.message.content) return false;
                    // Check timestamps within 5 seconds
                    const t1 = new Date(m.created_at).getTime();
                    const t2 = new Date(data.message.created_at).getTime();
                    return Math.abs(t1 - t2) < 5000;
                  });
                  if (matchedOptimisticIndex !== -1) {
                    const next = [...prev];
                    next[matchedOptimisticIndex] = data.message;
                    return next;
                  }
                  return [...prev, data.message];
                });

                if (data.customer_last_message_at) {
                  setActiveChat((prev: any) => prev ? { ...prev, customer_last_message_at: data.customer_last_message_at } : null);
                }
              }
            } else if (data.type === 'conversation_status_updated') {
              fetchConversationsRef.current();
              if (convId === data.conversation_id) {
                setActiveChat((prev: any) => prev ? { ...prev, status: data.status } : null);
              }
            } else if (data.type === 'message_status_updated') {
              if (convId === data.conversation_id) {
                setMessages((prev: any[]) => prev.map(m => 
                  m.id === data.message_id ? { ...m, status: data.status } : m
                ));
              }
            } else if (data.type === 'conversation_deleted') {
              fetchConversationsRef.current();
              if (convId === data.conversation_id) {
                setActiveChat(null);
              }
            }
          } catch (e) {
            console.error("Error handling ws message", e);
          }
        };

        socket.onclose = () => {
          if (active) {
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };

        socket.onerror = () => {
          if (socket) socket.close();
        };
      } catch (err) {
        console.error("WebSocket connection error:", err);
        if (active) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    const failSafeInterval = setInterval(() => {
      loadMessages(convId);
    }, 10000);

    return () => {
      active = false;
      clearInterval(failSafeInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.close();
      }
    };
  }, [activeChat?.id]); // Only reconnect when conversation changes, not when WABA filter changes

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeChat || isTemplateRequired) return;
    const textToSend = messageInput.trim();
    setMessageInput("");

    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      content: textToSend,
      sender_type: 'agent',
      message_type: 'text',
      created_at: new Date().toISOString(),
      status: 'pending'
    };

    setMessages(prev => [...prev, optimisticMsg]);
    
    const resolvedPhoneId = activeChat.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : undefined);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify({
          to: activeChat.phone,
          text: textToSend,
          conversationId: activeChat.id,
          phoneNumberId: resolvedPhoneId
        })
      });
      const data: any = await res.json();
      if (data.success && data.data?.id) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.data.id, status: 'sent' } : m));
        fetchConversations();
      } else {
        // Keep optimistic but mark as failed instead of removing — user can see what failed
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        toast('error', data.error || "संदेश भेजने में विफल");
        setMessageInput(textToSend);
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast('error', "त्रुटि हुई");
      setMessageInput(textToSend);
    }
  };

  const sendInboxTemplate = async () => {
    if (!selectedInboxTemplate || !activeChat) return;
    setInboxTemplateSending(true);
    const wId = localStorage.getItem('workspaceId');
    // Match phone_number_id from activeChat config, not configs[0]
    const matchingConfig = activeChat.phone_number_id 
      ? configs.find(c => c.phone_number_id === activeChat.phone_number_id) 
      : null;
    const resolvedPhoneId = activeChat.phone_number_id || matchingConfig?.phone_number_id || (configs.length > 0 ? configs[configs.length - 1].phone_number_id : undefined);
    const currentConvId = activeChat.id; // capture before await
    try {
      const res = await fetch('/api/whatsapp/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId || '' },
        body: JSON.stringify({
          to: activeChat.phone,
          templateName: selectedInboxTemplate.name,
          languageCode: selectedInboxTemplate.language || 'en_US',
          parameters: inboxTemplateParams.filter(p => p.trim()),
          phoneNumberId: resolvedPhoneId
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setSelectedInboxTemplate(null);
        setInboxTemplateParams([]);
        fetchConversations();
        // Use captured convId, not activeChat.id from stale closure
        loadMessages(currentConvId);
      } else {
        toast('error', data.error || "टेम्पलेट भेजने में विफल");
      }
    } catch {
      toast('error', "सर्वर एरर");
    } finally {
      setInboxTemplateSending(false);
    }
  };

  useEffect(() => {
    // Only auto-scroll if user is already near the bottom
    if (messagesEndRef.current && isAtBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  const updateConversationStatus = async (convId: string, newStatus: 'open' | 'closed') => {
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/inbox/conversations/${convId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data: any = await res.json();
      if (data.success) {
        setActiveChat((prev: any) => prev && prev.id === convId ? { ...prev, status: newStatus } : prev);
        setConversations((prev: any[]) => prev.map((c: any) => c.id === convId ? { ...c, status: newStatus } : c));
      } else {
        alert(data.error || "अपडेट करने में विफल");
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!confirm("क्या आप वाकई इस बातचीत और इसके सभी संदेशों को हटाना चाहते हैं?")) return;
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/inbox/conversations/${convId}`, {
        method: 'DELETE',
        headers: {
          'x-workspace-id': wId || ''
        }
      });
      const data: any = await res.json();
      if (data.success) {
        setActiveChat(null);
        setConversations(prev => prev.filter(c => c.id !== convId));
      } else {
        alert(data.error || "हटाने में विफल");
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-zinc-900 overflow-hidden relative">
      {/* Contact List */}
      <div className={`w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900 z-10 ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">सक्रिय बातचीत</h2>
              {configs.length > 0 && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded">
                  {configs.length} WABAs
                </span>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">WhatsApp Line</label>
              <div className="relative">
                <select 
                  value={selectedWaba ? (configs.some(c => c.id === selectedWaba.id) ? selectedWaba.id : 'all') : ''} 
                  onChange={(e) => {
                    if (e.target.value === 'all') {
                      setSelectedWaba({ id: 'all', phone_number_id: 'all' });
                      setActiveChat(null);
                    } else {
                      const selected = configs.find(c => c.id === e.target.value);
                      if (selected) {
                        setSelectedWaba(selected);
                        setActiveChat(null);
                      }
                    }
                  }}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                  <option value="all">🌐 सभी (All Lines)</option>
                  {configs.map((cfg) => (
                    <option key={cfg.id} value={cfg.id}>
                      📱 WABA ({cfg.phone_number_id.slice(-6)})
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 text-xs items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button 
                  onClick={() => {
                    setSelectedWaba({ id: 'all', phone_number_id: 'all' });
                    setActiveChat(null);
                  }}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    selectedWaba && selectedWaba.id === 'all'
                      ? 'bg-indigo-600 text-white border-transparent'
                      : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  सभी (Show All)
                </button>

                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                  <button
                    onClick={() => { setFilterStatus('open'); setActiveChat(null); }}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                      filterStatus === 'open'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    सक्रिय (Open)
                  </button>
                  <button
                    onClick={() => { setFilterStatus('closed'); setActiveChat(null); }}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                      filterStatus === 'closed'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    बंद (Closed)
                  </button>
                </div>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {loading ? (
                <div className="p-4 text-sm text-zinc-500">इनबॉक्स लोड हो रहा है...</div>
            ) : conversations.length === 0 ? (
                 <div className="p-4 text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50">कोई बातचीत नहीं है। WhatsApp API से कनेक्ट करें।</div>
            ) : conversations.filter(chat => (chat.status || 'open') === filterStatus).length === 0 ? (
                 <div className="p-4 text-xs text-zinc-400 text-center mt-6">इस श्रेणी में कोई बातचीत नहीं है।</div>
            ) : (
                conversations
                  .filter(chat => (chat.status || 'open') === filterStatus)
                  .map((chat) => (
                    <button 
                      key={chat.id} 
                      onClick={() => { setActiveChat(chat); setIsContactPanelOpen(false); }}
                      className={`w-full text-left p-4 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors ${activeChat?.id === chat.id ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                    >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{chat.contact_name || chat.phone || "अमार्ग निर्देशित"}</span>
                          <span className="text-[10px] text-zinc-500">{formatUserTimeOnly(chat.updated_at, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-500 truncate pr-4">{chat.phone}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${chat.status === 'closed' ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                            {chat.status === 'closed' ? 'Closed' : 'Open'}
                          </span>
                        </div>
                    </button>
                ))
            )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950/50 relative z-0 ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
          {!activeChat ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 flex-col">
              <MessageSquare className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-700" />
              <p>आपका इनबॉक्स खाली है</p>
              <p className="text-xs mt-2 text-zinc-400">संदेश भेजने के लिए बाईं ओर से एक बातचीत चुनें</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
                <div className="flex items-center gap-2 md:gap-3">
                  <button 
                    onClick={() => setActiveChat(null)}
                    className="md:hidden p-2 -ml-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-medium text-sm">
                    {activeChat.contact_name ? activeChat.contact_name[0] : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{activeChat.contact_name || "अज्ञात"}</h3>
                    <p className="text-xs text-zinc-500">{activeChat.phone}</p>
                  </div>
                </div>

                <div className="flex-1 flex justify-center hidden lg:flex">
                  <div className={`text-[11px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5 ${isTemplateRequired ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                    <Activity className="w-3.5 h-3.5" />
                    {!lastCustomerMessageAt ? "ग्राहक के रिप्लाई का इंतज़ार है" : isExpired ? "विंडो समाप्त (Template Required)" : `विंडो समाप्त होने में: ${hoursRemaining}h ${minutesRemaining}m`}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (onInitiateCall) {
                        onInitiateCall({
                          id: activeChat.contact_id || activeChat.id,
                          name: activeChat.contact_name || 'Contact',
                          phone: activeChat.phone
                        });
                      }
                    }}
                    className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1.5"
                    title="कॉल करें (Voice Call)"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">कॉल</span>
                  </button>

                  <button 
                    onClick={toggleAI}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${currentReplyMode === 'ai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="Toggle AI Chatbot"
                  >
                    <Bot className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">{currentReplyMode === 'ai' ? 'AI ON' : 'AI OFF'}</span>
                  </button>

                  <button 
                    onClick={() => updateConversationStatus(activeChat.id, activeChat.status === 'closed' ? 'open' : 'closed')}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${activeChat.status === 'closed' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title={activeChat.status === 'closed' ? 'Reopen Conversation' : 'Close Conversation'}
                  >
                    <Archive className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">
                      {activeChat.status === 'closed' ? 'खोले (Reopen)' : 'बंद करें (Close)'}
                    </span>
                  </button>

                  <button 
                    onClick={() => deleteConversation(activeChat.id)}
                    className="p-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                    title="Delete Conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">हटाएं (Delete)</span>
                  </button>

                  <button 
                    onClick={() => setIsContactPanelOpen(!isContactPanelOpen)}
                    className={`p-2 rounded-lg transition-colors ${isContactPanelOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Contact Details"
                  >
                    <User className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div 
                ref={messagesContainerRef}
                onScroll={(e) => {
                    // Throttle to avoid excessive re-renders during fast scrolling
                    const now = Date.now();
                    if (now - scrollThrottleRef.current < 150) return;
                    scrollThrottleRef.current = now;
                    const el = e.currentTarget;
                    const threshold = 100;
                    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
                }}
                className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
                 {messages.length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm mt-10">कोई संदेश नहीं</p>
                  ) : (
                    messages.map(msg => {
                      let displayMediaUrl = msg.media_url;
                      if (displayMediaUrl && displayMediaUrl.includes('graph.facebook.com')) {
                          const wId = localStorage.getItem('workspaceId');
                          displayMediaUrl = `/api/whatsapp/media?workspaceId=${wId}&url=${encodeURIComponent(displayMediaUrl)}`;
                      }

                      const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'bot';
                      const mType = msg.message_type || 'text';
                      
                      return (
                        <div key={msg.id} className={`flex flex-col gap-1 ${isAgent ? 'items-end' : 'items-start'}`}>
                           <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-sm ${isAgent ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'}`}>
                             {mType === 'image' && (
                               <div className="flex flex-col gap-2">
                                 {displayMediaUrl && (
                                   <div className="group relative rounded-lg overflow-hidden border border-zinc-100/10 max-w-sm max-h-60 bg-zinc-950/20">
                                     <img 
                                       src={displayMediaUrl} 
                                       alt="WhatsApp Attachment"
                                       className="w-full object-cover max-h-60 hover:scale-105 transition-transform duration-200 cursor-pointer" 
                                       onError={(e) => {
                                         e.currentTarget.style.display = 'none';
                                       }}
                                     />
                                   
                                     <a href={displayMediaUrl} download="image.jpg" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="w-4 h-4" />
                                     </a>
                                   </div>
                                 )}
                                 {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                               </div>
                             )}

                             {mType === 'video' && (
                               <div className="flex flex-col gap-2">
                                 {displayMediaUrl && (
                                   <div className="group relative rounded-lg inline-block w-full max-w-xs">
<video 
                                     src={displayMediaUrl} 
                                     controls 
                                     className="rounded-lg w-full max-h-60"
                                     onError={(e) => {
                                       e.currentTarget.style.display = 'none';
                                     }}
                                   />
<a href={displayMediaUrl} download="video.mp4" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"><Download className="w-4 h-4" /></a>
</div>
                                 )}
                                 {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                               </div>
                             )}

                             {mType === 'document' && (
                               <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                 <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-lg flex items-center justify-center shrink-0">
                                   <FileText className="w-5 h-5" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <p className="font-semibold text-xs truncate">{msg.content || 'Document.pdf'}</p>
                                   {displayMediaUrl && (
                                     <a 
                                       href={displayMediaUrl} 
                                       target="_blank" 
                                       rel="noopener noreferrer" 
                                       className="text-[10px] text-indigo-400 dark:text-indigo-300 hover:underline mt-1 block font-medium"
                                     >
                                       डाउनलोड करें (Download)
                                     </a>
                                   )}
                                 </div>
                               </div>
                             )}

                             {mType === 'location' && (() => {
                               try {
                                 const loc = typeof msg.content === 'string' && msg.content.startsWith('{') 
                                   ? JSON.parse(msg.content) 
                                   : null;
                                 
                                 return (
                                   <div className="flex flex-col gap-2 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                     <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10">
                                       <div className="w-10 h-10 bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center shrink-0">
                                         <MapPin className="w-5 h-5" />
                                       </div>
                                       <div className="min-w-0 flex-1 text-xs">
                                         <p className="font-semibold truncate">{loc?.name || 'लोकेशन'}</p>
                                         <p className="text-[10px] text-zinc-500 truncate">{loc?.address || 'नक्शा देखें'}</p>
                                       </div>
                                     </div>
                                     {loc?.latitude && loc?.longitude && (
                                       <a 
                                         href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                                         target="_blank" 
                                         rel="noopener noreferrer" 
                                         className="text-center text-xs font-semibold py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors block mt-1"
                                       >
                                         Google Maps पर खोलें 🗺️
                                       </a>
                                     )}
                                   </div>
                                 );
                               } catch (e) {
                                 return <p className="italic text-xs text-zinc-400">Location: {msg.content}</p>;
                               }
                             })()}

                             {mType === 'contacts' && (() => {
                               try {
                                 const contactsData = typeof msg.content === 'string' && msg.content.startsWith('[') 
                                   ? JSON.parse(msg.content) 
                                   : null;
                                 const cName = contactsData?.[0]?.name?.formatted_name || contactsData?.[0]?.name?.first_name || 'Contact';
                                 const cPhone = contactsData?.[0]?.phones?.[0]?.phone || '';
                                 
                                 return (
                                   <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                     <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center shrink-0">
                                       <User className="w-5 h-5" />
                                     </div>
                                     <div className="min-w-0 flex-1 text-xs">
                                       <p className="font-semibold truncate">{cName}</p>
                                       <p className="text-[10px] text-zinc-500 truncate">{cPhone}</p>
                                       {cPhone && (
                                         <a 
                                           href={`https://wa.me/${cPhone.replace(/\D/g, '')}`}
                                           target="_blank" 
                                           rel="noopener noreferrer" 
                                           className="text-[10px] text-indigo-400 dark:text-indigo-300 hover:underline mt-1 block font-medium"
                                         >
                                           WhatsApp पर चैट करें ↗
                                         </a>
                                       )}
                                     </div>
                                   </div>
                                 );
                               } catch (e) {
                                 return <p className="italic text-xs text-zinc-400">Contact: {msg.content}</p>;
                               }
                             })()}

                             {(mType === 'text' || mType === 'interactive' || mType === 'order') && (
                               <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                             )}
                             {mType === 'reaction' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-2xl">{msg.content}</span>
                                 <span className="text-xs text-zinc-400 italic">(रिएक्शन / Reaction)</span>
                               </div>
                             )}
                             {mType === 'system' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-sm font-semibold italic text-zinc-500">[{msg.content}]</span>
                               </div>
                             )}
                             {mType === 'unknown' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-sm italic">({msg.content})</span>
                               </div>
                             )}
                           </div>
                           <div className={`flex items-center gap-1 mt-0.5 ${isAgent ? 'mr-1' : 'ml-1'}`}>
                             <span className="text-[10px] text-zinc-400">{formatUserTimeOnly(msg.created_at, { hour: '2-digit', minute: '2-digit' })}</span>
                             {isAgent && (
                               msg.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> :
                               msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> :
                               msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-zinc-400" /> :
                               msg.status === 'pending' ? <div className="w-3 h-3 border-2 border-zinc-400 dark:border-zinc-500 border-t-transparent rounded-full animate-spin"></div> :
                               <Check className="w-3.5 h-3.5 text-zinc-400" />
                             )}
                           </div>
                        </div>
                      );
                    })
                  )}
                 <div ref={messagesEndRef} />
              </div>

              {/* Message Input Drawer and Input field */}
              {attachmentType && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <span className="text-sm font-semibold capitalize text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      {attachmentType === 'image' && '📸 इमेज संदेश भेजें'}
                      {attachmentType === 'video' && '🎥 वीडियो संदेश भेजें'}
                      {attachmentType === 'document' && '📄 दस्तावेज़ (Doc) भेजें'}
                      {attachmentType === 'location' && '📍 लोकेशन (Maps) भेजें'}
                      {attachmentType === 'contacts' && '👤 संपर्क (Contact) भेजें'}
                    </span>
                    <button 
                      onClick={() => { 
                        setAttachmentType(null); 
                        setMediaFileState(null); 
                        setAttachmentMenuOpen(false);
                        setMediaUrlInput('');
                        setMediaPreviewUrl(null);
                        setCaptionInput('');
                        setDocFilenameInput('');
                        setContactNameInput('');
                        setContactPhoneInput('');
                        setLatInput('28.6139');
                        setLngInput('77.2090');
                        setLocNameInput('Dhitantra Headquarters');
                        setLocAddressInput('');
                      }}
                      className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {(attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">फ़ाइल चुनें (File)*</label>
                        <input 
                          type="file" 
                          accept={
                            attachmentType === 'image' ? "image/*" :
                            attachmentType === 'video' ? "video/*" :
                            "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          }
                          className="w-full text-xs p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                                setMediaFileState(file);
                             }
                          }}
                        />
                      </div>
                      {attachmentType === 'document' ? (
                        <div>
                          <label className="text-xs text-zinc-500 font-medium block mb-1">फ़ाइल नाम (Filename.pdf)*</label>
                          <input 
                            type="text" 
                            placeholder="Invoice.pdf" 
                            className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                            value={docFilenameInput}
                            onChange={(e) => setDocFilenameInput(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-zinc-500 font-medium block mb-1">कैप्शन (Caption - Optional)</label>
                          <input 
                            type="text" 
                            placeholder="कैप्शन लिखें..." 
                            className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                            value={captionInput}
                            onChange={(e) => setCaptionInput(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {attachmentType === 'location' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">अक्षांश (Latitude)*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={latInput}
                          onChange={(e) => setLatInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">देशांतर (Longitude)*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={lngInput}
                          onChange={(e) => setLngInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">लोकेशन का नाम*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={locNameInput}
                          onChange={(e) => setLocNameInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">लोकेशन का पता</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={locAddressInput}
                          onChange={(e) => setLocAddressInput(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {attachmentType === 'contacts' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">संपर्क नाम (Contact Name)*</label>
                        <input 
                          type="text" 
                          placeholder="राम शर्मा" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={contactNameInput}
                          onChange={(e) => setContactNameInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">फ़ोन नंबर (Country Code के साथ)*</label>
                        <PhoneInput 
                          international
                          defaultCountry="IN"
                          placeholder="फ़ोन नंबर दर्ज करें" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={contactPhoneInput}
                          onChange={(val) => setContactPhoneInput(val || '')}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-1">
                    <button 
                      onClick={() => { 
                        setAttachmentType(null); 
                        setMediaFileState(null); 
                        setAttachmentMenuOpen(false);
                        setMediaUrlInput('');
                        setMediaPreviewUrl(null);
                        setCaptionInput('');
                        setDocFilenameInput('');
                        setContactNameInput('');
                        setContactPhoneInput('');
                        setLatInput('28.6139');
                        setLngInput('77.2090');
                        setLocNameInput('Dhitantra Headquarters');
                        setLocAddressInput('');
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                    >
                      रद्द करें
                    </button>
                    <button 
                      onClick={sendRichMessage}
                      disabled={sending}
                      className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                    >
                      {sending ? 'भेज रहे हैं...' : 'संदेश भेजें'}
                    </button>
                  </div>
                </div>
              )}

             <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 relative flex flex-col gap-2">
               {isTemplateRequired && !selectedInboxTemplate && (
                 <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200 text-xs font-medium space-y-2">
                   <p className="text-center">{!lastCustomerMessageAt ? "ग्राहक के रिप्लाई का इंतज़ार है।" : "24-घंटे की सर्विस विंडो समाप्त हो चुकी है।"} टेम्पलेट भेजकर बातचीत शुरू करें।</p>
                   <div className="flex gap-2">
                      <select onChange={e => {
                        const tmpl = inboxTemplates.find(t => t.name === e.target.value);
                        if (tmpl) {
                          setSelectedInboxTemplate(tmpl);
                          const matches = (tmpl.body_text || '').match(/\{\{\d+\}\}/g);
                          setInboxTemplateParams(matches ? new Array(matches.length).fill('') : []);
                        } else {
                          setSelectedInboxTemplate(null);
                          setInboxTemplateParams([]);
                        }
                      }} value={selectedInboxTemplate?.name || ''} className="flex-1 bg-white dark:bg-zinc-950 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-xs outline-none font-mono">
                       <option value="" disabled>टेम्पलेट चुनें...</option>
                       {inboxTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                     </select>
                   </div>
                 </div>
               )}
               {isTemplateRequired && selectedInboxTemplate && (
                 <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs space-y-2">
                   <div className="flex items-center justify-between">
                     <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">{selectedInboxTemplate.name}</span>
                     <button onClick={() => { setSelectedInboxTemplate(null); setInboxTemplateParams([]); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X className="w-3.5 h-3.5" /></button>
                   </div>
                   {inboxTemplateParams.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                       {inboxTemplateParams.map((val, idx) => (
                         <div key={idx} className="flex items-center gap-1">
                           <span className="font-mono text-indigo-500 text-[10px]">{'{{' + (idx + 1) + '}}'}</span>
                           <input type="text" value={val} onChange={e => { const c = [...inboxTemplateParams]; c[idx] = e.target.value; setInboxTemplateParams(c); }} placeholder={`मान ${idx + 1}`} className="w-24 bg-white dark:bg-zinc-950 border border-indigo-200 dark:border-indigo-700 rounded px-2 py-1 text-xs outline-none" />
                         </div>
                       ))}
                     </div>
                   )}
                   <button onClick={sendInboxTemplate} disabled={inboxTemplateSending} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                     {inboxTemplateSending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-3 h-3" />}
                     टेम्पलेट भेजें
                   </button>
                 </div>
               )}
               {attachmentMenuOpen && !attachmentType && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="absolute bottom-16 left-6 p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl flex flex-col gap-1 z-50 text-xs font-medium w-48"
                 >
                   <button 
                     onClick={() => { setAttachmentType('image'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     📸 इमेज (Image)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('video'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     🎥 वीडियो (Video)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('document'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     📄 दस्तावेज़ (Doc)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('location'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     📍 लोकेशन (Maps)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('contacts'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     👤 संपर्क (Contact)
                   </button>
                 </motion.div>
               )}

               <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-full pl-3 pr-1 py-1 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                 <button 
                   onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                   className={`p-2 rounded-full transition-colors ${attachmentMenuOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                   title="Add attachment"
                   disabled={isTemplateRequired}
                 >
                   <Paperclip className="w-4 h-4" />
                 </button>
                 <input 
                   type="text" 
                   placeholder="संदेश टाइप करें..." 
                   className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 disabled:opacity-50"
                   value={messageInput}
                   onChange={(e) => setMessageInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                   disabled={!!attachmentType || isTemplateRequired}
                 />
                 <button 
                   onClick={sendMessage}
                   disabled={!messageInput.trim() || sending || !!attachmentType || isTemplateRequired}
                   className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${messageInput.trim() && !sending && !attachmentType && !isTemplateRequired ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'}`}
                 >
                   <Send className="w-4 h-4" />
                 </button>
               </div>
             </div>

             {/* WhatsApp-Style Media Preview */}
             {mediaPreviewUrl && (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') && (
               <div className="absolute inset-x-0 bottom-0 top-16 bg-zinc-950/95 flex flex-col z-20 transition-all animate-in fade-in-50 duration-200">
                 {/* Preview Header */}
                 <div className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between text-white flex-shrink-0">
                   <div className="flex items-center gap-3">
                     <span className="font-semibold text-sm">WhatsApp Media Preview</span>
                     <span className="text-xs text-zinc-400 capitalize bg-zinc-800 px-2 py-0.5 rounded-full">{attachmentType}</span>
                   </div>
                   <button 
                     onClick={() => {
                       setMediaPreviewUrl(null);
                       setMediaFileState(null);
                       setMediaUrlInput('');
                       setAttachmentType(null);
                     }}
                     className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                     title="रद्द करें (Cancel)"
                   >
                     <X className="w-5 h-5" />
                   </button>
                 </div>

                 {/* Preview Center */}
                 <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                   {attachmentType === 'image' && (
                     <img 
                       src={mediaPreviewUrl} 
                       alt="Preview" 
                       className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 animate-in zoom-in-95 duration-200"
                       onError={(e) => {
                         (e.target as HTMLElement).style.display = 'none';
                       }}
                     />
                   )}
                   {attachmentType === 'video' && (
                     <video 
                       src={mediaPreviewUrl} 
                       controls 
                       className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 animate-in zoom-in-95 duration-200" 
                     />
                   )}
                   {attachmentType === 'document' && (
                     <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl text-center animate-in zoom-in-95 duration-200">
                       <FileText className="w-16 h-16 text-indigo-500 mb-3" />
                       <span className="text-sm font-semibold text-zinc-200 truncate max-w-xs block">
                         {docFilenameInput || (mediaFileState ? mediaFileState.name : "Document.pdf")}
                       </span>
                       <span className="text-xs text-zinc-500 mt-1">Ready to send via secure R2 storage</span>
                     </div>
                   )}
                 </div>

                 {/* WhatsApp-Style Bottom Input Area with green Send Button */}
                 <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center flex-shrink-0">
                   <div className="w-full max-w-2xl flex items-center gap-3">
                     {attachmentType === 'document' ? (
                       <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white flex items-center gap-2">
                         <span className="text-zinc-400 font-medium text-xs">FileName:</span>
                         <input 
                           type="text" 
                           className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500"
                           placeholder="दस्तावेज़ का नाम दर्ज करें (जैसे Invoice.pdf)..."
                           value={docFilenameInput}
                           onChange={(e) => setDocFilenameInput(e.target.value)}
                         />
                       </div>
                     ) : (
                       <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white flex items-center gap-2">
                         <span className="text-zinc-400 font-medium text-xs">Caption:</span>
                         <input 
                           type="text" 
                           className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500"
                           placeholder="कैप्शन जोड़ें (Add a caption)..."
                           value={captionInput}
                           onChange={(e) => setCaptionInput(e.target.value)}
                         />
                       </div>
                     )}
                     
                     <button 
                       onClick={sendRichMessage}
                       disabled={sending}
                       className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-white flex items-center justify-center transition-all shadow-lg active:scale-95"
                       title="भेजें (Send)"
                     >
                       {sending ? (
                         <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                       ) : (
                         <Send className="w-5 h-5" />
                       )}
                     </button>
                   </div>
                 </div>
               </div>
             )}
           </>
          )}
      </div>
      <AnimatePresence>
        {isContactPanelOpen && activeChat && (
          <motion.div 
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="w-full md:w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col absolute right-0 top-0 bottom-0 z-30 shadow-2xl"
          >
            <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 flex-shrink-0">
              <h2 className="font-medium">Contact Details</h2>
              <button 
                onClick={() => setIsContactPanelOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-2xl mb-4">
                   {activeChat.contact_name ? activeChat.contact_name[0] : <User className="w-8 h-8" />}
                </div>
                <h3 className="font-medium text-lg text-zinc-900 dark:text-zinc-100">{activeChat.contact_name || "Unknown"}</h3>
                <span className="inline-flex items-center px-2 py-1 mt-2 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {activeChat.status}
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3">About</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <Phone className="w-4 h-4 text-zinc-400" />
                      <span>{activeChat.phone}</span>
                    </div>
                    {activeChat.company && (
                      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                        <Building2 className="w-4 h-4 text-zinc-400" />
                        <span>{activeChat.company}</span>
                      </div>
                    )}
                    {activeChat.location && (
                      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                        <span>{activeChat.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {activeChat.history && activeChat.history.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <History className="w-4 h-4 text-zinc-400" />
                      Recent Activity
                    </h4>
                    <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 space-y-4 pb-2">
                      {activeChat.history.map((item: any, i: number) => (
                        <div key={i} className="relative pl-4">
                          <div className="absolute w-2 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full -left-[4.5px] top-1.5 border border-white dark:border-zinc-900"></div>
                          <p className="text-sm text-zinc-900 dark:text-zinc-100">{item.action}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{item.date}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                      <Tag className="w-3 h-3" /> WhatsApp
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                      <Tag className="w-3 h-3" /> VIP
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BroadcastView() {
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
        alert(data.error || 'ब्रॉडकास्ट बनाने में विफल');
      }
    } catch {
      alert('सर्वर एरर');
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
          <p className="text-sm text-zinc-500">Template messages भेजें अपने सभी contacts को</p>
        </div>
      </div>

      {campaignId && progress ? (
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{campaignName}</h3>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${progress.sent + progress.failed >= progress.total ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
              {progress.sent + progress.failed >= progress.total ? 'पूर्ण' : 'प्रगति में...'}
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-4 overflow-hidden">
            <div className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${progress.total > 0 ? ((progress.sent + progress.failed) / progress.total * 100) : 0}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{progress.sent}</p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">भेजे गए</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{progress.failed}</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">विफल</p>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 p-4 rounded-xl">
              <p className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">{progress.pending}</p>
              <p className="text-xs text-zinc-500 mt-1">बाकी</p>
            </div>
          </div>
          {progress.sent + progress.failed >= progress.total && (
            <button onClick={() => { setCampaignId(null); setProgress(null); setCampaignName(''); setSelectedContactIds(new Set()); setSelectedTemplate(null); }} className="w-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-lg px-4 py-3 hover:scale-[0.99] transition-transform">
              नया ब्रॉडकास्ट बनाएं
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm">ब्रॉडकास्ट सेटिंग्स</h3>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">अभियान का नाम</label>
                <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="जैसे: Summer Promo Blast" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">प्रेषक WABA</label>
                  <select value={chosenWaba?.id || ''} onChange={e => setChosenWaba(configs.find(c => c.id === e.target.value))} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 font-mono">
                    {configs.map(cfg => <option key={cfg.id} value={cfg.id}>{cfg.phone_number_id}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <h3 className="font-semibold text-sm">टेम्पलेट चुनें</h3>
              {templates.length === 0 ? (
                <p className="text-xs text-zinc-400">कोई approved टेम्पलेट नहीं मिला</p>
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
                <h3 className="font-semibold text-sm">पैरामीटर मान</h3>
                {templateParams.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">{'{{' + (idx + 1) + '}}'}</span>
                    <input type="text" value={val} onChange={e => { const c = [...templateParams]; c[idx] = e.target.value; setTemplateParams(c); }} placeholder={`मान ${idx + 1}`} className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" />
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
                  <h3 className="font-semibold text-sm">प्राप्तकर्ता चुनें <span className="text-zinc-400 font-normal">({selectedContactIds.size} चुने गए)</span></h3>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${activeOnly ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>
                      {activeContactIds.size} सक्रिय
                    </span>
                    <button onClick={toggleAll} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                      {selectedContactIds.size === filteredContacts.length ? 'सभी हटाएं' : 'सभी चुनें'}
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="नाम या नंबर से खोजें..." className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm outline-none focus:border-indigo-500" />
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
                    केवल सक्रिय बातचीत वाले
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">कोई संपर्क नहीं मिला</div>
                ) : (
                  filteredContacts.map(c => (
                    <label key={c.id} className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${selectedContactIds.has(c.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                      <input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={() => toggleContact(c.id)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {activeContactIds.has(c.id) && (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active conversation" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.name || 'अज्ञात'}</p>
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
                  {sending ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> भेज रहे हैं...</> : <><Send className="w-4 h-4" /> {selectedContactIds.size} को ब्रॉडकास्ट भेजें</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleView() {
  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full text-center mt-20">
       <div className="inline-flex w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center text-zinc-500 mb-6 border border-zinc-200 dark:border-zinc-700">
           <CalendarClock className="w-8 h-8" />
       </div>
       <h2 className="text-2xl font-semibold mb-2 tracking-tight">Social Media Scheduler</h2>
       <p className="text-zinc-500 dark:text-zinc-400 mb-8 max-w-md mx-auto">
           Schedule posts to Instagram and Facebook using Cloudflare Workflows and R2 storage.
       </p>
       
       <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-left shadow-sm mb-8">
           <div className="space-y-4 max-w-lg mx-auto">
               <div>
                   <label className="block text-sm font-medium mb-2">Select Platforms</label>
                   <div className="flex gap-3">
                       <button className="flex-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-900 dark:border-zinc-100 py-2 rounded-lg text-sm font-medium">Instagram</button>
                       <button className="flex-1 bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 py-2 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Facebook</button>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Media Attachment (R2 Upload)</label>
                   <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                       <p className="text-sm text-zinc-500">Drag & drop image/video here, or click to securely upload to Cloudflare R2</p>
                   </div>
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5 mt-2">Caption</label>
                   <textarea 
                        rows={3}
                        placeholder="Write a captivating caption..." 
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm resize-none"
                   />
               </div>
               <div className="pt-4 flex gap-3">
                   <button className="flex-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-lg px-4 py-2.5 hover:scale-[0.99] transition-transform">
                       Schedule Workflow Task
                   </button>
               </div>
           </div>
       </div>
    </div>
  );
}

function SettingsView() {
    const { toast } = useToast();
    const [phoneNumberId, setPhoneNumberId] = useState("");
    const [wabaId, setWabaId] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [verifyToken, setVerifyToken] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [metaConfigId, setMetaConfigId] = useState("");
    const [replyMode, setReplyMode] = useState("manual");
    
    // User Profile Settings
    const [userTimezone, setUserTimezone] = useState("Asia/Kolkata");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState("");

    const saveUserProfile = async () => {
      setSavingProfile(true);
      setProfileMessage("");
      try {
        const res = await fetch('/api/user/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: userTimezone })
        });
        const data: any = await res.json();
        if (data.success) {
          setProfileMessage("प्रोफ़ाइल अपडेट हो गई। पेज रीफ्रेश करें ताकि नए बदलाव लागू हो सकें।");
          localStorage.setItem('userTimezone', userTimezone);
        } else {
          setProfileMessage("त्रुटि: " + (data.error || "अज्ञात"));
        }
      } catch (e) {
        setProfileMessage("अपडेट करने में त्रुटि।");
      } finally {
        setSavingProfile(false);
      }
    };

    const [configs, setConfigs] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    const loadAllConfigs = () => {
      const wId = localStorage.getItem('workspaceId');
      fetch('/api/whatsapp/config', {
        headers: { 'x-workspace-id': wId || '' }
      }).then(r => r.json()).then((data: any) => {
        if (data.configs) {
          setConfigs(data.configs);
        }
      }).catch(err => console.error("Error loading configs:", err));
    };

    const deleteConfig = async (id: string) => {
      if (!confirm("क्या आप वाकई इस WhatsApp अकाउंट को हटाना चाहते हैं?")) return;
      try {
        const res = await fetch(`/api/whatsapp/config/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
        });
        const data: any = await res.json();
        if (data.success) {
          setMessage("अकाउंट सफलतापूर्वक हटा दिया गया।");
          loadAllConfigs();
        } else {
          alert(data.error || "हटाने में विफलता");
        }
      } catch (e) {
        alert("त्रुटि हुई");
      }
    };

    const startEditing = (cfg: any) => {
      setEditingId(cfg.id);
      setPhoneNumberId(cfg.phone_number_id || "");
      setWabaId(cfg.waba_id || "");
      setVerifyToken(cfg.verify_token || "");
      setAccessToken("••••••••••••••••");
      setReplyMode(cfg.reply_mode || "manual");
      setMessage("अकाउंट संपादित किया जा रहा है...");
    };

    const cancelEditing = () => {
      setEditingId(null);
      setPhoneNumberId("");
      setWabaId("");
      setVerifyToken("");
      setAccessToken("");
      setReplyMode("manual");
      setMessage("");
    };

    useEffect(() => {
      let isSubscribed = true;

      const initFB = async () => {
        try {
          const res = await fetch('/api/config/meta');
          const data: any = await res.json();
          if (isSubscribed && data.appId) {
            setMetaConfigId(data.configId || '');
            (window as any).fbAsyncInit = function () {
              (window as any).FB.init({
                appId: data.appId,
                autoLogAppEvents: true,
                xfbml: true,
                version: 'v19.0'
              });
            };
            if ((window as any).FB) {
               (window as any).FB.init({
                 appId: data.appId,
                 autoLogAppEvents: true,
                 xfbml: true,
                 version: 'v19.0'
               });
            }
          }
        } catch (e) {
          console.error("Failed to load Meta config");
        }
      };

      initFB();

      const sessionInfoListener = (event: MessageEvent) => {
        if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
          return;
        }
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'WA_EMBEDDED_SIGNUP') {
            if (data.event === 'FINISH') {
              const { phone_number_id, waba_id } = data.data;
              setMessage("Embedded Signup पूरा हुआ, सर्वर पर रजिस्टर किया जा रहा है...");
              
              fetch('/api/meta/embedded-signup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      workspaceId: localStorage.getItem('workspaceId'),
                      accessToken: 'handled_by_system_user_in_backend',
                      wabaId: waba_id,
                      phoneNumberIds: Array.isArray(phone_number_id) ? phone_number_id : [phone_number_id]
                  })
              }).then(r => r.json()).then((res: any) => {
                  if (res.success) {
                      setMessage(`Tech Provider Onboarding सफल! WABA: ${res.waba}`);
                      setPhoneNumberId(phone_number_id);
                      setWabaId(waba_id);
                  } else {
                      setMessage(`Tech Provider Onboarding विफल: ${res.error}`);
                  }
              }).catch(() => {
                  setMessage("सर्वर से संपर्क करने में त्रुटि।");
              });
            } else if (data.event === 'CANCEL') {
              setMessage("Signup रद्द कर दिया गया।");
            } else if (data.event === 'ERROR') {
              setMessage("Signup में त्रुटि आई।");
            }
          }
        } catch (e) {
        }
      };

      window.addEventListener('message', sessionInfoListener);

      const wId = localStorage.getItem('workspaceId');
      
      fetch('/api/whatsapp/config', {
        headers: { 'x-workspace-id': wId || '' }
      }).then(r => r.json()).then((data: any) => {
        if (data.configs) {
          setConfigs(data.configs);
        }
        if (data.config) {
          setPhoneNumberId(data.config.phone_number_id || "");
          setWabaId(data.config.waba_id || "");
          setVerifyToken(data.config.verify_token || "");
          setAccessToken("••••••••••••••••");
          setReplyMode(data.config.reply_mode || "manual");
        }
        if (wId) {
          setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
        }
        setLoading(false);
      }).catch(() => {
        if (wId) {
          setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
        }
        setLoading(false);
      });
      const savedTz = localStorage.getItem('userTimezone');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedTz) setUserTimezone(savedTz);

      return () => {
         isSubscribed = false;
         window.removeEventListener('message', sessionInfoListener);
      };
    }, []);

    const launchWhatsAppSignup = () => {
      if (!metaConfigId) {
         setMessage("Tech Provider Config ID लोड नहीं हुआ है।");
         return;
      }
      if (typeof window !== 'undefined' && (window as any).FB) {
        (window as any).FB.login((response: any) => {
          if (response.authResponse) {
             console.log("FB login popup successful, waiting for WA_EMBEDDED_SIGNUP message...");
          } else {
             setMessage("Signup रद्द कर दिया गया या विफल रहा।");
          }
        }, {
          config_id: metaConfigId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup_field_mapping: {
              name: 'Dhitantra Client'
            },
            feature: 'whatsapp_embedded_signup'
          }
        });
      } else {
        setMessage("Facebook SDK लोड हो रहा है या कॉन्फ़िगर नहीं किया गया है। कृपया पुनः प्रयास करें।");
      }
    };

    const saveConfig = async () => {
      setSaving(true);
      setMessage("");
      try {
        const payload: any = { 
          id: editingId,
          phone_number_id: phoneNumberId, 
          waba_id: wabaId,
          verify_token: verifyToken, 
          reply_mode: replyMode
        };
        if (accessToken !== "••••••••••••••••") {
          payload.access_token = accessToken;
        }

        const res = await fetch('/api/whatsapp/config', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-workspace-id': localStorage.getItem('workspaceId') || ''
          },
          body: JSON.stringify(payload)
        });
        const data: any = await res.json();
        if (data.success) {
          setMessage(editingId ? "कॉन्फ़िगरेशन सफलतापूर्वक अपडेट किया गया!" : "कॉन्फ़िगरेशन सफलतापूर्वक सेव किया गया!");
          setPhoneNumberId("");
          setWabaId("");
          setAccessToken("");
          setVerifyToken("");
          setEditingId(null);
          loadAllConfigs();
        } else {
          setMessage("त्रुटि: " + (data.error || "अज्ञात"));
        }
      } catch (e) {
         setMessage("सेव करने में असमर्थ।");
      } finally {
         setSaving(false);
      }
    };

    if (loading) return <div className="p-8">लोड हो रहा है...</div>;

    return (
        <div className="p-6 md:p-8 w-full max-w-4xl mx-auto space-y-6">
             <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">वर्कस्पेस सेटिंग्स</h2>
             
             {/* User Profile Section */}
             <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display flex items-center gap-2">
                       <User className="w-5 h-5 text-indigo-500" /> उपयोगकर्ता सेटिंग्स
                     </h3>
                     <p className="text-sm text-zinc-500 mb-6">अपना पसंदीदा टाइमज़ोन सेट करें ताकि सभी संदेश और लॉग सही समय दिखाएं।</p>
                     
                     <div className="max-w-xl space-y-4">
                        <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Timezone</label>
                           <select value={userTimezone} onChange={e => setUserTimezone(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                             <option value="Asia/Kolkata">India Standard Time (IST)</option>
                             <option value="America/New_York">Eastern Time (US & Canada)</option>
                             <option value="America/Chicago">Central Time (US & Canada)</option>
                             <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                             <option value="Europe/London">Greenwich Mean Time (London)</option>
                             <option value="Europe/Paris">Central European Time (Paris)</option>
                             <option value="Asia/Dubai">Gulf Standard Time (Dubai)</option>
                             <option value="Asia/Singapore">Singapore Standard Time</option>
                             <option value="Australia/Sydney">Australian Eastern Time (Sydney)</option>
                             <option value="UTC">Coordinated Universal Time (UTC)</option>
                           </select>
                        </div>

                        <button 
                          onClick={saveUserProfile} 
                          disabled={savingProfile} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {savingProfile ? "सेव हो रहा है..." : "सेव करें"}
                        </button>
                        {profileMessage && <p className="text-sm mt-2 text-emerald-600 dark:text-emerald-400 font-medium">{profileMessage}</p>}
                     </div>
                 </div>
             </div>

             {/* WhatsApp Config Section */}
             <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8 border-b border-zinc-100 dark:border-zinc-800">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display flex items-center gap-2">
                       <MessageSquare className="w-5 h-5 text-emerald-500" /> WhatsApp Cloud API
                     </h3>
                     <p className="text-sm text-zinc-500 mb-6">WhatsApp Business Account को कनेक्ट करें ताकि आप Live Webhooks प्राप्त कर सकें और संदेश भेज सकें।</p>
                     
                     <div className="space-y-4 max-w-xl">
                         <div className="mb-6 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex flex-col items-start gap-3">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">आसान सेटअप (Embedded Signup)</h4>
                            <p className="text-xs text-blue-800 dark:text-blue-400">Meta के आधिकारिक Embedded Signup के ज़रिए सिर्फ एक क्लिक में अपना WhatsApp Business अकाउंट कनेक्ट करें।</p>
                            <button onClick={launchWhatsAppSignup} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> Facebook के साथ लॉगिन करें
                            </button>
                         </div>
                         
                         <div className="flex items-center gap-4 mb-2">
                           <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
                           <span className="text-xs text-zinc-400 font-medium uppercase">
                             {editingId ? "कॉन्फ़िगरेशन संपादित करें" : "या मैन्युअल कॉन्फ़िगरेशन जोड़ें"}
                           </span>
                           <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
                         </div>

                         {editingId && (
                           <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-2">
                             <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">संपादित किया जा रहा है: {phoneNumberId || editingId}</span>
                             <button onClick={cancelEditing} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline font-medium">रद्द करें (Cancel)</button>
                           </div>
                         )}

                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">WhatsApp Phone Number ID</label>
                           <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="e.g. 10423049583..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">WhatsApp Business Account ID (WABA ID) <span className="text-indigo-500 font-normal">[टेंपलेट्स के लिए आवश्यक]</span></label>
                            <input type="text" value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="e.g. 109384729482..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="अपनी पसंद का कोई भी सीक्रेट टोकन डालें" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>

                         <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                           <h4 className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wider mb-4 flex items-center gap-2">
                             <PhoneCall className="w-4 h-4 text-emerald-500" /> WhatsApp Voice Calling (SIP WebRTC)
                           </h4>
                           <div className="space-y-4">
                             <div>
                               <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">SIP URI</label>
                               <input type="text" value={""} onChange={e => {}} placeholder="e.g. sip:1234@your-sip-provider.com" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div>
                               <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">SIP WebSocket Server</label>
                               <input type="text" value={""} onChange={e => {}} placeholder="e.g. wss://your-sip-provider.com:8089/ws" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                 <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">SIP Username</label>
                                 <input type="text" value={""} onChange={e => {}} placeholder="Username" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                               <div>
                                 <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">SIP Password</label>
                                 <input type="password" value={""} onChange={e => {}} placeholder="Password" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                             </div>
                           </div>
                         </div>

                         {webhookUrl && (
                           <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl">
                             <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mb-1">Meta Developer Dashboard में यह Webhook URL डालें:</p>
                             <code className="text-xs text-indigo-600 dark:text-indigo-400 break-all select-all">{webhookUrl}</code>
                           </div>
                         )}

                         <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                           <h4 className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wider mb-4 flex items-center gap-2">
                             <Bot className="w-4 h-4 text-indigo-500" /> चैटबॉट (Chatbot) और AI सेटिंग्स
                           </h4>
                           <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">ऑटो-रिप्लाई मोड</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'manual' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'manual' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">मैन्युअल (Manual)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">ऑटो-रिप्लाई बंद रखें। मैं खुद जवाब दूंगा।</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'ai' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'ai' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">AI चैटबॉट</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">कृत्रिम बुद्धिमत्ता (AI) द्वारा स्मार्ट जवाब।</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'rule_based' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'rule_based' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">रूल्स (Rule-based)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">पहले से सेट किए गए कीवर्ड्स के आधार पर।</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2 flex gap-3">
                           <button onClick={saveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2">
                             {saving ? "सुरक्षित किया जा रहा है..." : (editingId ? "अपडेट करें" : "नया अकाउंट जोड़ें")}
                           </button>
                           {editingId && (
                             <button onClick={cancelEditing} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                               रद्द करें
                             </button>
                           )}
                         </div>
                         {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">{message}</p>}
                     </div>
                 </div>

                 {/* Connected Accounts Table */}
                 <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display flex items-center gap-2">
                       <Phone className="w-5 h-5 text-indigo-500" /> कनेक्टेड WhatsApp अकाउंट्स (Connected WABAs)
                     </h3>
                     <p className="text-sm text-zinc-500 mb-6">इस वर्कस्पेस में कॉन्फ़िगर किए गए सभी सक्रिय WhatsApp नंबर और लाइन्स।</p>
                     
                     {configs.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/30">
                           कोई कनेक्टेड अकाउंट नहीं मिला। शुरू करने के लिए ऊपर से एक अकाउंट जोड़ें।
                        </div>
                     ) : (
                        <div className="overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950">
                           <table className="w-full text-left border-collapse text-sm">
                              <thead>
                                 <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold">
                                    <th className="p-4">Phone Number ID</th>
                                     <th className="p-4">WABA ID</th>
                                    <th className="p-4">ऑटो-रिप्लाई मोड</th>
                                    <th className="p-4">कनेक्टेड तिथि</th>
                                    <th className="p-4 text-right">कार्रवाई (Actions)</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {configs.map((cfg) => (
                                    <tr key={cfg.id} className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                       <td className="p-4 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{cfg.phone_number_id}</td>
                                        <td className="p-4 font-mono text-xs text-zinc-500">{cfg.waba_id || 'N/A'}</td>
                                       <td className="p-4">
                                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                             cfg.reply_mode === 'ai' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400' :
                                             cfg.reply_mode === 'rule_based' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                             'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                          }`}>
                                             {cfg.reply_mode === 'ai' ? '🤖 AI Bot' : cfg.reply_mode === 'rule_based' ? '⚡ Rules' : '👤 Manual'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-zinc-500">{cfg.created_at ? formatUserDateOnly(cfg.created_at) : 'N/A'}</td>
                                       <td className="p-4 text-right flex justify-end gap-2">
                                          <button onClick={() => startEditing(cfg)} title="बदलें" className="p-2 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-all">
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => deleteConfig(cfg.id)} title="हटाएं" className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
                                             <Trash2 className="w-4 h-4" />
                                          </button>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     )}
                 </div>


                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display">Social Accounts</h3>
                     <p className="text-sm text-zinc-500 mb-6">Instagram और Facebook पेजों को OAuth के माध्यम से कनेक्ट करें।</p>
                     
                     <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
                         <Megaphone className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-4" />
                         <p className="text-sm text-zinc-500 font-medium text-center">OAuth इंटीग्रेशन जल्द ही आ रहा है</p>
                     </div>
                 </div>
             </div>
        </div>
    )
}

function TemplatesView({ selectedWaba }: { selectedWaba?: any }) {
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
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">WhatsApp टेम्पलेट्स (Templates)</h2>
          <p className="text-sm text-zinc-500">अपने WhatsApp Business Account के स्वीकृत टेम्पलेट्स प्रबंधित करें और अभियान शुरू करें।</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchTemplates} disabled={syncing} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2">
            <Activity className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Meta से सिंक करें
          </button>
          <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md shadow-indigo-600/10 flex items-center gap-2">
            <Plus className="w-4 h-4" /> नया टेम्पलेट बनाएं
          </button>
        </div>
      </div>

      <div className="border-b border-zinc-200 dark:border-zinc-800 flex gap-4">
        <button onClick={() => setActiveSubTab('meta')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'meta' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
          <Megaphone className="w-4 h-4" /> Meta API स्वीकृत ({metaTemplates.length})
        </button>
        <button onClick={() => setActiveSubTab('local')} className={`py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 px-1 ${activeSubTab === 'local' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
          <FileText className="w-4 h-4" /> लोकल ड्राफ्ट्स ({localTemplates.length})
        </button>
      </div>

      {metaError && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-xs text-amber-800 dark:text-amber-400 flex flex-col gap-1">
          <span className="font-bold text-sm">Meta API सिंक चेतावनी (Sync Warning):</span>
          <span>{metaError}</span>
          <span className="mt-2 text-zinc-500">सुझाव: सुनिश्चित करें कि सेटिंग्स में मान्य WABA ID और Permanent Access Token सेट किया गया है। तब तक आप लोकल ड्राफ्ट्स का उपयोग कर सकते हैं।</span>
        </div>
      )}

      {templatesToShow.length === 0 ? (
        <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950/30 flex flex-col items-center justify-center">
          <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4 animate-pulse" />
          <h3 className="font-bold text-lg text-zinc-800 dark:text-zinc-200 mb-1">कोई टेम्पलेट नहीं मिला</h3>
          <p className="text-sm text-zinc-500 max-w-md">इस श्रेणी में कोई सक्रिय टेम्पलेट उपलब्ध नहीं है। आप सीधे नया टेम्पलेट बना सकते हैं।</p>
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
                  <span>भाषा: <span className="font-mono text-zinc-600 dark:text-zinc-400">{tmpl.language}</span></span>
                  {tmpl.is_meta && <span className="text-indigo-500 font-semibold flex items-center gap-1">● Meta API</span>}
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-900/50 p-4 flex gap-3">
                <button onClick={() => openSendModal(tmpl)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">
                  <Send className="w-3.5 h-3.5" /> टेम्पलेट भेजें
                </button>
                {!tmpl.is_meta && (
                  <button onClick={() => handleDeleteLocalTemplate(tmpl.id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all" title="हटाएं">
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
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">नया टेम्पलेट बनाएं</h3>
                <p className="text-xs text-zinc-500">टेम्पलेट सीधे Meta API पर सबमिट किया जाएगा</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">टेम्पलेट नाम (Alphanumeric and underscores only)</label>
                <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="e.g. welcome_offer_new" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">श्रेणी (Category)</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                    <option value="UTILITY">UTILITY (उपयोगिता)</option>
                    <option value="MARKETING">MARKETING (विपणन)</option>
                    <option value="AUTHENTICATION">AUTHENTICATION (प्रमाणीकरण)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">भाषा (Language Code)</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono">
                    <option value="en_US">en_US (अंग्रेज़ी)</option>
                    <option value="hi_IN">hi_IN (हिंदी)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">टेम्पलेट बॉडी टेक्स्ट (Template Body)</label>
                <textarea rows={4} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder="नमस्ते {{1}}, आपके ऑर्डर {{2}} की पुष्टि हो गई है!" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 resize-none" required />
                <p className="text-[10px] text-zinc-400 mt-1.5">पैरामीटर वेरिएबल जोड़ने के लिए {"{{1}}"}, {"{{2}}"} आदि का उपयोग करें।</p>
              </div>

              {createMessage && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-950/30 rounded-xl text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  {createMessage}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button type="submit" disabled={createLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  {createLoading ? "प्रसंस्करण हो रहा है..." : "टेम्पलेट सबमिट करें"}
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 rounded-xl text-sm font-medium transition-all">
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
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900">
              <div>
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">टेम्पलेट संदेश भेजें</h3>
                <p className="text-xs text-zinc-500">टेम्पलेट: <span className="font-mono">{selectedTemplate.name}</span></p>
              </div>
              <button onClick={() => setShowSendModal(false)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendTemplate} className="p-6 space-y-4">
              {configs.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">प्रेषक नंबर (Sender WABA)</label>
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
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">प्राप्तकर्ता का मोबाइल नंबर (देश कोड के साथ)</label>
                <input type="text" value={recipient} onChange={e => setRecipient(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="e.g. +919876543210" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono" required />
              </div>

              {paramValues.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">पैरामीटर मान (Dynamic Values)</h4>
                  {paramValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-12 text-xs font-bold font-mono text-indigo-500 text-center bg-indigo-50 dark:bg-indigo-950/20 py-2 rounded-lg border border-indigo-100 dark:border-indigo-950/30">
                        {"{{" + (idx + 1) + "}}"}
                      </span>
                      <input type="text" value={val} onChange={e => {
                        const copy = [...paramValues];
                        copy[idx] = e.target.value;
                        setParamValues(copy);
                      }} placeholder={`वैल्यू दर्ज करें (Value for {{${idx+1}}})`} className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500" required />
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-400">पूर्वावलोकन (Preview):</span>
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
                  {sendLoading ? "भेजा जा रहा है..." : "टेम्पलेट भेजें"}
                </button>
                <button type="button" onClick={() => setShowSendModal(false)} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 rounded-xl text-sm font-medium transition-all">
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

function ContactsView({
  setActiveTab,
  setActiveChat
}: {
  setActiveTab: (tab: activeTab) => void,
  setActiveChat: (chat: any) => void
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subTab, setSubTab] = useState<'all' | 'leads'>('all');

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAdditionalPhone, setFormAdditionalPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formInstagram, setFormInstagram] = useState("");
  const [formFacebook, setFormFacebook] = useState("");
  const [formWhatsApp, setFormWhatsApp] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsLead, setFormIsLead] = useState(false);
  const [formLeadStatus, setFormLeadStatus] = useState("new");
  const [formLeadSource, setFormLeadSource] = useState("manual");
  const [formLeadValue, setFormLeadValue] = useState("0");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedContacts = results.data;
        const wId = localStorage.getItem('workspaceId');

        try {
          const res = await fetch('/api/crm/contacts/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-workspace-id': wId || ''
            },
            body: JSON.stringify({ contacts: parsedContacts })
          });

          const data: any = await res.json();
          if (data.success) {
            alert(`सफलतापूर्वक ${data.imported} संपर्क आयात किए गए (Successfully imported ${data.imported} contacts)`);
            loadContacts();
          } else {
            alert(data.error || 'संपर्क आयात करने में विफल');
          }
        } catch (error) {
          alert('संपर्क आयात करते समय त्रुटि हुई');
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error: any) => {
        alert('CSV पार्स करने में विफल: ' + error.message);
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };
  const loadContacts = () => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/crm/contacts', {
      headers: { 'x-workspace-id': wId || '' }
    })
    .then(res => res.json())
    .then((data: any) => {
      if (data.contacts) {
        setContacts(data.contacts);
      }
    })
    .catch(e => console.error(e));
  };

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/crm/contacts', {
      headers: { 'x-workspace-id': wId || '' }
    })
    .then(res => res.json())
    .then((data: any) => {
      if (data.contacts) {
        setContacts(data.contacts);
      }
      setLoading(false);
    })
    .catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const openAddModal = () => {
    setIsEdit(false);
    setSelectedContactId(null);
    setFormName("");
    setFormPhone("");
    setFormAdditionalPhone("");
    setFormEmail("");
    setFormGender("Male");
    setFormInstagram("");
    setFormFacebook("");
    setFormWhatsApp("");
    setFormNotes("");
    setFormIsLead(false);
    setFormLeadStatus("new");
    setFormLeadSource("manual");
    setFormLeadValue("0");
    setShowModal(true);
  };

  const openEditModal = (c: any) => {
    setIsEdit(true);
    setSelectedContactId(c.id);
    setFormName(c.name || "");
    const safePhone = c.phone || c.platform_contact_id || "";
    setFormPhone(safePhone ? (safePhone.startsWith('+') ? safePhone : '+' + safePhone) : "");
    const safeAddPhone = c.additional_phone || "";
    setFormAdditionalPhone(safeAddPhone ? (safeAddPhone.startsWith('+') ? safeAddPhone : '+' + safeAddPhone) : "");
    setFormEmail(c.email || "");
    setFormGender(c.gender || "Male");
    setFormInstagram(c.instagram_username || "");
    setFormFacebook(c.facebook_username || "");
    setFormWhatsApp(c.whatsapp_username || "");
    setFormNotes(c.notes || "");
    setFormIsLead(c.is_lead === 1 || c.is_lead === true);
    setFormLeadStatus(c.lead_status || "new");
    setFormLeadSource(c.lead_source || "manual");
    setFormLeadValue(String(c.lead_value || 0));
    setShowModal(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone) {
      alert("कृपया नाम और फ़ोन नंबर भरें।");
      return;
    }
    if (!isValidPhoneNumber(formPhone)) {
      alert("मुख्य फ़ोन नंबर अमान्य है। कृपया सही नंबर और देश चुनें। (Invalid phone number)");
      return;
    }
    if (formAdditionalPhone && !isValidPhoneNumber(formAdditionalPhone)) {
      alert("अतिरिक्त फ़ोन नंबर अमान्य है। (Invalid additional phone number)");
      return;
    }

    const sanitizedPhone = formPhone.startsWith('+') ? formPhone.slice(1) : formPhone;
    const sanitizedAdditionalPhone = (formAdditionalPhone || "").startsWith('+') ? formAdditionalPhone.slice(1) : formAdditionalPhone;

    try {
      const wId = localStorage.getItem('workspaceId');
      const payload = {
        name: formName,
        phone: sanitizedPhone,
        additional_phone: sanitizedAdditionalPhone,
        email: formEmail,
        gender: formGender,
        instagram_username: formInstagram,
        facebook_username: formFacebook,
        whatsapp_username: formWhatsApp,
        notes: formNotes,
        is_lead: formIsLead ? 1 : 0,
        lead_status: formLeadStatus,
        lead_source: formLeadSource,
        lead_value: Number(formLeadValue) || 0
      };

      const url = isEdit ? `/api/crm/contacts/${selectedContactId}` : '/api/crm/contacts';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify(payload)
      });

      const data: any = await res.json();
      if (res.ok || data.success) {
        setShowModal(false);
        loadContacts();
      } else {
        alert(data.error || "संपर्क सहेजने में विफल");
      }
    } catch (err) {
      alert("त्रुटि हुई");
    }
  };

  const deleteContact = async (id: string) => {
    if (!confirm("क्या आप वाकई इस संपर्क को हटाना चाहते हैं?")) return;
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/crm/contacts/${id}`, {
        method: 'DELETE',
        headers: {
          'x-workspace-id': wId || ''
        }
      });
      if (res.ok) {
        loadContacts();
      } else {
        alert("हटाने में विफल");
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const initiateWhatsAppChat = async (contactId: string) => {
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch('/api/inbox/conversations/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({ contactId })
      });
      const data: any = await res.json();
      if (data.success && data.conversation) {
        setActiveChat(data.conversation);
        setActiveTab('inbox');
      } else {
        alert(data.error || "चैट शुरू करने में असमर्थ। कृपया WhatsApp सेटिंग्स की जांच करें।");
      }
    } catch (e) {
      alert("चैट शुरू करने में त्रुटि हुई");
    }
  };

  const filteredContacts = contacts.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || c.platform_contact_id || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.instagram_username || "").toLowerCase().includes(q) ||
      (c.facebook_username || "").toLowerCase().includes(q) ||
      (c.whatsapp_username || "").toLowerCase().includes(q)
    );
  });

  // Kanban Pipeline Stages
  const stages = [
    { key: 'new', label: 'नई लीड (New)', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    { key: 'contacted', label: 'संपर्कित (Contacted)', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    { key: 'qualified', label: 'योग्य (Qualified)', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    { key: 'closed_won', label: 'सफल (Won)', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    { key: 'closed_lost', label: 'विफल (Lost)', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800' }
  ];

  const leads = contacts.filter(c => c.is_lead === 1 || c.is_lead === true);

  const getStageStats = (stageKey: string) => {
    const stageLeads = leads.filter(l => (l.lead_status || 'new') === stageKey);
    const totalValue = stageLeads.reduce((acc, curr) => acc + (Number(curr.lead_value) || 0), 0);
    return { count: stageLeads.length, totalValue };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-xs">
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setSubTab('all')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'all' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
          >
            सभी संपर्क (All Contacts)
          </button>
          <button
            onClick={() => setSubTab('leads')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'leads' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
          >
            लीड्स पाइपलाइन (Leads Pipeline)
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} /> {importing ? 'आयात हो रहा है...' : 'CSV से आयात करें (Import)'}
          </button>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/15 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> नया संपर्क जोड़ें (Add Contact)
          </button>
        </div>
      </div>

      {subTab === 'all' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="नाम, नंबर, ईमेल या सोशल आईडी से खोजें..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:border-indigo-500 text-sm transition-all shadow-xs"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-zinc-500">संपर्क लोड हो रहे हैं...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
              <Users className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">कोई संपर्क नहीं मिला।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map(c => (
                <div key={c.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    {/* Header: Name and badges */}
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 text-base flex items-center gap-1.5">
                          {c.name}
                        </h3>
                        {c.gender && (
                          <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 font-medium">
                            {c.gender === 'Male' ? 'पुरुष (Male)' : c.gender === 'Female' ? 'महिला (Female)' : c.gender}
                          </span>
                        )}
                      </div>
                      
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          c.lead_status === 'closed_won' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                          c.lead_status === 'closed_lost' ? 'bg-red-500/10 text-red-600 border-red-200' :
                          'bg-indigo-500/10 text-indigo-600 border-indigo-200'
                        }`}>
                          LEAD
                        </span>
                      )}
                    </div>

                    {/* Body Info */}
                    <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50 pt-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-zinc-400" />
                        <span><strong>मुख्य नंबर:</strong> {c.phone || c.platform_contact_id}</span>
                      </div>
                      {c.additional_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          <span><strong>अतिरिक्त नंबर:</strong> {c.additional_phone}</span>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="truncate"><strong>ईमेल:</strong> {c.email}</span>
                        </div>
                      )}

                      {/* Social handles */}
                      {(c.instagram_username || c.facebook_username || c.whatsapp_username) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {c.instagram_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-pink-500/5 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded border border-pink-500/10">
                              <Instagram className="w-3 h-3" /> {c.instagram_username}
                            </span>
                          )}
                          {c.facebook_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-blue-500/5 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/10">
                              <Facebook className="w-3 h-3" /> {c.facebook_username}
                            </span>
                          )}
                          {c.whatsapp_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/10">
                              <MessageSquare className="w-3 h-3" /> {c.whatsapp_username}
                            </span>
                          )}
                        </div>
                      )}

                      {c.notes && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40 text-[11px] text-zinc-500 mt-2 italic">
                          &ldquo;{c.notes}&rdquo;
                        </div>
                      )}

                      {/* Lead Details summary */}
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <div className="mt-3 p-2 bg-indigo-50/40 dark:bg-indigo-950/10 rounded-lg border border-indigo-100/40 space-y-1 text-[11px]">
                          <div className="flex justify-between text-zinc-500">
                            <span>लीड स्टेटस:</span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase">{c.lead_status || 'new'}</span>
                          </div>
                          <div className="flex justify-between text-zinc-500">
                            <span>लीड सोर्स:</span>
                            <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">{c.lead_source || 'manual'}</span>
                          </div>
                          <div className="flex justify-between text-zinc-500">
                            <span>अनुमानित मूल्य:</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">₹{(c.lead_value || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                    <button
                      onClick={() => initiateWhatsAppChat(c.id)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Send className="w-3.5 h-3.5" /> WhatsApp चैट
                    </button>
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-400 transition-all"
                      title="Edit Contact"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteContact(c.id)}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 rounded-xl text-zinc-600 dark:text-zinc-400 transition-all"
                      title="Delete Contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Leads Pipeline Board View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stages.map(stage => {
              const { count, totalValue } = getStageStats(stage.key);
              const stageLeads = leads.filter(l => (l.lead_status || 'new') === stage.key);
              return (
                <div key={stage.key} className="bg-zinc-100/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 rounded-2xl p-4 flex flex-col min-h-[500px]">
                  {/* Stage Header */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-zinc-700 dark:text-zinc-300">{stage.label}</span>
                      <span className="bg-zinc-200 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-bold">{count}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-1 font-mono">
                      <Coins className="w-3 h-3 text-amber-500" /> Value: ₹{totalValue.toLocaleString()}
                    </div>
                  </div>

                  {/* Stage Lead Cards */}
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {stageLeads.length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                        कोई लीड नहीं
                      </div>
                    ) : (
                      stageLeads.map(lead => (
                        <div key={lead.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl p-3 shadow-xs hover:shadow-md transition-all space-y-2">
                          <div>
                            <h4 className="font-medium text-xs text-zinc-900 dark:text-zinc-100 truncate">{lead.name}</h4>
                            <span className="text-[10px] text-zinc-500">{lead.phone || lead.platform_contact_id}</span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-zinc-500">
                            <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded capitalize">{lead.lead_source || 'manual'}</span>
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">₹{(lead.lead_value || 0).toLocaleString()}</span>
                          </div>

                          {/* Fast Action Buttons */}
                          <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                            <button
                              onClick={() => initiateWhatsAppChat(lead.id)}
                              className="flex-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] py-1 rounded-md font-bold flex items-center justify-center gap-1 transition-all"
                            >
                              <Send className="w-2.5 h-2.5" /> चैट
                            </button>
                            <button
                              onClick={() => openEditModal(lead)}
                              className="p-1 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 transition-all"
                            >
                              <Edit className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit/Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
              <h2 className="font-bold text-zinc-950 dark:text-white text-base">
                {isEdit ? "संपर्क संपादित करें (Edit Contact)" : "नया संपर्क जोड़ें (Add New Contact)"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={saveContact} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">पूरा नाम (Full Name) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="उदा. राहुल शर्मा"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Primary Phone */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">मुख्य फ़ोन नंबर (Phone) *</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    required
                    value={formPhone}
                    onChange={(val) => setFormPhone(val || '')}
                    placeholder="फ़ोन नंबर दर्ज करें"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Additional Phone */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">अतिरिक्त फ़ोन नंबर</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={formAdditionalPhone}
                    onChange={(val) => setFormAdditionalPhone(val || '')}
                    placeholder="अतिरिक्त नंबर दर्ज करें"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">ईमेल (Email)</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="उदा. rahul@example.com"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">लिंग (Gender)</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="Male">पुरुष (Male)</option>
                    <option value="Female">महिला (Female)</option>
                    <option value="Other">अन्य (Other)</option>
                  </select>
                </div>

                {/* Instagram */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">इंस्टाग्राम यूजरनेम</label>
                  <input
                    type="text"
                    value={formInstagram}
                    onChange={(e) => setFormInstagram(e.target.value)}
                    placeholder="उदा. rahul_sharma"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Facebook */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">फेसबुक यूजरनेम</label>
                  <input
                    type="text"
                    value={formFacebook}
                    onChange={(e) => setFormFacebook(e.target.value)}
                    placeholder="उदा. rahul.sharma.fb"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* WhatsApp Username */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">व्हाट्सएप यूजरनेम / उपनाम</label>
                  <input
                    type="text"
                    value={formWhatsApp}
                    onChange={(e) => setFormWhatsApp(e.target.value)}
                    placeholder="उदा. Rahul S"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">नोट्स / टिप्पणियां</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="संपर्क के बारे में अतिरिक्त जानकारी..."
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500 h-20 resize-none"
                  />
                </div>

                {/* Is Lead Toggle */}
                <div className="sm:col-span-2 bg-zinc-50 dark:bg-zinc-800/20 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">क्या यह लीड है? (Mark as Lead)</h4>
                    <p className="text-[10px] text-zinc-400">लीड के रूप में चिह्नित करने पर आप इसे सेल्स फनल में ट्रैक कर पाएंगे।</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsLead}
                    onChange={(e) => setFormIsLead(e.target.checked)}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                {/* Lead fields displayed conditionally */}
                {formIsLead && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-indigo-50/20 dark:bg-indigo-950/5 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-900/10">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">लीड स्टेटस</label>
                      <select
                        value={formLeadStatus}
                        onChange={(e) => setFormLeadStatus(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      >
                        <option value="new">नई लीड (New)</option>
                        <option value="contacted">संपर्क किया (Contacted)</option>
                        <option value="qualified">योग्य लीड (Qualified)</option>
                        <option value="closed_won">सफल (Closed Won)</option>
                        <option value="closed_lost">विफल (Closed Lost)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">लीड सोर्स</label>
                      <select
                        value={formLeadSource}
                        onChange={(e) => setFormLeadSource(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      >
                        <option value="website">वेबसाइट (Website)</option>
                        <option value="facebook">फेसबुक (Facebook)</option>
                        <option value="instagram">इंस्टाग्राम (Instagram)</option>
                        <option value="whatsapp">व्हाट्सएप (WhatsApp)</option>
                        <option value="referral">रेफरल (Referral)</option>
                        <option value="manual">मैनुअल (Manual)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">अनुमानित मूल्य (Value ₹)</label>
                      <input
                        type="number"
                        value={formLeadValue}
                        onChange={(e) => setFormLeadValue(e.target.value)}
                        placeholder="उदा. 15000"
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {isEdit ? "बदलाव सहेजें" : "संपर्क सहेजें"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all"
                >
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

// ==========================================
// CALLING FEATURES COMPONENT IMPLEMENTATIONS
// ==========================================

function CallsView({ 
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
    alert('WhatsApp Outbound calls abhi supported nahi hain. Sirf incoming calls receive ho sakti hain.');
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
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">कॉल प्रबंधन और इतिहास (Calling Management)</h2>
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
                ? 'WhatsApp Calling ready: incoming calls receive hongi.'
                : `WhatsApp Calling setup incomplete: webhook ${health.webhook_subscribed ? 'OK' : 'missing'}, TURN ${health.turn_configured ? 'OK' : 'missing'}. Settings jaake check karein.`}
            </span>
          </div>
          <button
            onClick={() => fetchCallsAndConfigs()}
            className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-current opacity-80 hover:opacity-100"
          >
            Refresh
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
                  <th className="px-6 py-3">अवधि (Duration)</th>
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
                          {call.status === 'completed' || call.status === 'answered' ? 'सफल' : call.status === 'missed' ? 'छूट गया (Missed)' : 'अस्वीकृत'}
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

function ActiveCallManager({ activeCall, setActiveCall, onHangup, remoteStream, localStream }: { activeCall: any, setActiveCall: any, onHangup?: () => void, remoteStream?: MediaStream | null, localStream?: MediaStream | null }) {
  const [callStartMs, setCallStartMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const seconds = callStartMs ? Math.floor((nowMs - callStartMs) / 1000) : 0;
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted, localStream]);

  // Track call start and current time for elapsed display
  // Synchronizes React state with an external clock — a legitimate use of setState in an effect
  useEffect(() => {
    if (activeCall.status === 'connected') {
      const startMs = Date.now();
      /* eslint-disable react-hooks/set-state-in-effect */
      setCallStartMs(startMs);
      setNowMs(startMs);
      /* eslint-enable react-hooks/set-state-in-effect */
      const interval = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [activeCall.status]);

  // Recording handled by useWhatsAppWebRTC hook (uploaded on hangup)

  const endCall = async () => {
    try {
      if (onHangup) {
        await onHangup();
      }
      await fetch(`/api/whatsapp/calls/${activeCall.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': activeCall.workspace_id
        },
        body: JSON.stringify({ status: 'completed', duration: seconds })
      });
    } catch(e) {}
    setActiveCall(null);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm text-indigo-400 shadow-inner">
          {activeCall.contact_name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-white truncate">{activeCall.contact_name || 'अज्ञात'}</h4>
          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
            {activeCall.status === 'ringing' 
              ? (activeCall.direction === 'incoming' ? 'कॉल आ रही है...' : 'डायल हो रहा है...') 
              : 'कॉल कनेक्टेड'}
          </p>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-bold text-emerald-400">
            {activeCall.status === 'ringing' ? '00:00' : formatDuration(seconds)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <div className="flex gap-2">
          {/* Mute toggle button */}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 px-2.5 rounded-lg text-[10px] font-bold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>

          {/* Speaker toggle button */}
          <button 
            onClick={() => setIsSpeaker(!isSpeaker)}
            className="p-1.5 px-2.5 rounded-lg text-[10px] font-bold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            title="Speaker"
          >
            Speaker
          </button>
          {/* Recording handled by useWhatsAppWebRTC hook */}
        </div>

        {/* End Call Button */}
        <button
          onClick={endCall}
          className="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors shadow-lg shadow-rose-500/20 flex items-center gap-1.5"
        >
          <X className="w-3 h-3" />
          काटें (End)
        </button>
      </div>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

function IntegrationsView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">इंटीग्रेशन्स (Integrations)</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            अपने अकाउंट को अन्य सेवाओं से कनेक्ट करें। (Connect your account with other services)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Google Contacts</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                अपने Google Contacts को सिंक करें। (Sync your Google Contacts)
              </p>
            </div>
          </div>
          <div className="mt-auto pt-4 flex gap-3">
             <button disabled className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 py-2 rounded-xl text-sm font-medium cursor-not-allowed">
               Coming Soon
             </button>
          </div>
        </div>
        
        {/* Placeholder for future integrations */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 border-dashed flex flex-col gap-4 opacity-50">
           <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-xl flex items-center justify-center shrink-0">
              <Blocks className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Future Integration</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                More integrations coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppManagerView() {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'profiles' | 'templates' | 'flows'>('profiles');
  
  // Profiles states
  const [configs, setConfigs] = useState<any[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [message, setMessage] = useState("");
  
  // Profile Form fields
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [replyMode, setReplyMode] = useState("manual");
  const [sipUri, setSipUri] = useState("");
  const [sipWsServer, setSipWsServer] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiVoiceInstructions, setAiVoiceInstructions] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [metaConfigId, setMetaConfigId] = useState("");

  // Business Profile states
  const [profileAbout, setProfileAbout] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");

  // Call Schedule states
  const [callScheduleEnabled, setCallScheduleEnabled] = useState(false);
  const [callScheduleStart, setCallScheduleStart] = useState("09:00");
  const [callScheduleEnd, setCallScheduleEnd] = useState("17:00");
  const [callScheduleDays, setCallScheduleDays] = useState<number[]>([1,2,3,4,5]);
  const [callingEnabledSettings, setCallingEnabledSettings] = useState(true);

  // Flows states
  const [flows, setFlows] = useState<any[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any>(null);
  
  // Flow Builder states
  const [flowName, setFlowName] = useState("");
  const [flowCategory, setFlowCategory] = useState("UTILITY");
  const [flowScreens, setFlowScreens] = useState<any[]>([
    {
      id: "screen_1",
      title: "मुख्य स्क्रीन (Main)",
      components: [
        { id: "c1", type: "text", label: "विवरण", content: "कृप्या अपनी जानकारी दर्ज करें।" },
        { id: "c2", type: "input", label: "आपका नाम (Full Name)", name: "fullName", placeholder: "उदा. राहुल कुमार", required: true },
        { id: "c3", type: "input", label: "ईमेल पता (Email)", name: "email", placeholder: "उदा. rahul@example.com", required: true },
        { id: "c4", type: "submit", label: "प्रस्तुत करें (Submit)" }
      ]
    }
  ]);
  const [activeScreenId, setActiveScreenId] = useState("screen_1");
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

  // Load configs
  const loadConfigs = async (showLoading = false) => {
    if (showLoading) setLoadingConfigs(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/config', {
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.configs) {
        setConfigs(data.configs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Load flows
  const loadFlows = async (showLoading = false) => {
    if (showLoading) setLoadingFlows(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/flows', {
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.flows) {
        setFlows(data.flows);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFlows(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      loadConfigs();
      loadFlows();
      
      // Meta Config loading
      fetch('/api/config/meta')
        .then(r => r.json())
        .then((data: any) => {
          if (data.configId) setMetaConfigId(data.configId);
        }).catch(err => console.error(err));
    }, 0);
  }, []);

  // Facebook Signup Listener
  useEffect(() => {
    const sessionInfoListener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            const { phone_number_id, waba_id } = data.data;
            setMessage("Embedded Signup पूरा हुआ, सर्वर पर रजिस्टर किया जा रहा है...");
            
            fetch('/api/meta/embedded-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId: localStorage.getItem('workspaceId'),
                    accessToken: 'handled_by_system_user_in_backend',
                    wabaId: waba_id,
                    phoneNumberIds: Array.isArray(phone_number_id) ? phone_number_id : [phone_number_id]
                })
            }).then(r => r.json()).then((res: any) => {
                if (res.success) {
                    setMessage(`सफल! WhatsApp खाता जोड़ा गया: ${res.waba}`);
                    loadConfigs();
                } else {
                    setMessage(`त्रुटि: ${res.error}`);
                }
            }).catch(() => {
                setMessage("सर्वर से संपर्क करने में त्रुटि।");
            });
          }
        }
      } catch (e) {}
    };
    window.addEventListener('message', sessionInfoListener);
    return () => window.removeEventListener('message', sessionInfoListener);
  }, []);

  // Profile Save
  const handleSaveProfile = async () => {
    setSavingConfig(true);
    setMessage("");
    try {
      const payload: any = {
        id: editingConfig?.id || null,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        verify_token: verifyToken,
        reply_mode: replyMode,
        sip_uri: sipUri,
        sip_ws_server: sipWsServer,
        sip_username: sipUsername,
        sip_password: sipPassword,
        ai_provider: aiProvider,
        ai_voice_instructions: aiVoiceInstructions,
        // Business Profile fields
        about: profileAbout,
        description: profileDescription,
        website: profileWebsite,
        email: profileEmail,
        address: profileAddress,
        username: profileUsername,
        // Call settings
        calling_enabled: callingEnabledSettings ? 1 : 0,
        call_schedule: JSON.stringify({
          enabled: callScheduleEnabled,
          start_time: callScheduleStart,
          end_time: callScheduleEnd,
          days: callScheduleDays
        })
      };
      if (accessToken && accessToken !== "••••••••••••••••") {
        payload.access_token = accessToken;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setMessage("सफलतापूर्वक सहेज लिया गया!");
        setShowProfileModal(false);
        loadConfigs();
      } else {
        setMessage("त्रुटि: " + (data.error || "सहेजने में असमर्थ"));
      }
    } catch (e) {
      setMessage("सर्वर त्रुटि");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEditProfile = (cfg: any) => {
    setEditingConfig(cfg);
    setPhoneNumberId(cfg.phone_number_id || "");
    setWabaId(cfg.waba_id || "");
    setAccessToken("••••••••••••••••");
    setVerifyToken(cfg.verify_token || "");
    setReplyMode(cfg.reply_mode || "manual");
    setSipUri(cfg.sip_uri || "");
    setSipWsServer(cfg.sip_ws_server || "");
    setSipUsername(cfg.sip_username || "");
    setSipPassword(cfg.sip_password || "");
    setAiProvider(cfg.ai_provider || "gemini");
    setAiVoiceInstructions(cfg.ai_voice_instructions || "");
    setShowProfileModal(true);

    // Business Profile fields
    setProfileAbout(cfg.about || "");
    setProfileDescription(cfg.description || "");
    setProfileWebsite(cfg.website || "");
    setProfileEmail(cfg.email || "");
    setProfileAddress(cfg.address || "");
    setProfileUsername(cfg.username || "");
    setProfilePictureUrl(cfg.profile_picture_url || "");

    // Call schedule
    setCallingEnabledSettings(cfg.calling_enabled !== 0);
    if (cfg.call_schedule) {
      try {
        const s = JSON.parse(cfg.call_schedule);
        setCallScheduleEnabled(s.enabled || false);
        setCallScheduleStart(s.start_time || "09:00");
        setCallScheduleEnd(s.end_time || "17:00");
        setCallScheduleDays(s.days || [1,2,3,4,5]);
      } catch (e) {}
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("क्या आप वाकई इस प्रोफाइल को हटाना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/config/${id}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadConfigs();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const handleCreateFlow = () => {
    setEditingFlow(null);
    setFlowName("");
    setFlowCategory("UTILITY");
    setFlowScreens([
      {
        id: "screen_1",
        title: "मुख्य स्क्रीन (Main)",
        components: [
          { id: "c1", type: "text", label: "विवरण", content: "कृप्या अपनी जानकारी दर्ज करें।" },
          { id: "c2", type: "input", label: "आपका नाम (Full Name)", name: "fullName", placeholder: "उदा. राहुल कुमार", required: true },
          { id: "c3", type: "input", label: "ईमेल पता (Email)", name: "email", placeholder: "उदा. rahul@example.com", required: true },
          { id: "c4", type: "submit", label: "प्रस्तुत करें (Submit)" }
        ]
      }
    ]);
    setActiveScreenId("screen_1");
    setSelectedCompId(null);
    setShowFlowModal(true);
  };

  const handleEditFlow = (flow: any) => {
    setEditingFlow(flow);
    setFlowName(flow.name);
    setFlowCategory(flow.categories || "UTILITY");
    try {
      const parsed = JSON.parse(flow.screens_json);
      setFlowScreens(parsed);
      if (parsed.length > 0) {
        setActiveScreenId(parsed[0].id);
      }
    } catch (e) {
      console.error(e);
    }
    setSelectedCompId(null);
    setShowFlowModal(true);
  };

  const handleSaveFlow = async () => {
    if (!flowName.trim()) {
      alert("फ़्लो का नाम आवश्यक है");
      return;
    }
    try {
      const payload = {
        id: editingFlow?.id || null,
        name: flowName,
        categories: flowCategory,
        screens_json: JSON.stringify(flowScreens),
        status: editingFlow?.status || 'DRAFT'
      };
      const res = await fetch('/api/whatsapp/flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setShowFlowModal(false);
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("सहेजने में विफलता");
    }
  };

  const handleDeleteFlow = async (id: string) => {
    if (!confirm("क्या आप वाकई इस फ़्लो को हटाना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/flows/${id}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const handlePublishFlow = async (id: string) => {
    if (!confirm("क्या आप इस फ़्लो को लाइव/प्रकाशित करना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/flows/${id}/publish`, {
        method: 'POST',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  // Add Component to current active screen
  const addFlowComponent = (type: string) => {
    const activeScreen = flowScreens.find(s => s.id === activeScreenId);
    if (!activeScreen) return;

    const newComp: any = {
      id: crypto.randomUUID().substring(0, 8),
      type
    };

    if (type === 'text') {
      newComp.label = "विवरण";
      newComp.content = "यहाँ विवरण दर्ज करें...";
    } else if (type === 'input' || type === 'textarea') {
      newComp.label = "नई इनपुट फील्ड";
      newComp.placeholder = "दर्ज करें...";
      newComp.name = "field_" + newComp.id;
      newComp.required = false;
    } else if (type === 'select') {
      newComp.label = "ड्रॉपडाउन फील्ड";
      newComp.name = "select_" + newComp.id;
      newComp.options = "विकल्प 1, विकल्प 2, विकल्प 3";
    } else if (type === 'submit') {
      newComp.label = "प्रस्तुत करें (Submit)";
    }

    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        return {
          ...s,
          components: [...s.components, newComp]
        };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
    setSelectedCompId(newComp.id);
  };

  const updateComponentProperty = (compId: string, key: string, value: any) => {
    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        const updatedComps = s.components.map((c: any) => {
          if (c.id === compId) {
            return { ...c, [key]: value };
          }
          return c;
        });
        return { ...s, components: updatedComps };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
  };

  const deleteComponent = (compId: string) => {
    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        return {
          ...s,
          components: s.components.filter((c: any) => c.id !== compId)
        };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
    if (selectedCompId === compId) {
      setSelectedCompId(null);
    }
  };

  const activeScreen = flowScreens.find(s => s.id === activeScreenId);
  const selectedComponent = activeScreen?.components.find((c: any) => c.id === selectedCompId);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Upper Navigation & Tab Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Phone className="w-6 h-6 text-emerald-500" /> WhatsApp हब (WhatsApp Hub)
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            अपने कनेक्टेड प्रोफ़ाइल, टेम्पलेट्स और इंटरेक्टिव फ़्लो को प्रबंधित करें।
          </p>
        </div>
        
        {/* Sub Navigation Tabs */}
        <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0 w-full md:w-auto">
          <button 
            onClick={() => setActiveSubTab('profiles')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'profiles' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <User className="w-4 h-4 text-emerald-500" /> प्रोफ़ाइल (Profiles)
          </button>
          <button 
            onClick={() => setActiveSubTab('templates')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'templates' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <FileText className="w-4 h-4 text-indigo-500" /> टेम्पलेट्स (Templates)
          </button>
          <button 
            onClick={() => setActiveSubTab('flows')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'flows' ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            <Blocks className="w-4 h-4 text-amber-500" /> फ़्लो (Flows)
          </button>
        </div>
      </div>

      {/* Main SubTab Contents */}
      {activeSubTab === 'profiles' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
            <h3 className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              कनेक्टेड WhatsApp प्रोफ़ाइल ({configs.length})
            </h3>
            <div className="flex gap-3">
              {/* Meta Onboarding button */}
              <button 
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).FB) {
                    (window as any).FB.login((response: any) => {
                      if (response.authResponse) {
                        setMessage("Meta login सफल, Embedded Onboarding शुरू...");
                      } else {
                        setMessage("Meta login रद्द या त्रुटि।");
                      }
                    }, {
                      scope: 'whatsapp_business_management,whatsapp_business_messaging',
                      extras: {
                        feature: 'whatsapp_embedded_signup',
                        setup: {
                          prefill: {
                            business: {
                              name: 'Dhita CRM Workspace'
                            }
                          }
                        }
                      }
                    });
                  } else {
                    alert("Meta Facebook SDK लोड नहीं हुआ है। कृपया पेज रीलोड करें।");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
              >
                <Blocks className="w-4 h-4" /> ऑटो कनेक्ट (Embedded Signup)
              </button>
              
              <button 
                onClick={() => {
                  setEditingConfig(null);
                  setPhoneNumberId("");
                  setWabaId("");
                  setAccessToken("");
                  setVerifyToken("");
                  setReplyMode("manual");
                  setSipUri("");
                  setSipWsServer("");
                  setSipUsername("");
                  setSipPassword("");
                  setShowProfileModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> मैन्युअल जोड़ें (Add Manual)
              </button>
            </div>
          </div>

          {message && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900 flex justify-between items-center">
              <span className="text-sm font-medium">{message}</span>
              <button onClick={() => setMessage("")} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {loadingConfigs ? (
            <div className="p-12 text-center text-zinc-400">प्रोफ़ाइल लोड की जा रही हैं...</div>
          ) : configs.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950/30 flex flex-col items-center">
              <Phone className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4 animate-bounce" />
              <h4 className="font-bold text-lg mb-1">कोई सक्रिय खाता नहीं मिला</h4>
              <p className="text-sm text-zinc-500 max-w-sm mb-6">WhatsApp API का उपयोग शुरू करने के लिए एक खाता मैन्युअल रूप से जोड़ें या एम्बेडेड साइनअप का उपयोग करें।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {configs.map((cfg) => (
                <div key={cfg.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 font-display">
                          {cfg.phone_number_id ? `+${cfg.phone_number_id.substring(0,2)}...` : "WhatsApp API Line"}
                        </h4>
                        <p className="text-[11px] text-zinc-400 font-mono mt-1">ID: {cfg.id}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        cfg.reply_mode === 'ai' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' :
                        cfg.reply_mode === 'rule_based' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {cfg.reply_mode === 'ai' ? 'AI Bot' : cfg.reply_mode === 'rule_based' ? 'Rules' : 'Manual'}
                      </span>
                    </div>

                    <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
                      <div className="flex justify-between"><span className="text-zinc-400">Phone ID:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">{cfg.phone_number_id || "None"}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">WABA ID:</span> <span className="font-mono text-zinc-700 dark:text-zinc-300">{cfg.waba_id || "None"}</span></div>
                      {cfg.username && (
                        <div className="flex justify-between"><span className="text-zinc-400">Username:</span> <span className="font-mono text-indigo-600 dark:text-indigo-400">@{cfg.username}</span></div>
                      )}
                      {cfg.about && (
                        <div className="flex justify-between"><span className="text-zinc-400">About:</span> <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-[180px]">{cfg.about}</span></div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Calling:</span>
                        <span className={`font-mono ${cfg.calling_enabled ? 'text-emerald-500' : 'text-red-400'}`}>
                          {cfg.calling_enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                    <button onClick={() => handleEditProfile(cfg)} className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <Edit className="w-3.5 h-3.5" /> संपादित करें (Edit)
                    </button>
                    <button onClick={() => handleDeleteProfile(cfg.id)} className="p-2 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Profile Editor Modal */}
          {showProfileModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-zinc-200 dark:border-zinc-800 shadow-xl animate-in zoom-in-95 duration-250">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    {editingConfig ? "WhatsApp खाता संपादित करें" : "नया WhatsApp खाता जोड़ें"}
                  </h3>
                  <button onClick={() => setShowProfileModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Phone Number ID</label>
                      <input 
                        type="text" 
                        value={phoneNumberId} 
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        placeholder="e.g. 104523912..."
                        className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">WABA ID</label>
                      <input 
                        type="text" 
                        value={wabaId} 
                        onChange={(e) => setWabaId(e.target.value)}
                        placeholder="e.g. 104234059..."
                        className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Permanent Access Token</label>
                    <input 
                      type="password" 
                      value={accessToken} 
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={editingConfig ? "••••••••••••••••" : "EAA..."}
                      className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Webhook Verify Token</label>
                      <input 
                        type="text" 
                        value={verifyToken} 
                        onChange={(e) => setVerifyToken(e.target.value)}
                        placeholder="e.g. secureToken123"
                        className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">ऑटो-रिप्लाई मोड</label>
                      <select 
                        value={replyMode} 
                        onChange={(e) => setReplyMode(e.target.value)}
                        className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                      >
                        <option value="manual">मैन्युअल (Manual Reply Only)</option>
                        <option value="ai">AI चैटबॉट (AI Automated Answers)</option>
                        <option value="rule_based">रूल्स आधारित (Rule-based Answers)</option>
                      </select>
                    </div>
                  </div>

                  {replyMode === 'ai' && (
                    <div className="grid grid-cols-1 gap-4 bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">AI Provider</label>
                        <select
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value)}
                          className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="workers_ai">Cloudflare Workers AI (Llama 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Voice AI Agent Instructions (Gemini Voice)</label>
                        <textarea
                          value={aiVoiceInstructions}
                          onChange={(e) => setAiVoiceInstructions(e.target.value)}
                          placeholder="e.g. You are a helpful AI assistant for voice calls. Speak politely in Hindi."
                          className="w-full text-sm p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:border-indigo-500 outline-none h-20"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">ये निर्देश तब उपयोग किए जाएंगे जब कोई यूज़र WhatsApp पर वॉइस कॉल करेगा (WebRTC System Call)।</p>
                      </div>
                    </div>
                  )}

                  {/* Calling and WebRTC configuration sub-panel */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-3">SIP Calling / WebRTC Settings (Optional)</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">SIP Server WS Address</label>
                        <input 
                          type="text" 
                          value={sipWsServer} 
                          onChange={(e) => setSipWsServer(e.target.value)}
                          placeholder="wss://sip.example.com:443"
                          className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">SIP URI</label>
                          <input 
                            type="text" 
                            value={sipUri} 
                            onChange={(e) => setSipUri(e.target.value)}
                            placeholder="sip:100@sip.example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">SIP Username</label>
                          <input 
                            type="text" 
                            value={sipUsername} 
                            onChange={(e) => setSipUsername(e.target.value)}
                            placeholder="100"
                            className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">SIP Password</label>
                        <input 
                          type="password" 
                          value={sipPassword} 
                          onChange={(e) => setSipPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Business Profile Section */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-3">WhatsApp Business Profile</h4>
                    <div className="space-y-3">
                      {profilePictureUrl && (
                        <div className="flex justify-center mb-3">
                          <img src={profilePictureUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-zinc-200" />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">About (जानकारी / Description)</label>
                        <textarea
                          value={profileAbout}
                          onChange={(e) => setProfileAbout(e.target.value)}
                          placeholder="Your WhatsApp Business about text"
                          rows={2}
                          className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Description (विस्तृत विवरण)</label>
                        <textarea
                          value={profileDescription}
                          onChange={(e) => setProfileDescription(e.target.value)}
                          placeholder="Detailed business description"
                          rows={3}
                          className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Website</label>
                          <input 
                            type="url" 
                            value={profileWebsite} 
                            onChange={(e) => setProfileWebsite(e.target.value)}
                            placeholder="https://example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Email (ईमेल पता)</label>
                          <input 
                            type="email" 
                            value={profileEmail} 
                            onChange={(e) => setProfileEmail(e.target.value)}
                            placeholder="business@example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Address (पता)</label>
                        <input 
                          type="text" 
                          value={profileAddress} 
                          onChange={(e) => setProfileAddress(e.target.value)}
                          placeholder="123 Main St, City, Country"
                          className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">WhatsApp Username (@यूज़रनेम)</label>
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-400 text-xs font-mono">@</span>
                          <input 
                            type="text" 
                            value={profileUsername} 
                            onChange={(e) => setProfileUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                            placeholder="yourbusiness"
                            className="flex-1 text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">Only letters, numbers, underscore and dots</p>
                      </div>
                    </div>
                  </div>

                  {/* Call Settings Section */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-3">Call Settings (कॉल सेटिंग्स)</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Calling Enabled (कॉलिंग सक्षम)</label>
                        <button 
                          onClick={() => setCallingEnabledSettings(!callingEnabledSettings)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${callingEnabledSettings ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${callingEnabledSettings ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Call Schedule (कॉल शेड्यूल)</label>
                          <button 
                            onClick={() => setCallScheduleEnabled(!callScheduleEnabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${callScheduleEnabled ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${callScheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {callScheduleEnabled && (
                          <>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Start Time</label>
                                <input 
                                  type="time" 
                                  value={callScheduleStart} 
                                  onChange={(e) => setCallScheduleStart(e.target.value)}
                                  className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">End Time</label>
                                <input 
                                  type="time" 
                                  value={callScheduleEnd} 
                                  onChange={(e) => setCallScheduleEnd(e.target.value)}
                                  className="w-full text-xs p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-indigo-500 outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-zinc-400 mb-2">Active Days</label>
                              <div className="flex gap-1.5 flex-wrap">
                                {[
                                  { key: 1, label: 'S' },
                                  { key: 2, label: 'M' },
                                  { key: 3, label: 'T' },
                                  { key: 4, label: 'W' },
                                  { key: 5, label: 'T' },
                                  { key: 6, label: 'F' },
                                  { key: 7, label: 'S' },
                                ].map(d => (
                                  <button
                                    key={d.key}
                                    onClick={() => {
                                      setCallScheduleDays(prev => 
                                        prev.includes(d.key) 
                                          ? prev.filter(k => k !== d.key)
                                          : [...prev, d.key].sort()
                                      );
                                    }}
                                    className={`w-8 h-8 rounded-full text-[11px] font-bold transition-all ${
                                      callScheduleDays.includes(d.key)
                                        ? 'bg-indigo-500 text-white'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                    }`}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex gap-3 justify-end">
                  <button 
                    onClick={() => setShowProfileModal(false)}
                    className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-semibold"
                  >
                    रद्द करें (Cancel)
                  </button>
                  <button 
                    onClick={handleSaveProfile}
                    disabled={savingConfig}
                    className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all"
                  >
                    {savingConfig ? "सहेजा जा रहा है..." : "सुरक्षित करें (Save)"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'templates' && (
        <div className="bg-zinc-50 dark:bg-zinc-900/10 p-4 rounded-3xl border border-zinc-100 dark:border-zinc-850">
          <TemplatesView />
        </div>
      )}

      {activeSubTab === 'flows' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
            <h3 className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              WhatsApp फ़्लो / फॉर्म सूची ({flows.length})
            </h3>
            <button 
              onClick={handleCreateFlow}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> नया फ़्लो बनाएँ (New Flow)
            </button>
          </div>

          {loadingFlows ? (
            <div className="p-12 text-center text-zinc-400">फ़्लो लोड किए जा रहे हैं...</div>
          ) : flows.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950/30 flex flex-col items-center">
              <Blocks className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4 animate-pulse" />
              <h4 className="font-bold text-lg mb-1">कोई फ़्लो/फॉर्म नहीं मिला</h4>
              <p className="text-sm text-zinc-500 max-w-sm mb-6">WhatsApp पर ग्राहकों से सीधे फॉर्म / जानकारी एकत्र करने के लिए एक फ़्लो डिज़ाइन करें।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white font-display">{flow.name}</h4>
                        <p className="text-[11px] text-zinc-400 font-mono mt-1">ID: {flow.id}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        flow.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                        'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {flow.status === 'PUBLISHED' ? 'Live' : 'Draft'}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-100 dark:border-zinc-900 flex justify-between items-center">
                      <span>श्रेणी: <strong>{flow.categories || "UTILITY"}</strong></span>
                      <span>स्क्रीन संख्या: <strong>{JSON.parse(flow.screens_json || '[]').length || 1}</strong></span>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
                    <button onClick={() => handleEditFlow(flow)} className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 py-2 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <Edit className="w-3.5 h-3.5" /> संपादित करें (Build)
                    </button>
                    {flow.status !== 'PUBLISHED' && (
                      <button onClick={() => handlePublishFlow(flow.id)} className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all">
                        लाइव करें (Publish)
                      </button>
                    )}
                    <button onClick={() => handleDeleteFlow(flow.id)} className="p-2 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flow Visual Editor Builder Modal */}
          {showFlowModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-6xl h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-xl animate-in zoom-in-95 duration-250 flex flex-col">
                
                {/* Header */}
                <div className="p-4 md:p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <Blocks className="w-5 h-5 text-amber-500" />
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                        {editingFlow ? "WhatsApp फ़्लो संपादित करें (Builder)" : "नया WhatsApp फ़्लो बनाएँ (Builder)"}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">बिना कोडिंग के WhatsApp फॉर्म्स और इंटरएक्टिव स्क्रीन डिज़ाइन करें</p>
                    </div>
                  </div>
                  <button onClick={() => setShowFlowModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X className="w-5 h-5" /></button>
                </div>

                {/* Main Body Grid */}
                <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                  
                  {/* Left Column: Screen Structure & Fields insertion (4 cols) */}
                  <div className="lg:col-span-4 border-r border-zinc-100 dark:border-zinc-800 p-4 overflow-y-auto space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">फ़्लो का नाम (Flow Name)</label>
                      <input 
                        type="text" 
                        value={flowName} 
                        onChange={(e) => setFlowName(e.target.value)}
                        placeholder="e.g. Lead Form, Survey"
                        className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">श्रेणी (Category)</label>
                      <select 
                        value={flowCategory} 
                        onChange={(e) => setFlowCategory(e.target.value)}
                        className="w-full text-sm p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-amber-500 outline-none"
                      >
                        <option value="UTILITY">UTILITY (उपयोगिता)</option>
                        <option value="MARKETING">MARKETING (मार्केटिंग)</option>
                      </select>
                    </div>

                    {/* Component Actions Palette */}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                      <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-2">कंपोनेंट्स जोड़ें (Add Fields)</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => addFlowComponent('text')} className="flex items-center gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 text-left transition-all">
                          <span className="text-indigo-500 font-bold font-mono">T</span> विवरण / निर्देश
                        </button>
                        <button onClick={() => addFlowComponent('input')} className="flex items-center gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-emerald-500" /> टेक्स्ट इनपुट
                        </button>
                        <button onClick={() => addFlowComponent('textarea')} className="flex items-center gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-blue-500" /> लंबा संदेश
                        </button>
                        <button onClick={() => addFlowComponent('select')} className="flex items-center gap-1.5 p-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-amber-500" /> ड्रॉपडाउन लिस्ट
                        </button>
                        <button onClick={() => addFlowComponent('submit')} className="col-span-2 flex items-center justify-center gap-1.5 p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all">
                          <Check className="w-3.5 h-3.5" /> सबमिट बटन (Submit)
                        </button>
                      </div>
                    </div>

                    {/* Field Properties Panel */}
                    {selectedComponent ? (
                      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 p-3 rounded-xl border border-dashed">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">फ़ील्ड गुण (Properties)</h4>
                          <button onClick={() => deleteComponent(selectedComponent.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 rounded-lg transition-all" title="Delete Field">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1">लेबल (Label)</label>
                          <input 
                            type="text"
                            value={selectedComponent.label || ""}
                            onChange={(e) => updateComponentProperty(selectedComponent.id, 'label', e.target.value)}
                            className="w-full text-xs p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none"
                          />
                        </div>

                        {selectedComponent.type === 'text' && (
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1">विवरण सामग्री (Content)</label>
                            <textarea 
                              rows={2}
                              value={selectedComponent.content || ""}
                              onChange={(e) => updateComponentProperty(selectedComponent.id, 'content', e.target.value)}
                              className="w-full text-xs p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none resize-none"
                            />
                          </div>
                        )}

                        {(selectedComponent.type === 'input' || selectedComponent.type === 'textarea') && (
                          <>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1">प्लेसहोल्डर (Placeholder)</label>
                              <input 
                                type="text"
                                value={selectedComponent.placeholder || ""}
                                onChange={(e) => updateComponentProperty(selectedComponent.id, 'placeholder', e.target.value)}
                                className="w-full text-xs p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                checked={!!selectedComponent.required}
                                onChange={(e) => updateComponentProperty(selectedComponent.id, 'required', e.target.checked)}
                                id="chk_req"
                              />
                              <label htmlFor="chk_req" className="text-xs text-zinc-600 dark:text-zinc-400 font-semibold cursor-pointer">भरना आवश्यक है? (Required)</label>
                            </div>
                          </>
                        )}

                        {selectedComponent.type === 'select' && (
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1">विकल्प सूची (कोमा से अलग करें)</label>
                            <input 
                              type="text"
                              value={selectedComponent.options || ""}
                              onChange={(e) => updateComponentProperty(selectedComponent.id, 'options', e.target.value)}
                              placeholder="उदा. हाँ, नहीं, शायद"
                              className="w-full text-xs p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1">वैरिएबल कुंजी (Database Key)</label>
                          <input 
                            type="text"
                            value={selectedComponent.name || ""}
                            onChange={(e) => updateComponentProperty(selectedComponent.id, 'name', e.target.value)}
                            className="w-full text-xs p-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 outline-none font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl text-zinc-400 text-xs">
                        संपादित करने के लिए लाइव प्रीव्यू स्क्रीन पर किसी फील्ड/अवयव पर क्लिक करें।
                      </div>
                    )}
                  </div>

                  {/* Middle/Right Column: Live Simulated Phone Screen & Layout Preview (8 cols) */}
                  <div className="lg:col-span-8 bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col md:flex-row gap-6 overflow-y-auto items-center justify-center">
                    
                    {/* Visual Layout Reorder List */}
                    <div className="w-full md:w-1/2 space-y-3 shrink-0">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">स्क्रीन अवयव क्रम (Layout Fields)</h4>
                      <div className="space-y-2">
                        {activeScreen?.components.map((comp: any) => (
                          <div 
                            key={comp.id}
                            onClick={() => setSelectedCompId(comp.id)}
                            className={`p-3 rounded-xl border transition-all flex justify-between items-center cursor-pointer ${selectedCompId === comp.id ? 'bg-amber-500/15 border-amber-500' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                          >
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">{comp.type}</span>
                              <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-1 truncate">{comp.label || comp.content || "बिना नाम की फील्ड"}</h5>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteComponent(comp.id); }}
                              className="text-zinc-400 hover:text-red-500 p-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-850"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* WhatsApp Device Mockup frame */}
                    <div className="w-[300px] h-[580px] bg-zinc-950 rounded-[40px] border-[8px] border-zinc-800 shadow-2xl relative shrink-0 overflow-hidden flex flex-col">
                      {/* Topnotch speaker and camera */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-zinc-800 rounded-b-xl z-20 flex items-center justify-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-zinc-900"></div>
                        <div className="w-10 h-1 bg-zinc-900 rounded-full"></div>
                      </div>

                      {/* Screen Header */}
                      <div className="bg-[#075e54] text-white pt-7 pb-3 px-4 flex items-center gap-2 z-10">
                        <Phone className="w-4 h-4 text-emerald-300" />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold truncate">Dhita CRM Forms</h5>
                          <p className="text-[9px] text-emerald-200">Active Form Screen</p>
                        </div>
                      </div>

                      {/* Chat / Flow Form Screen area */}
                      <div className="flex-1 bg-[#efeae2] dark:bg-zinc-900/40 p-4 space-y-4 overflow-y-auto relative">
                        {/* Custom background pattern simulation */}
                        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 10%, transparent 11%)', backgroundSize: '12px 12px' }}></div>
                        
                        {/* Elegant Form Window simulating WhatsApp Native Flow screen */}
                        <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3 relative z-10">
                          <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 pb-2 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
                            <span>{activeScreen?.title || "शीर्षक"}</span>
                            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">1 of 1</span>
                          </h4>

                          {/* Dynamic components rendering inside Mockup */}
                          <div className="space-y-3">
                            {activeScreen?.components.map((c: any) => {
                              if (c.type === 'text') {
                                return (
                                  <div key={c.id} className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 p-2 rounded border border-zinc-100 dark:border-zinc-850">
                                    {c.content || "निर्देश प्रविष्ट करें..."}
                                  </div>
                                );
                              }
                              if (c.type === 'input') {
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-zinc-500">
                                      {c.label || "इनपुट"} {c.required && <span className="text-red-500">*</span>}
                                    </label>
                                    <input 
                                      type="text"
                                      disabled
                                      placeholder={c.placeholder || "विवरण..."}
                                      className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 outline-none"
                                    />
                                  </div>
                                );
                              }
                              if (c.type === 'textarea') {
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-zinc-500">
                                      {c.label || "लंबा संदेश"} {c.required && <span className="text-red-500">*</span>}
                                    </label>
                                    <textarea 
                                      rows={2}
                                      disabled
                                      placeholder={c.placeholder || "विवरण..."}
                                      className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 outline-none resize-none"
                                    />
                                  </div>
                                );
                              }
                              if (c.type === 'select') {
                                const opts = (c.options || "").split(",").map((o: string) => o.trim()).filter((o: string) => o.length > 0);
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-zinc-500">{c.label || "ड्रॉपडाउन"}</label>
                                    <select disabled className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 outline-none">
                                      {opts.map((o: string, idx: number) => <option key={idx}>{o}</option>)}
                                    </select>
                                  </div>
                                );
                              }
                              if (c.type === 'submit') {
                                return (
                                  <button key={c.id} disabled className="w-full py-2 bg-[#075e54] text-white font-bold text-xs rounded-lg shadow-sm hover:opacity-95 mt-4">
                                    {c.label || "प्रस्तुत करें"}
                                  </button>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Screen footer bar / Home line */}
                      <div className="h-10 bg-zinc-950 flex items-center justify-center shrink-0">
                        <div className="w-24 h-1 bg-zinc-700 rounded-full"></div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 shrink-0 flex gap-3 justify-end">
                  <button 
                    onClick={() => setShowFlowModal(false)}
                    className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-semibold"
                  >
                    रद्द करें (Cancel)
                  </button>
                  <button 
                    onClick={handleSaveFlow}
                    className="px-6 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all shadow-sm"
                  >
                    सहेजें और बंद करें (Save Flow)
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
