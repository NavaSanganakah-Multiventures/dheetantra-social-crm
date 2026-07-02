"use client";

import React, { useState, useEffect } from 'react';
import { MessageSquare, Megaphone, CalendarClock, Settings, LayoutDashboard, Search, Bell, Menu, Send, Paperclip, LogOut, User, Phone, X, History, MapPin, Building2, Tag, ChevronDown, ChevronRight, Activity, Users, Zap, Check, CheckCheck } from 'lucide-react';
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
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 bg-zinc-950 dark:bg-zinc-900 border-r border-zinc-800 dark:border-zinc-800 flex flex-col text-zinc-300 z-20"
          >
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-lg tracking-tight font-display text-white">DheeTantra</span>
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-3">ओवरव्यू</div>
              <NavItem icon={<LayoutDashboard />} label="डैशबोर्ड" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
              <NavItem icon={<MessageSquare />} label="इनबॉक्स" isActive={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} badge="3" />
              
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 mt-8 px-3">मार्केटिंग</div>
              <NavItem icon={<Megaphone />} label="ब्रॉडकास्ट" isActive={activeTab === 'broadcast'} onClick={() => setActiveTab('broadcast')} />
              <NavItem icon={<CalendarClock />} label="शेड्यूल्ड पोस्ट्स" isActive={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
            </nav>

            <div className="p-4 bg-zinc-900/50 dark:bg-zinc-950/50 mt-auto border-t border-zinc-800">
              <NavItem icon={<Settings />} label="सेटिंग्स" isActive={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              
              <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-3 px-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                  {user?.name?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name || "उपयोगकर्ता"}</p>
                  <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
                </div>
                <button onClick={onLogout} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white" title="लॉगआउट">
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

  const fetchConversations = () => {
    fetch('/api/inbox/conversations', {
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
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, []);

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
          conversationId: activeChat.id
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
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900 z-10">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-900">
            <h2 className="font-medium mb-3">सक्रिय बातचीत</h2>
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

      <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950/50 relative z-0">
          {!activeChat ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 flex-col">
              <MessageSquare className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-700" />
              <p>आपका इनबॉक्स खाली है</p>
              <p className="text-xs mt-2 text-zinc-400">संदेश भेजने के लिए बाईं ओर से एक बातचीत चुनें</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-medium text-sm">
                    {activeChat.contact_name ? activeChat.contact_name[0] : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{activeChat.contact_name || "अज्ञात"}</h3>
                    <p className="text-xs text-zinc-500">{activeChat.phone}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsContactPanelOpen(!isContactPanelOpen)}
                  className={`p-2 rounded-lg transition-colors ${isContactPanelOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  title="Contact Details"
                >
                  <User className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
                 {messages.length === 0 ? (
                   <p className="text-center text-zinc-500 text-sm mt-10">कोई संदेश नहीं</p>
                 ) : (
                   messages.map(msg => (
                     <div key={msg.id} className={`flex flex-col gap-1 ${msg.sender_type === 'agent' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${msg.sender_type === 'agent' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'}`}>
                          {msg.content}
                        </div>
                        <div className={`flex items-center gap-1 mt-0.5 ${msg.sender_type === 'agent' ? 'mr-1' : 'ml-1'}`}>
                          <span className="text-[10px] text-zinc-400">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          {msg.sender_type === 'agent' && (
                            msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> :
                            msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-zinc-400" /> :
                            <Check className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </div>
                     </div>
                   ))
                 )}
              </div>

              {/* Message Input */}
              <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-full pl-4 pr-1 py-1 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                  <input 
                    type="text" 
                    placeholder="संदेश टाइप करें..." 
                    className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <button 
                    onClick={sendMessage}
                    disabled={!messageInput.trim() || sending}
                    className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${messageInput.trim() && !sending ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'}`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
      </div>

      {/* Sliding Contact Details Panel */}
      <AnimatePresence>
        {isContactPanelOpen && activeChat && (
          <motion.div 
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col absolute right-0 top-0 bottom-0 z-20 shadow-2xl"
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
        if (data.config) {
          setPhoneNumberId(data.config.phone_number_id || "");
          setVerifyToken(data.config.verify_token || "");
          setAccessToken("••••••••••••••••"); // Don't show actual token
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
        const payload: any = { phone_number_id: phoneNumberId, verify_token: verifyToken };
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
          setMessage("सेटिंग्स सुरक्षित कर ली गईं!");
        } else {
          setMessage("त्रुटि: " + (data.error || "अज्ञात"));
        }
      } catch (e) {
        setMessage("नेटवर्क त्रुटि।");
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
                           <span className="text-xs text-zinc-400 font-medium uppercase">या मैन्युअल कॉन्फ़िगरेशन</span>
                           <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
                         </div>

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

                         <div className="pt-2">
                           <button onClick={saveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2">
                             {saving ? "सुरक्षित किया जा रहा है..." : "सेव करें"}
                           </button>
                           {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium">{message}</p>}
                         </div>
                     </div>
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
