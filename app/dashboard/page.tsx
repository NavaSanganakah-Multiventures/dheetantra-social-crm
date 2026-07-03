"use client";

import React, { useState, useEffect } from 'react';
import { Download,  Bot, MessageSquare, Megaphone, CalendarClock, Settings, LayoutDashboard, Search, Bell, Menu, Send, Paperclip, LogOut, User, Phone, X, History, MapPin, Building2, Tag, ChevronDown, ChevronRight, Activity, Users, Zap, Check, CheckCheck, FileText, Plus, Trash2, Edit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';

type activeTab = 'dashboard' | 'inbox' | 'broadcast' | 'schedule' | 'settings';

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

  useEffect(() => {
    const checkScreenSize = () => {
      setSidebarOpen(window.innerWidth >= 768);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
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
              <NavItem icon={<MessageSquare />} label="इनबॉक्स" isActive={activeTab === 'inbox'} onClick={() => { setActiveTab('inbox'); if (window.innerWidth < 768) setSidebarOpen(false); }} badge="3" />
              
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">मार्केटिंग</div>
              <NavItem icon={<Megaphone />} label="ब्रॉडकास्ट" isActive={activeTab === 'broadcast'} onClick={() => { setActiveTab('broadcast'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
              <NavItem icon={<CalendarClock />} label="शेड्यूल्ड पोस्ट्स" isActive={activeTab === 'schedule'} onClick={() => { setActiveTab('schedule'); if (window.innerWidth < 768) setSidebarOpen(false); }} />
            </nav>

            <div className="p-4 bg-zinc-900/50 dark:bg-zinc-950/50 mt-auto border-t border-zinc-800">
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
              {activeTab === 'dashboard' ? 'डैशबोर्ड' : activeTab === 'inbox' ? 'इनबॉक्स' : activeTab === 'broadcast' ? 'ब्रॉडकास्ट' : activeTab === 'schedule' ? 'शेड्यूलर' : 'सेटिंग्स'}
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
            <button className="p-2 relative rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-zinc-950"></span>
            </button>
          </div>
        </header>

        {/* Dynamic View Area */}
        <main className="flex-1 overflow-y-auto relative bg-zinc-50 dark:bg-zinc-950/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="min-h-full flex flex-col"
            >
              {activeTab === 'dashboard' && <DashboardOverview />}
              {activeTab === 'inbox' && <InboxView />}
              {activeTab === 'broadcast' && <BroadcastView />}
              {activeTab === 'schedule' && <ScheduleView />}
              {activeTab === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
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
    fetch('/api/workspace').then(r => r.json()).then((data: any) => {
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

function InboxView() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  // Multi-WABA and Preview states
  const [configs, setConfigs] = useState<any[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<any>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  // Rich Media Attachments State
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'text' | 'image' | 'video' | 'document' | 'location' | 'contacts' | null>(null);

  // Media (Image/Video/Doc) inputs
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaFileState, setMediaFileState] = useState<File | null>(null);
  const [replyMode, setReplyMode] = useState("manual");
  const [captionInput, setCaptionInput] = useState('');
  const [docFilenameInput, setDocFilenameInput] = useState('');

  // Location inputs
  const [latInput, setLatInput] = useState('28.6139'); // New Delhi Latitude
  const [lngInput, setLngInput] = useState('77.2090'); // New Delhi Longitude
  const [locNameInput, setLocNameInput] = useState('Dhitantra Headquarters');
  const [locAddressInput, setLocAddressInput] = useState('New Delhi, India');

  // Contact inputs
  const [contactNameInput, setContactNameInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');

  // Load configs on Mount
  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/whatsapp/config', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      if (data.configs) {
        setConfigs(data.configs);
        if (data.configs.length > 0) {
          setSelectedWaba(data.configs[0]);
        }
      }
    }).catch(err => console.error("Error loading configs:", err));
  }, []);

  // Update Media Preview URL reactively with safe cleanup
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (mediaFileState) {
        const url = URL.createObjectURL(mediaFileState);
        setMediaPreviewUrl(url);
      } else if (mediaUrlInput.trim()) {
        setMediaPreviewUrl(mediaUrlInput.trim());
      } else {
        setMediaPreviewUrl(null);
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mediaFileState, mediaUrlInput]);

  const toggleAI = async () => {
    const newMode = replyMode === 'ai' ? 'manual' : 'ai';
    setReplyMode(newMode);
    try {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      
      const confRes = await fetch('/api/whatsapp/config', { headers: { 'x-workspace-id': wId } });
      const confData = await confRes.json();
      const existing = confData.config || {};
      
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
        body: JSON.stringify({ 
          phone_number_id: existing.phone_number_id || "", 
          verify_token: existing.verify_token || "", 
          reply_mode: newMode 
        })
      });
    } catch (e) {
      console.error("Failed to toggle AI", e);
    }
  };

  const sendRichMessage = async () => {
    if (!activeChat || sending || !attachmentType) return;
    
    let payload: any = {
      to: activeChat.phone,
      conversationId: activeChat.id,
      type: attachmentType,
      phoneNumberId: selectedWaba ? selectedWaba.phone_number_id : undefined
    };

    if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') {
      let finalMediaUrl = mediaUrlInput.trim();
      let finalR2Url = null;
      if (mediaFileState) {
         setSending(true);
         const formData = new FormData();
         formData.append('file', mediaFileState);
         
         try {
            const uploadRes = await fetch('/api/whatsapp/upload', {
               method: 'POST',
               headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
               body: formData
            });
            const uploadData = await uploadRes.json();
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
      payload.location = {
        latitude: parseFloat(latInput),
        longitude: parseFloat(lngInput),
        name: locNameInput.trim(),
        address: locAddressInput.trim()
      };
    } else if (attachmentType === 'contacts') {
      if (!contactNameInput.trim() || !contactPhoneInput.trim()) {
        alert("कृपया संपर्क का नाम और फ़ोन नंबर प्रदान करें");
        return;
      }
      payload.contacts = [{
        name: {
          first_name: contactNameInput.trim(),
          formatted_name: contactNameInput.trim()
        },
        phones: [{
          phone: contactPhoneInput.trim(),
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
        // Reset state
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

  const fetchConversations = (wabaId?: string) => {
    const activeWaba = wabaId || (selectedWaba ? selectedWaba.phone_number_id : '');
    const url = activeWaba 
      ? `/api/inbox/conversations?phoneNumberId=${activeWaba}` 
      : '/api/inbox/conversations';

    fetch(url, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.conversations) {
            setConversations(data.conversations);
        }
        setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(), 5000);
    return () => clearInterval(interval);
  }, [selectedWaba]);

  const loadMessages = (conversationId: string) => {
    fetch(`/api/inbox/messages/${conversationId}`, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.messages) {
            setMessages(data.messages);
        }
    });
  };

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
      const interval = setInterval(() => loadMessages(activeChat.id), 5000);
      return () => clearInterval(interval);
    }
  }, [activeChat]);

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeChat || sending) return;
    setSending(true);
    
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify({
          to: activeChat.phone,
          text: messageInput,
          conversationId: activeChat.id,
          phoneNumberId: selectedWaba ? selectedWaba.phone_number_id : undefined
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setMessageInput("");
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

            {/* WABA Selection Dropdown */}
            <div className="mb-3">
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">WhatsApp Line</label>
              <div className="relative">
                <select 
                  value={selectedWaba ? selectedWaba.id : ''} 
                  onChange={(e) => {
                    const selected = configs.find(c => c.id === e.target.value);
                    if (selected) {
                      setSelectedWaba(selected);
                      setActiveChat(null); // Clear active chat on filter change
                    }
                  }}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                  {configs.map((cfg) => (
                    <option key={cfg.id} value={cfg.id}>
                      📱 WABA ({cfg.phone_number_id.slice(-6)})
                    </option>
                  ))}
                  {configs.length === 0 && (
                    <option value="">कोई अकाउंट नहीं</option>
                  )}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 text-xs">
                <button className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-full font-medium">सभी</button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {loading ? (
                <div className="p-4 text-sm text-zinc-500">इनबॉक्स लोड हो रहा है...</div>
            ) : conversations.length === 0 ? (
                 <div className="p-4 text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50">कोई सक्रिय संदेश नहीं है। WhatsApp API से कनेक्ट करें।</div>
            ) : (
                conversations.map((chat) => (
                    <button 
                      key={chat.id} 
                      onClick={() => { setActiveChat(chat); setIsContactPanelOpen(false); }}
                      className={`w-full text-left p-4 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors ${activeChat?.id === chat.id ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                    >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{chat.contact_name || chat.phone || "अज्ञात"}</span>
                          <span className="text-[10px] text-zinc-500">{new Date(chat.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-500 truncate pr-4">{chat.phone}</span>
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
                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleAI}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${replyMode === 'ai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="Toggle AI Chatbot"
                  >
                    <Bot className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">{replyMode === 'ai' ? 'AI ON' : 'AI OFF'}</span>
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
              <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
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
                             {/* Render Image */}
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

                             {/* Render Video */}
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

                             {/* Render Document */}
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

                             {/* Render Location */}
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

                             {/* Render Contacts */}
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

                             {/* Render Text / Default */}
                             {mType === 'text' && (
                               <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                             )}
                           </div>
                           <div className={`flex items-center gap-1 mt-0.5 ${isAgent ? 'mr-1' : 'ml-1'}`}>
                             <span className="text-[10px] text-zinc-400">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                             {isAgent && (
                               msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> :
                               msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-zinc-400" /> :
                               <Check className="w-3.5 h-3.5 text-zinc-400" />
                             )}
                           </div>
                        </div>
                      );
                    })
                  )}
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
                      onClick={() => { setAttachmentType(null); setMediaFileState(null); setAttachmentMenuOpen(false); }}
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
                                // Convert to base64 or object URL for preview, and we'll upload it when sending
                                // For now, we will just use a global state or attach it to the form
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
                        <input 
                          type="text" 
                          placeholder="919876543210" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={contactPhoneInput}
                          onChange={(e) => setContactPhoneInput(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-1">
                    <button 
                      onClick={() => { setAttachmentType(null); setMediaFileState(null); setAttachmentMenuOpen(false); }}
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

             <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 relative">
               {/* Attachment Type dropdown */}
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
                 >
                   <Paperclip className="w-4 h-4" />
                 </button>
                 <input 
                   type="text" 
                   placeholder="संदेश टाइप करें..." 
                   className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2"
                   value={messageInput}
                   onChange={(e) => setMessageInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                   disabled={!!attachmentType}
                 />
                 <button 
                   onClick={sendMessage}
                   disabled={!messageInput.trim() || sending || !!attachmentType}
                   className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${messageInput.trim() && !sending && !attachmentType ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'}`}
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
      </div>      {/* Sliding Contact Details Panel */}
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
  const [campaignName, setCampaignName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

  const handleQueue = async () => {
      setStatus("Queueing...");
      try {
         await fetch('/api/broadcast', { method: 'POST', body: JSON.stringify({ workspaceId: localStorage.getItem('workspaceId') || '', campaignName, textBody: body, contactIds: [] }) });
         setStatus("Broadcast request submitted to Edge Worker.");
         setBody("");
         setCampaignName("");
      } catch (e) {
         setStatus("Failed to queue.");
      }
  };

  return (
    <div className="p-6 md:p-8 overflow-y-auto w-full max-w-5xl mx-auto h-full text-center mt-20">
       <div className="inline-flex w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center text-zinc-500 mb-6 border border-zinc-200 dark:border-zinc-700">
           <Megaphone className="w-8 h-8" />
       </div>
       <h2 className="text-2xl font-semibold mb-2 tracking-tight">WhatsApp Broadcasts</h2>
       <p className="text-zinc-500 dark:text-zinc-400 mb-8 max-w-md mx-auto">
           Send bulk messages to your contacts via Cloudflare Queues perfectly managing API rate limits.
       </p>
       
       <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-left shadow-sm mb-8">
           <div className="space-y-4 max-w-lg mx-auto">
               <div>
                   <label className="block text-sm font-medium mb-1.5">Campaign Name</label>
                   <input 
                        type="text" 
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        placeholder="e.g. Summer Promo Blast" 
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm"
                   />
               </div>
               <div>
                   <label className="block text-sm font-medium mb-1.5">Message Content</label>
                   <textarea 
                        rows={4}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Write your message here..." 
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm resize-none"
                   />
               </div>
               <div className="pt-2">
                   <button onClick={handleQueue} disabled={!body || !campaignName} className="w-full disabled:opacity-50 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-lg px-4 py-3 hover:scale-[0.99] transition-transform">
                       Queue Broadcast via Cloudflare Queues
                   </button>
               </div>
               {status && <p className="text-sm mt-2 text-center text-zinc-500">{status}</p>}
           </div>
       </div>
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
    const [phoneNumberId, setPhoneNumberId] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [verifyToken, setVerifyToken] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [webhookUrl, setWebhookUrl] = useState("");
    const [metaConfigId, setMetaConfigId] = useState("");
    const [replyMode, setReplyMode] = useState("manual");

    // Multi-WABA configs state
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
      setVerifyToken(cfg.verify_token || "");
      setAccessToken("••••••••••••••••");
      setReplyMode(cfg.reply_mode || "manual");
      setMessage("अकाउंट संपादित किया जा रहा है...");
    };

    const cancelEditing = () => {
      setEditingId(null);
      setPhoneNumberId("");
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
            // If FB script is already loaded and fbAsyncInit was missed
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
              console.log("Embedded Signup Finished", data.data);
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
          // ignore
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
          setVerifyToken(data.config.verify_token || "");
          setAccessToken("••••••••••••••••"); // Don't show actual token
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

      return () => {
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
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="अपनी पसंद का कोई भी सीक्रेट टोकन डालें" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
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
                                    <th className="p-4">ऑटो-रिप्लाई मोड</th>
                                    <th className="p-4">कनेक्टेड तिथि</th>
                                    <th className="p-4 text-right">कार्रवाई (Actions)</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {configs.map((cfg) => (
                                    <tr key={cfg.id} className="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                       <td className="p-4 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{cfg.phone_number_id}</td>
                                       <td className="p-4">
                                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                             cfg.reply_mode === 'ai' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400' :
                                             cfg.reply_mode === 'rule_based' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                             'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                          }`}>
                                             {cfg.reply_mode === 'ai' ? '🤖 AI Bot' : cfg.reply_mode === 'rule_based' ? '⚡ Rules' : '👤 Manual'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-zinc-500">{cfg.created_at ? new Date(cfg.created_at).toLocaleDateString() : 'N/A'}</td>
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

                 <div className="p-8 border-b border-zinc-200 dark:border-zinc-800">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display">System Administration</h3>
                     <p className="text-sm text-zinc-500 mb-6">Database Management & Migrations</p>
                     <div className="flex flex-col items-start gap-4">
                        <button 
                            onClick={async () => {
                                const res = await fetch('/api/admin/migrate', { method: 'POST' });
                                const data: any = await res.json();
                                if (data.success) alert(data.message);
                                else alert('Error: ' + data.error);
                            }}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md flex items-center gap-2"
                        >
                            <Zap className="w-4 h-4" /> Run Database Migrations
                        </button>
                        <p className="text-xs text-zinc-500">Run this to safely apply schema updates to the connected database.</p>

                        <button 
                            onClick={async () => {
                                if (confirm("Warning: This will drop ALL tables and recreate them. ALL DATA WILL BE LOST. Continue?")) {
                                    const res = await fetch('/api/admin/migrate?reset=true', { method: 'POST' });
                                    const data: any = await res.json();
                                    if (data.success) alert(data.message);
                                    else alert('Error: ' + data.error);
                                }
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md flex items-center gap-2 mt-4"
                        >
                            <Zap className="w-4 h-4" /> Hard Reset Database (DANGER)
                        </button>
                        <p className="text-xs text-red-500 font-medium">Drops all tables to fix constraint errors. Destructive operation.</p>
                     </div>
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
