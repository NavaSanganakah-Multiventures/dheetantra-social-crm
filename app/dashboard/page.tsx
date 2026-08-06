"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Copy, AlertTriangle, Upload, Bot, MessageSquare, MessageCircle, Megaphone, CalendarClock, Settings, LayoutDashboard, Search, Bell, Menu, Send, Paperclip, LogOut, User, Blocks, AlertCircle, Phone, PhoneCall, X, History, MapPin, Building2, Tag, ChevronDown, ChevronRight, Activity, Users, Zap, Check, CheckCheck, FileText, Plus, Trash2, Edit, Archive, RefreshCw, Instagram, Facebook, Mail, TrendingUp, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { useWhatsAppWebRTC } from '@/lib/hooks/useWhatsAppWebRTC';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

import ActiveConversationsView from '@/components/ActiveConversationsView';
import EmailServiceView from '@/components/EmailServiceView';
import UnifiedInbox from '@/components/UnifiedInbox';
import { useToast } from '@/components/ui/Toast';
import { activeTab } from './lib/types';
import { NavItem } from './components/NavItem';
import { DashboardOverview } from './components/DashboardOverview';
import { BroadcastView } from './components/BroadcastView';
import { ScheduleView } from './components/ScheduleView';
import { SettingsView } from './components/SettingsView';
import { ContactsView } from './components/ContactsView';
import { CallsView } from './components/CallsView';
import { ActiveCallManager } from './components/ActiveCallManager';
import { IntegrationsView } from './components/IntegrationsView';
import { WhatsAppManagerView } from './components/WhatsAppManagerView';

export { formatUserTimeOnly, formatUserDateOnly, formatUserDateTime } from './lib/dates';

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
              
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">अकाउंट्स</div>
              <NavItem icon={<Phone />} label="WhatsApp" isActive={activeTab === 'accounts-whatsapp'} onClick={() => { setActiveTab('accounts-whatsapp'); if (window.innerWidth < 768) setSidebarOpen(false); }} />

              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">मार्केटिंग</div>
              <NavItem icon={<Megaphone />} label="ब्रॉडकास्ट" isActive={activeTab === 'broadcast'} onClick={() => { setActiveTab('broadcast'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<Mail />} label="ईमेल सेवा" isActive={activeTab === 'email'} onClick={() => { setActiveTab('email'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<CalendarClock />} label="शेड्यूल्ड पोस्ट्स" isActive={activeTab === 'schedule'} onClick={() => { setActiveTab('schedule'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
            </nav>

            <div className="p-4 bg-zinc-900/50 dark:bg-zinc-950/50 mt-auto border-t border-zinc-800">
              <NavItem icon={<Blocks />} label="इंटीग्रेशन्स" isActive={activeTab === 'integrations'} onClick={() => { setActiveTab('integrations'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
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
              {activeTab === 'dashboard' ? 'डैशबोर्ड' : activeTab === 'inbox' ? 'इनबॉक्स' : activeTab === 'active-conversations' ? 'सक्रिय बातचीत' : activeTab === 'broadcast' ? 'ब्रॉडकास्ट' : activeTab === 'schedule' ? 'शेड्यूलर' : activeTab === 'contacts' ? 'संपर्क और लीड्स' : activeTab === 'accounts-whatsapp' ? 'WhatsApp अकाउंट्स' : activeTab === 'calls' ? 'कॉल लॉग्स' : activeTab === 'email' ? 'ईमेल सेवा' : 'सेटिंग्स'}
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
                {wsStatus === 'connecting' ? 'कनेक्ट हो रहा है...' : wsStatus === 'connected' ? 'लाइव' : 'ऑफलाइन'}
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
                <UnifiedInbox
                  preselectedChat={preselectedChat}
                  setPreselectedChat={setPreselectedChat}
                  onGoIntegrations={() => setActiveTab('integrations')}
                />
              )}
              {activeTab === 'active-conversations' && (
                <ActiveConversationsView 
                  setActiveTab={setActiveTab} 
                  setPreselectedChat={setPreselectedChat} 
                />
              )}
              {activeTab === 'broadcast' && <BroadcastView />}
              {activeTab === 'email' && <EmailServiceView />}
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
                  इनकमिंग कॉल
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
                  काटें
                </button>

                <button
                  onClick={async () => {
                    try {
                      if (!incomingCall.sdp) {
                        alert('SDP डेटा उपलब्ध नहीं है। कृपया WhatsApp Cloud API की Calling Webhook सेटिंग जांचें और सुनिश्चित करें कि "calls" फ़ील्ड सब्सक्राइब है।');
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
                  उठाएं
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
                <h4 className="text-sm font-bold text-white">मिस्ड कॉल</h4>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">
                  {incomingCallNoSdp.contact_name || 'अज्ञात'} ({incomingCallNoSdp.phone || 'अज्ञात'})
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    {callsFieldStatus === 'not_subscribed'
                      ? '⚠️ WhatsApp Cloud API में "calls" फ़ील्ड सब्सक्राइब नहीं है — कॉल कनेक्ट नहीं हो सकती'
                      : '⚡ WebRTC SDP उपलब्ध नहीं — केवल मिस्ड कॉल ही दिखाया जा सकता है'}
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
