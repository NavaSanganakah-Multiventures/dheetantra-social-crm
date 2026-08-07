"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldCheck, ShieldAlert, Users, Building2, CreditCard, Key, Globe,
  Activity, Plus, Trash2, Edit, RefreshCw, Search, Check, X, 
  Database, Save, Eye, EyeOff, LayoutDashboard, Sliders, ArrowLeft, Mail, ChevronRight, AlertCircle, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';

const makeNotificationId = () => Math.random().toString();

const ensureUTC = (dateStr: string | Date | number) => {
  if (typeof dateStr === 'string') {
    if (dateStr.includes(' ') && !dateStr.includes('T')) return new Date(dateStr.replace(' ', 'T') + 'Z');
    if (dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)) return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
};

const formatAdminDate = (dateStr: string | Date | number) => {
  if (!dateStr) return 'N/A';
  try {
    const tz = typeof window !== 'undefined' ? (localStorage.getItem('userTimezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata') : 'Asia/Kolkata';
    return ensureUTC(dateStr).toLocaleDateString('hi-IN', { timeZone: tz });
  } catch { return 'N/A'; }
};

type AdminTab = 'overview' | 'users' | 'workspaces' | 'plans' | 'domains' | 'kv' | 'database';


interface PlanFormState {
  id: string;
  name: string;
  description: string;
  upfront_price: string;
  pay_as_you_go_rate: string;
  features: { id: string; value: string }[];
  limits: {
    email_monthly_limit: string;
    max_domains: string;
    max_mailboxes_per_domain: string;
  };
  billing_type: string;
  billing_period: string;
  billing_interval: string;
  currency: string;
  is_active: string;
  is_free: string;
  sort_order: string;
}

const defaultPlanForm: PlanFormState = { id: '', name: '', description: '', upfront_price: '0', pay_as_you_go_rate: '0', features: [], limits: { email_monthly_limit: '', max_domains: '', max_mailboxes_per_domain: '' }, billing_type: 'recurring', billing_period: 'monthly', billing_interval: '1', currency: 'INR', is_active: '1', is_free: '0', sort_order: '0' };


export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Stats State
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  
  // Workspaces State
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');

  // Plans State
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Email Domains Review State
  const [adminDomains, setAdminDomains] = useState<any[]>([]);
  const [loadingAdminDomains, setLoadingAdminDomains] = useState(false);
  const [domainFilter, setDomainFilter] = useState<'pending' | 'all'>('pending');

  // KV Secrets State
  const [kvKeys, setKvKeys] = useState<any[]>([]);
  const [loadingKv, setLoadingKv] = useState(false);
  const [kvSearch, setKvSearch] = useState('');
  const [revealedKvKeys, setRevealedKvKeys] = useState<Record<string, boolean>>({});

  // Database Migration State
  const [schemaDiff, setSchemaDiff] = useState<any>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Modals / Drawers / Form States
  const [userModal, setUserModal] = useState<{ open: boolean, mode: 'create' | 'edit', data?: any }>({ open: false, mode: 'create' });
  const [workspaceModal, setWorkspaceModal] = useState<{ open: boolean, mode: 'create' | 'edit', data?: any }>({ open: false, mode: 'create' });
  const [planModal, setPlanModal] = useState<{ open: boolean, mode: 'create' | 'edit', data?: any }>({ open: false, mode: 'create' });
  const [kvModal, setKvModal] = useState<{ open: boolean, data?: any }>({ open: false });

  // Form Field States
  const [userForm, setUserForm] = useState({ email: '', name: '', is_registered: true });
  const [workspaceForm, setWorkspaceForm] = useState({ name: '', plan_id: '', owner_id: '' });
  const [planForm, setPlanForm] = useState<PlanFormState>(defaultPlanForm);
  const [kvForm, setKvForm] = useState({ name: '', value: '' });

  // Notifications State
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: 'success' | 'error' }[]>([]);
  const notificationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      notificationTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const addNotification = (message: string, type: 'success' | 'error' = 'success') => {
    const id = makeNotificationId();
    setNotifications(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
    notificationTimersRef.current.push(timer);
  };

  // Fetch Stats
  const loadStats = () => {
    setTimeout(() => setLoadingStats(true), 0);
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then((data: any) => {
        if (data.stats) {
          setStats(data.stats);
        }
        setLoadingStats(false);
      })
      .catch(() => {
        addNotification('सांख्यिकी लोड करने में विफल', 'error');
        setLoadingStats(false);
      });
  };

  // Fetch Users
  const loadUsers = () => {
    setTimeout(() => setLoadingUsers(true), 0);
    fetch('/api/admin/users')
      .then(res => res.json())
      .then((data: any) => {
        if (data.users) {
          setUsers(data.users);
        }
        setLoadingUsers(false);
      })
      .catch(() => {
        addNotification('उपयोगकर्ता लोड करने में विफल', 'error');
        setLoadingUsers(false);
      });
  };

  // Fetch Workspaces
  const loadWorkspaces = () => {
    setTimeout(() => setLoadingWorkspaces(true), 0);
    fetch('/api/admin/workspaces')
      .then(res => res.json())
      .then((data: any) => {
        if (data.workspaces) {
          setWorkspaces(data.workspaces);
        }
        setLoadingWorkspaces(false);
      })
      .catch(() => {
        addNotification('वर्कस्पेस लोड करने में विफल', 'error');
        setLoadingWorkspaces(false);
      });
  };

  // Fetch Plans
  const loadPlans = () => {
    setTimeout(() => setLoadingPlans(true), 0);
    fetch('/api/admin/plans')
      .then(res => res.json())
      .then((data: any) => {
        if (data.plans) {
          setPlans(data.plans);
        }
        setLoadingPlans(false);
      })
      .catch(() => {
        addNotification('सब्सक्रिप्शन प्लान्स लोड करने में विफल', 'error');
        setLoadingPlans(false);
      });
  };

  // Fetch Email Domains for review
  const loadAdminDomains = () => {
    setTimeout(() => setLoadingAdminDomains(true), 0);
    const endpoint = domainFilter === 'pending' ? '/api/admin/domains/pending' : '/api/admin/domains';
    fetch(endpoint)
      .then(res => res.json())
      .then((data: any) => {
        if (data.domains) {
          setAdminDomains(data.domains);
        }
        setLoadingAdminDomains(false);
      })
      .catch(() => {
        addNotification('डोमेन लोड करने में विफल', 'error');
        setLoadingAdminDomains(false);
      });
  };

  const reviewDomain = async (id: string, action: 'approve' | 'reject' | 'unsuspend', reason?: string) => {
    try {
      const res = await fetch(`/api/admin/domains/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data: any = await res.json();
      if (res.ok) {
        addNotification(
          action === 'approve' ? 'डोमेन approve हो गया'
          : action === 'unsuspend' ? 'डोमेन unsuspend हो गया'
          : 'डोमेन reject हो गया'
        );
        loadAdminDomains();
      } else {
        addNotification(data.error || 'Review action failed', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  // Fetch KV Secrets
  const loadKvSecrets = () => {
    setTimeout(() => setLoadingKv(true), 0);
    fetch('/api/admin/kv')
      .then(res => res.json())
      .then((data: any) => {
        if (data.keys) {
          setKvKeys(data.keys);
        }
        setLoadingKv(false);
      })
      .catch(() => {
        addNotification('KV सीक्रेट्स लोड करने में विफल', 'error');
        setLoadingKv(false);
      });
  };

  // Fetch Schema Diff
  const loadSchemaDiff = () => {
    setTimeout(() => setLoadingDiff(true), 0);
    fetch('/api/admin/schema-diff')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to load');
        }
        return res.json();
      })
      .then((data: any) => {
        setSchemaDiff(data);
        setLoadingDiff(false);
      })
      .catch(() => {
        addNotification('डेटाबेस स्थिति लोड करने में विफल', 'error');
        setLoadingDiff(false);
      });
  };

  // Verify Admin Authentication
  useEffect(() => {
    fetch('/api/admin/check')
      .then(res => {
        if (res.status === 200) {
          return res.json();
        }
        throw new Error('Unauthorized');
      })
      .then((data: any) => {
        if (data.isAdmin) {
          setAuthorized(true);
          setAdminUser(data.user);
          loadStats(); // Automatically load initial overview statistics
        } else {
          setAuthorized(false);
        }
        setLoadingAuth(false);
      })
      .catch(() => {
        setAuthorized(false);
        setLoadingAuth(false);
      });
  }, []);

  // Load correct tab dataset on tab change
  useEffect(() => {
    if (!authorized) return;
    if (activeTab === 'overview') loadStats();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'workspaces') {
      loadWorkspaces();
      loadPlans(); // Needed for plan selector dropdown
    }
    if (activeTab === 'plans') loadPlans();
    if (activeTab === 'domains') loadAdminDomains();
    if (activeTab === 'kv') loadKvSecrets();
    if (activeTab === 'database') loadSchemaDiff();
  }, [activeTab, authorized, domainFilter]);

  // Handle User Action (Create/Update/Delete)
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = userModal.mode === 'create' ? '/api/admin/users' : `/api/admin/users/${userModal.data.id}`;
    const method = userModal.mode === 'create' ? 'POST' : 'PUT';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm)
      });
      const data: any = await res.json();
      if (res.ok) {
        addNotification(userModal.mode === 'create' ? 'उपयोगकर्ता सफलतापूर्वक पंजीकृत' : 'उपयोगकर्ता सफलतापूर्वक अपडेट किया गया');
        setUserModal({ open: false, mode: 'create' });
        loadUsers();
      } else {
        addNotification(data.error || 'ऑपरेशन विफल रहा', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('क्या आप वाकई इस उपयोगकर्ता को हटाना चाहते हैं?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addNotification('उपयोगकर्ता को सफलतापूर्वक हटा दिया गया है');
        loadUsers();
      } else {
        addNotification('उपयोगकर्ता को हटाने में विफल', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  // Handle Workspace Action (Create/Update/Delete)
  const saveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = workspaceModal.mode === 'create' ? '/api/admin/workspaces' : `/api/admin/workspaces/${workspaceModal.data.id}`;
    const method = workspaceModal.mode === 'create' ? 'POST' : 'PUT';

    try {
      const payload: any = { name: workspaceForm.name, plan_id: workspaceForm.plan_id };
      // Only send owner_id when provided — prevents wiping the workspace owner on edit
      if (workspaceForm.owner_id) {
        payload.owner_id = workspaceForm.owner_id;
      }
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (res.ok) {
        addNotification(workspaceModal.mode === 'create' ? 'वर्कस्पेस सफलतापूर्वक निर्मित' : 'वर्कस्पेस सफलतापूर्वक अपडेट');
        setWorkspaceModal({ open: false, mode: 'create' });
        loadWorkspaces();
      } else {
        addNotification(data.error || 'ऑपरेशन विफल रहा', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  const deleteWorkspace = async (id: string) => {
    if (!confirm('क्या आप वाकई इस वर्कस्पेस को हटाना चाहते हैं?')) return;
    try {
      const res = await fetch(`/api/admin/workspaces/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addNotification('वर्कस्पेस को सफलतापूर्वक हटा दिया गया है');
        loadWorkspaces();
      } else {
        addNotification('वर्कस्पेस को हटाने में विफल', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  // Handle Plan Action (Create/Update/Delete)
  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = planModal.mode === 'create' ? '/api/admin/plans' : `/api/admin/plans/${planModal.data.id}`;
    const method = planModal.mode === 'create' ? 'POST' : 'PUT';

    try {


      // Filter out empty features
      const featuresList = planForm.features.map(f => f.value).filter((val) => val.trim() !== '');
      const featuresJson = JSON.stringify(featuresList);

      // Clean limits object and preserve existing ones
      let existingLimits: Record<string, any> = {};
      if (planModal.data?.limits_json) {
        try {
          existingLimits = JSON.parse(planModal.data.limits_json);
        } catch { /* ignore */ }
      }

      const limitsObj: Record<string, any> = { ...existingLimits };
      if (planForm.limits.email_monthly_limit !== '') {
        const val = Number(planForm.limits.email_monthly_limit);
        if (!isNaN(val)) limitsObj.email_monthly_limit = val;
      }
      if (planForm.limits.max_domains !== '') {
        const val = Number(planForm.limits.max_domains);
        if (!isNaN(val)) limitsObj.max_domains = val;
      }
      if (planForm.limits.max_mailboxes_per_domain !== '') {
        const val = Number(planForm.limits.max_mailboxes_per_domain);
        if (!isNaN(val)) limitsObj.max_mailboxes_per_domain = val;
      }
      const limitsJson = JSON.stringify(limitsObj);



      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: planForm.id,
          name: planForm.name,
          description: planForm.description,
          upfront_price: planForm.upfront_price,
          pay_as_you_go_rate: planForm.pay_as_you_go_rate,
          features_json: featuresJson,
          limits_json: limitsJson,
          billing_type: planForm.billing_type,
          billing_period: planForm.billing_period,
          billing_interval: planForm.billing_interval,
          currency: planForm.currency,
          is_active: planForm.is_active === '1',
          is_free: planForm.is_free === '1',
          sort_order: planForm.sort_order
        })
      });
      const data: any = await res.json();
      if (res.ok) {
        addNotification(planModal.mode === 'create' ? 'प्लान सफलतापूर्वक जोड़ा गया' : 'प्लान सफलतापूर्वक अपडेट किया गया');
        setPlanModal({ open: false, mode: 'create' });
        loadPlans();
      } else {
        addNotification(data.error || 'ऑपरेशन विफल रहा', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm('क्या आप वाकई इस प्लान को हटाना चाहते हैं?')) return;
    try {
      const res = await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addNotification('प्लान को सफलतापूर्वक हटा दिया गया है');
        loadPlans();
      } else {
        addNotification('प्लान हटाने में विफल', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  // Handle KV Key Action (Save/Delete)
  const saveKvSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Preserve existing JSON array values when the admin leaves the value blank on edit
      // (array values are config lists, not secrets, and are intentionally not shown in the form)
      let valueToSave = kvForm.value;
      if (valueToSave === '' && kvModal.data && typeof kvModal.data.value === 'string' && kvModal.data.value.startsWith('[')) {
        valueToSave = kvModal.data.value;
      }
      const res = await fetch('/api/admin/kv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: kvForm.name, value: valueToSave })
      });
      const data: any = await res.json();
      if (res.ok) {
        addNotification('KV सीक्रेट सफलतापूर्वक सहेजा गया');
        setKvModal({ open: false });
        loadKvSecrets();
      } else {
        addNotification(data.error || 'सहेजने में विफल', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  const deleteKvSecret = async (keyName: string) => {
    if (!confirm(`क्या आप वाकई KV की "${keyName}" को हटाना चाहते हैं?`)) return;
    try {
      const res = await fetch(`/api/admin/kv/${encodeURIComponent(keyName)}`, { method: 'DELETE' });
      if (res.ok) {
        addNotification('KV की सफलतापूर्वक हटाई गई');
        loadKvSecrets();
      } else {
        addNotification('हटाने में विफल', 'error');
      }
    } catch {
      addNotification('सर्वर एरर', 'error');
    }
  };

  // Toggle Masked KV Value
  const toggleKvReveal = (keyName: string) => {
    setRevealedKvKeys(prev => ({ ...prev, [keyName]: !prev[keyName] }));
  };

  // Filter lists in client-side search
  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.name?.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [users, userSearch]);

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter(w => 
      w.name?.toLowerCase().includes(workspaceSearch.toLowerCase()) ||
      w.member_emails?.toLowerCase().includes(workspaceSearch.toLowerCase())
    );
  }, [workspaces, workspaceSearch]);

  const filteredKvKeys = useMemo(() => {
    return kvKeys.filter(k => 
      k.name?.toLowerCase().includes(kvSearch.toLowerCase()) ||
      k.value?.toLowerCase().includes(kvSearch.toLowerCase())
    );
  }, [kvKeys, kvSearch]);

  if (loadingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950 text-white">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-surface-400 font-mono tracking-wide">प्रशासक क्रेडेंशियल्स की जाँच की जा रही है...</p>
        </div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950 text-white px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-surface-900 border border-surface-800 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-transparent pointer-events-none"></div>
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2 font-display">अस्वीकृत प्रवेश (Access Denied)</h2>
          <p className="text-surface-400 text-sm mb-6 leading-relaxed">
            आपके पास इस व्यवस्थापक कंसोल को एक्सेस करने का अधिकार नहीं है। यह पृष्ठ केवल अधिकृत सिस्टम प्रशासकों के लिए आरक्षित है।
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => router.push('/dashboard/')} 
              className="w-full bg-primary-600 hover:bg-primary-500 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary-600/25"
            >
              <ArrowLeft className="w-4 h-4" />
              क्लाइंट डैशबोर्ड पर वापस जाएं
            </button>
            <button 
              onClick={() => router.push('/login/')} 
              className="w-full bg-surface-800 hover:bg-surface-700 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              दूसरे खाते से लॉग इन करें
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-950 text-surface-100 font-sans">
      {/* Toast Notification Box */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, y: -10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={`p-4 rounded-2xl border text-xs font-semibold shadow-2xl flex items-center gap-3 backdrop-blur-md pointer-events-auto ${
                n.type === 'error' 
                  ? 'bg-rose-950/90 border-rose-800 text-rose-300' 
                  : 'bg-surface-900/90 border-surface-800 text-emerald-400'
              }`}
            >
              {n.type === 'error' ? <ShieldAlert className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Admin Sidebar */}
      <aside className={`w-72 bg-surface-900 border-r border-surface-800 flex flex-col flex-shrink-0 fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-surface-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/35">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white font-display">प्रशासक कंसोल</h1>
            <p className="text-[10px] text-surface-500 font-mono">DHEETANTRA PLATFORM</p>
          </div>
        </div>

        <nav className="flex-1 min-h-0 px-4 py-6 space-y-2 overflow-y-auto">
          <div className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-4 px-3">कंट्रोल सेंटर</div>
          
          <SidebarButton 
            icon={<LayoutDashboard className="w-4 h-4" />} 
            label="अवलोकन (Overview)" 
            active={activeTab === 'overview'} 
            onClick={() => { setActiveTab('overview'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<Users className="w-4 h-4" />} 
            label="उपयोगकर्ता (Users)" 
            active={activeTab === 'users'} 
            onClick={() => { setActiveTab('users'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<Building2 className="w-4 h-4" />} 
            label="वर्कस्पेस (Workspaces)" 
            active={activeTab === 'workspaces'} 
            onClick={() => { setActiveTab('workspaces'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<CreditCard className="w-4 h-4" />} 
            label="सब्सक्रिप्शन प्लान्स" 
            active={activeTab === 'plans'} 
            onClick={() => { setActiveTab('plans'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<Globe className="w-4 h-4" />} 
            label="डोमेन रिव्यू (Email)" 
            active={activeTab === 'domains'} 
            onClick={() => { setActiveTab('domains'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<Key className="w-4 h-4" />} 
            label="KV सिस्टम सीक्रेट्स" 
            active={activeTab === 'kv'} 
            onClick={() => { setActiveTab('kv'); setSidebarOpen(false); }} 
          />
          <SidebarButton 
            icon={<Database className="w-4 h-4" />} 
            label="डेटाबेस (Database)" 
            active={activeTab === 'database'} 
            onClick={() => { setActiveTab('database'); setSidebarOpen(false); }} 
          />
        </nav>

        <div className="p-4 border-t border-surface-800 bg-surface-950/40">
          <button 
            onClick={() => router.push('/dashboard/')}
            className="w-full py-2.5 px-4 bg-surface-800 hover:bg-surface-700 rounded-xl text-xs font-semibold text-surface-300 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            क्लाइंट डैशबोर्ड पर लौटें
          </button>
          
          <div className="mt-4 flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
              {adminUser?.name?.[0]?.toUpperCase() || adminUser?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{adminUser?.name || 'Administrator'}</p>
              <p className="text-[10px] text-surface-500 truncate">{adminUser?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface-950">
        <header className="h-16 border-b border-surface-800 bg-surface-900/60 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              title="मेनू खोलें"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white capitalize font-display">
              {activeTab === 'overview' && 'सिस्टम अवलोकन'}
              {activeTab === 'users' && 'उपयोगकर्ता प्रबंधन'}
              {activeTab === 'workspaces' && 'वर्कस्पेस प्रबंधन'}
              {activeTab === 'plans' && 'प्लान कैटलॉग'}
              {activeTab === 'domains' && 'डोमेन रिव्यू (Email Domains)'}
              {activeTab === 'kv' && 'KV क्लाउड सीक्रेट्स'}
              {activeTab === 'database' && 'डेटाबेस (Database)'}
            </h2>
            <div className="px-2 py-0.5 bg-primary-500/15 text-primary-400 rounded-full text-[10px] font-mono border border-primary-500/20 uppercase">
              Admin Mode
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (activeTab === 'overview') loadStats();
                if (activeTab === 'users') loadUsers();
                if (activeTab === 'workspaces') loadWorkspaces();
                if (activeTab === 'plans') loadPlans();
                if (activeTab === 'domains') loadAdminDomains();
                if (activeTab === 'kv') loadKvSecrets();
                if (activeTab === 'database') loadSchemaDiff();
                addNotification('डाटा रिफ्रेश किया गया');
              }}
              className="p-2 rounded-xl text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
              title="रिफ्रेश करें"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                {/* Statistics Cards Grid */}
                {loadingStats ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-28 bg-surface-900/50 border border-surface-800/80 rounded-2xl animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatCard title="कुल उपयोगकर्ता (Users)" value={stats?.users || '0'} icon={<Users className="w-5 h-5 text-primary-400" />} subtitle="CRM और स्टाफ सदस्य" />
                    <StatCard title="सक्रिय वर्कस्पेस" value={stats?.workspaces || '0'} icon={<Building2 className="w-5 h-5 text-violet-400" />} subtitle="विभागीय संगठन" />
                    <StatCard title="WABA फोन नंबर" value={stats?.whatsapp || '0'} icon={<Database className="w-5 h-5 text-emerald-400" />} subtitle="Meta APIs कनेक्टेड" />
                    <StatCard title="व्हाट्सएप संदेश" value={stats?.messages || '0'} icon={<Activity className="w-5 h-5 text-sky-400" />} subtitle="सिस्टम थ्रूपुट वॉल्यूम" />
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Health Status Dashboard */}
                  <div className="lg:col-span-2 bg-surface-900 border border-surface-800 rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 rounded-full blur-3xl"></div>
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-surface-400 mb-6">सिस्टम स्वास्थ्य और बुनियादी ढांचा</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-surface-950/60 rounded-2xl border border-surface-800/40">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-semibold">Cloudflare Workers Gateway</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900">OPERATIONAL</span>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-surface-950/60 rounded-2xl border border-surface-800/40">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-semibold">SQLite D1 Database</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900">ACTIVE</span>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-surface-950/60 rounded-2xl border border-surface-800/40">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-semibold">SECRETS_KV Store</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900">ONLINE</span>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-4 pt-6 border-t border-surface-800/60">
                      <div className="text-center p-3 bg-surface-950/30 rounded-xl border border-surface-800/40 flex-1">
                        <p className="text-[10px] text-surface-500">संपर्क लीड्स</p>
                        <p className="text-lg font-bold text-white mt-1">{stats?.contacts || '0'}</p>
                      </div>
                      <div className="text-center p-3 bg-surface-950/30 rounded-xl border border-surface-800/40 flex-1">
                        <p className="text-[10px] text-surface-500">ब्रॉडकास्ट कैंपेन</p>
                        <p className="text-lg font-bold text-white mt-1">{stats?.campaigns || '0'}</p>
                      </div>
                      <div className="text-center p-3 bg-surface-950/30 rounded-xl border border-surface-800/40 flex-1">
                        <p className="text-[10px] text-surface-500">कॉल रिकॉर्ड्स</p>
                        <p className="text-lg font-bold text-white mt-1">{stats?.calls || '0'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Administrative Quick Actions */}
                  <div className="bg-surface-900 border border-surface-800 rounded-3xl p-6">
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-surface-400 mb-6">त्वरित प्रशासनिक क्रियाएं</h3>
                    <div className="space-y-3">
                      <QuickActionButton label="नया उपयोगकर्ता पंजीकृत करें" onClick={() => { setUserModal({ open: true, mode: 'create' }); setUserForm({ name: '', email: '', is_registered: true }); setActiveTab('users'); }} />
                      <QuickActionButton label="नया वर्कस्पेस बनाएं" onClick={() => { setWorkspaceModal({ open: true, mode: 'create' }); setWorkspaceForm({ name: '', plan_id: '', owner_id: '' }); setActiveTab('workspaces'); }} />
                      <QuickActionButton label="सब्सक्रिप्शन प्लान जोड़ें" onClick={() => { setPlanModal({ open: true, mode: 'create' }); setPlanForm(defaultPlanForm); setActiveTab('plans'); }} />
                      <QuickActionButton label="KV सीक्रेट कुंजी जोड़ें" onClick={() => { setKvModal({ open: true }); setKvForm({ name: '', value: '' }); setActiveTab('kv'); }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'users' && (
              <motion.div
                key="users"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Search & Registration Action Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
                    <input 
                      type="text" 
                      placeholder="नाम या ईमेल द्वारा उपयोगकर्ता खोजें..." 
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-900 border border-surface-800 rounded-2xl text-xs text-white focus:outline-none focus:border-primary-500 placeholder-surface-500 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setUserForm({ email: '', name: '', is_registered: true });
                      setUserModal({ open: true, mode: 'create' });
                    }}
                    className="py-2.5 px-4 bg-primary-600 hover:bg-primary-500 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    उपयोगकर्ता पंजीकृत करें
                  </button>
                </div>

                {/* Users Table */}
                <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                  {loadingUsers ? (
                    <div className="p-8 text-center text-surface-500 text-xs">लोड हो रहा है...</div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-surface-500 space-y-2">
                      <Users className="w-10 h-10 text-surface-700 mx-auto" />
                      <p className="text-xs">कोई उपयोगकर्ता नहीं मिला</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-800 bg-surface-950/30 text-[10px] font-bold tracking-wider text-surface-400 uppercase">
                            <th className="px-6 py-4">नाम (Name)</th>
                            <th className="px-6 py-4">ईमेल (Email)</th>
                            <th className="px-6 py-4">पंजीकरण स्थिति</th>
                            <th className="px-6 py-4">दिनांक</th>
                            <th className="px-6 py-4 text-right">कार्य</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/60 text-xs text-surface-300">
                          {filteredUsers.map(u => (
                            <tr key={u.id} className="hover:bg-surface-800/20 transition-colors">
                              <td className="px-6 py-4 font-semibold text-white">{u.name || 'Anonymous User'}</td>
                              <td className="px-6 py-4 font-mono">{u.email}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  u.is_registered 
                                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' 
                                    : 'bg-amber-950/30 text-amber-400 border-amber-900/40'
                                }`}>
                                  {u.is_registered ? 'पंजीकृत (Active)' : 'लंबित (Pending)'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-surface-500 font-mono text-[10px]">
                                {u.created_at ? formatAdminDate(u.created_at) : 'N/A'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => {
                                      setUserForm({ email: u.email || '', name: u.name || '', is_registered: u.is_registered === 1 || u.is_registered === true });
                                      setUserModal({ open: true, mode: 'edit', data: u });
                                    }}
                                    className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-white transition-colors"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => deleteUser(u.id)}
                                    className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'workspaces' && (
              <motion.div
                key="workspaces"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Search & Actions Area */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
                    <input 
                      type="text" 
                      placeholder="वर्कस्पेस या सदस्यों द्वारा खोजें..." 
                      value={workspaceSearch}
                      onChange={e => setWorkspaceSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-900 border border-surface-800 rounded-2xl text-xs text-white focus:outline-none focus:border-primary-500 placeholder-surface-500 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setWorkspaceForm({ name: '', plan_id: '', owner_id: '' });
                      setWorkspaceModal({ open: true, mode: 'create' });
                    }}
                    className="py-2.5 px-4 bg-primary-600 hover:bg-primary-500 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    वर्कस्पेस बनाएं
                  </button>
                </div>

                {/* Workspaces Table */}
                <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                  {loadingWorkspaces ? (
                    <div className="p-8 text-center text-surface-500 text-xs">लोड हो रहा है...</div>
                  ) : filteredWorkspaces.length === 0 ? (
                    <div className="p-12 text-center text-surface-500 space-y-2">
                      <Building2 className="w-10 h-10 text-surface-700 mx-auto" />
                      <p className="text-xs">कोई वर्कस्पेस नहीं मिला</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-800 bg-surface-950/30 text-[10px] font-bold tracking-wider text-surface-400 uppercase">
                            <th className="px-6 py-4">वर्कस्पेस का नाम (Workspace Name)</th>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">संबद्ध प्लान (Plan)</th>
                            <th className="px-6 py-4">सदस्य ईमेल (Members)</th>
                            <th className="px-6 py-4 text-right">कार्य</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/60 text-xs text-surface-300">
                          {filteredWorkspaces.map(w => (
                            <tr key={w.id} className="hover:bg-surface-800/20 transition-colors">
                              <td className="px-6 py-4 font-semibold text-white">{w.name}</td>
                              <td className="px-6 py-4 font-mono text-[10px] text-surface-500">{w.id}</td>
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 bg-primary-500/10 text-primary-400 border border-primary-500/15 rounded-full text-[10px] font-semibold">
                                  {w.plan_name || 'No Plan'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-surface-400 truncate max-w-xs" title={w.member_emails}>
                                {w.member_emails ? w.member_emails.split(',').join(', ') : 'No members'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => {
                                      setWorkspaceForm({ name: w.name || '', plan_id: w.plan_id || '', owner_id: w.owner_id || '' });
                                      setWorkspaceModal({ open: true, mode: 'edit', data: w });
                                    }}
                                    className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-white transition-colors"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={() => deleteWorkspace(w.id)}
                                    className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'plans' && (
              <motion.div
                key="plans"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Actions Row */}
                <div className="flex justify-between items-center">
                  <p className="text-xs text-surface-400">प्लेटफ़ॉर्म पर उपलब्ध विभिन्न सदस्यता योजनाओं को प्रबंधित करें।</p>
                  <button 
                    onClick={() => {
                      setPlanForm(defaultPlanForm);
                      setPlanModal({ open: true, mode: 'create' });
                    }}
                    className="py-2.5 px-4 bg-primary-600 hover:bg-primary-500 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    प्लान जोड़ें (Add Plan)
                  </button>
                </div>

                {/* Plans List Cards */}
                {loadingPlans ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
                    {[1, 2, 3].map(i => <div key={i} className="h-64 bg-surface-900 rounded-3xl border border-surface-800"></div>)}
                  </div>
                ) : plans.length === 0 ? (
                  <div className="p-12 text-center bg-surface-900 border border-surface-800 rounded-3xl text-surface-500">
                    <CreditCard className="w-10 h-10 mx-auto mb-2 text-surface-700" />
                    <p className="text-xs">कोई सदस्यता प्लान नहीं मिला</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map(p => {
                      let parsedFeatures = [];
                      try {
                        parsedFeatures = p.features_json ? JSON.parse(p.features_json) : [];
                      } catch {
                        parsedFeatures = p.features_json ? [p.features_json] : [];
                      }
                      let parsedLimits: Record<string, any> = {};
                      try {
                        parsedLimits = p.limits_json ? JSON.parse(p.limits_json) : {};
                      } catch { /* ignore */ }

                      return (
                        <div key={p.id} className="bg-surface-900 border border-surface-800 rounded-3xl p-6 flex flex-col justify-between hover:border-primary-500/30 transition-all relative overflow-hidden group">
                          <div className="absolute inset-0 bg-gradient-to-tr from-primary-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                          
                          <div>
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h3 className="text-lg font-bold text-white font-display">{p.name}</h3>
                                <p className="text-[10px] text-surface-500 font-mono mt-0.5">{p.id}</p>
                              </div>
                              <div className="flex gap-1">
                                <button 
                                  onClick={() => {
                                    let parsedFeaturesList = [];
                                    try { parsedFeaturesList = JSON.parse(p.features_json || '[]'); } catch { parsedFeaturesList = []; }
                                    if (!Array.isArray(parsedFeaturesList)) parsedFeaturesList = [];

                                    let parsedLimitsObj: any = {};
                                    try { parsedLimitsObj = JSON.parse(p.limits_json || '{}'); } catch { parsedLimitsObj = {}; }

                                    setPlanForm({
                                      id: p.id || '',
                                      name: p.name || '',
                                      description: p.description || '',
                                      upfront_price: String(p.upfront_price || '0'),
                                      pay_as_you_go_rate: String(p.pay_as_you_go_rate || '0'),
                                      features: parsedFeaturesList.map((f: string) => ({ id: Math.random().toString(36).substr(2, 9), value: f })),
                                      limits: {
                                        email_monthly_limit: parsedLimitsObj.email_monthly_limit !== undefined ? String(parsedLimitsObj.email_monthly_limit) : '',
                                        max_domains: parsedLimitsObj.max_domains !== undefined ? String(parsedLimitsObj.max_domains) : '',
                                        max_mailboxes_per_domain: parsedLimitsObj.max_mailboxes_per_domain !== undefined ? String(parsedLimitsObj.max_mailboxes_per_domain) : ''
                                      },
                                      billing_type: p.billing_type || 'recurring',
                                      billing_period: p.billing_period || 'monthly',
                                      billing_interval: String(p.billing_interval || '1'),
                                      currency: p.currency || 'INR',
                                      is_active: String(p.is_active ?? '1'),
                                      is_free: String(p.is_free ?? '0'),
                                      sort_order: String(p.sort_order || '0')
                                    });
                                    setPlanModal({ open: true, mode: 'edit', data: p });
                                  }}
                                  className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-white transition-colors"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => deletePlan(p.id)}
                                  className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-rose-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-surface-400 mb-6">{p.description || 'कोई विवरण उपलब्ध नहीं है।'}</p>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${p.is_free === 1 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : p.billing_type === 'recurring' ? 'bg-primary-500/10 text-primary-400 border-primary-500/20' : 'bg-surface-800 text-surface-300 border-surface-700/30'}`}>
                                {p.is_free === 1 ? 'FREE' : p.billing_type === 'recurring' ? 'RECURRING' : 'ONE-TIME'}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-surface-800 text-surface-300 border border-surface-700/30 font-mono">
                                {p.currency || 'INR'} · {p.billing_period || 'monthly'} ({p.billing_interval || 1})
                              </span>
                              {p.is_active !== 1 && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                                  INACTIVE
                                </span>
                              )}
                            </div>

                            <div className="space-y-4 mb-6">
                              <div className="flex items-baseline gap-1 bg-surface-950/40 p-3 rounded-2xl border border-surface-800/40">
                                <span className="text-2xl font-bold text-white font-display">₹{p.upfront_price}</span>
                                <span className="text-[10px] text-surface-500">{p.billing_type === 'recurring' ? '/ महीना' : 'one-time'}</span>
                              </div>
                              <div className="text-xs text-primary-400 bg-primary-500/5 py-1.5 px-3 rounded-xl inline-block border border-primary-500/10 font-mono text-[10px]">
                                PAYG दर: ₹{p.pay_as_you_go_rate} / संदेश
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">शामिल विशेषताएं (Features):</p>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {parsedFeatures.map((f: string, idx: number) => (
                                  <span key={idx} className="text-[10px] bg-surface-800 text-surface-300 py-0.5 px-2 rounded-lg font-medium border border-surface-700/30">
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {Object.keys(parsedLimits).length > 0 && (
                              <div className="mt-4 pt-4 border-t border-surface-800/60 space-y-2">
                                <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Limits:</p>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  {parsedLimits.email_monthly_limit !== undefined && (
                                    <div className="bg-surface-950/40 p-2 rounded-lg border border-surface-800/40">
                                      <span className="text-surface-500">Email/month:</span> <span className="text-white font-mono">{parsedLimits.email_monthly_limit}</span>
                                    </div>
                                  )}
                                  {parsedLimits.max_domains !== undefined && (
                                    <div className="bg-surface-950/40 p-2 rounded-lg border border-surface-800/40">
                                      <span className="text-surface-500">Max domains:</span> <span className="text-white font-mono">{parsedLimits.max_domains}</span>
                                    </div>
                                  )}
                                  {parsedLimits.max_mailboxes_per_domain !== undefined && (
                                    <div className="bg-surface-950/40 p-2 rounded-lg border border-surface-800/40">
                                      <span className="text-surface-500">Mailboxes/domain:</span> <span className="text-white font-mono">{parsedLimits.max_mailboxes_per_domain}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'domains' && (
              <motion.div
                key="domains"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-xs text-surface-400">
                    Customer के द्वारा जोड़े गए custom domains admin approve करने के बाद ही Cloudflare पर onboard होंगे।
                  </p>
                  <div className="flex rounded-xl border border-surface-800 overflow-hidden">
                    {(['pending', 'all'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setDomainFilter(f)}
                        className={`px-3 py-2 text-xs font-semibold transition-colors ${
                          domainFilter === f
                            ? 'bg-primary-600 text-white'
                            : 'bg-surface-900 text-surface-400 hover:bg-surface-800'
                        }`}
                      >
                        {f === 'pending' ? 'Pending Review' : 'All Domains'}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingAdminDomains ? (
                  <div className="p-8 text-center text-surface-500 text-xs">लोड हो रहा है...</div>
                ) : adminDomains.length === 0 ? (
                  <div className="bg-surface-900 border border-surface-800 rounded-3xl p-12 text-center text-surface-500">
                    <Globe className="w-10 h-10 mx-auto mb-3 text-surface-700" />
                    <p className="text-xs">कोई domain नहीं मिला</p>
                  </div>
                ) : (
                  <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-surface-800 bg-surface-950/30 text-[10px] font-bold tracking-wider text-surface-400 uppercase">
                            <th className="px-6 py-4">Domain</th>
                            <th className="px-6 py-4">Workspace</th>
                            <th className="px-6 py-4">Setup</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Review</th>
                            <th className="px-6 py-4">Created</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/60 text-surface-300">
                          {adminDomains.map((d: any) => (
                            <tr key={d.id} className="hover:bg-surface-800/20 transition-colors">
                              <td className="px-6 py-4 font-semibold text-white">{d.domain_name}</td>
                              <td className="px-6 py-4">
                                <div>{d.workspace_name || d.workspace_id}</div>
                                <div className="text-[10px] text-surface-500">{d.owner_emails || ''}</div>
                              </td>
                              <td className="px-6 py-4 uppercase">{d.setup_mode}</td>
                              <td className="px-6 py-4">
                                {d.status === 'suspended' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 uppercase">Suspended</span>
                                ) : (
                                  <span className="capitalize">{d.status}</span>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  d.review_status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : d.review_status === 'rejected'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : 'bg-amber-500/10 text-amber-400'
                                }`}>
                                  {d.review_status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-surface-500">{formatAdminDate(d.created_at)}</td>
                              <td className="px-6 py-4 text-right">
                                {d.review_status === 'pending_review' ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => reviewDomain(d.id, 'approve')}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-[10px] font-semibold transition-colors"
                                    >
                                      <Check className="w-3 h-3" /> Approve
                                    </button>
                                    <button
                                      onClick={() => {
                                        const reason = window.prompt('Rejection reason (optional):');
                                        reviewDomain(d.id, 'reject', reason || undefined);
                                      }}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-white text-[10px] font-semibold transition-colors"
                                    >
                                      <X className="w-3 h-3" /> Reject
                                    </button>
                                  </div>
                                ) : d.status === 'suspended' ? (
                                  <button
                                    onClick={() => reviewDomain(d.id, 'unsuspend')}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-[10px] font-semibold transition-colors"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Unsuspend
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-surface-500">
                                    {d.review_status === 'approved' ? 'Onboarding started' : d.error_message || 'Rejected'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'kv' && (
              <motion.div
                key="kv"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Actions & Filters */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
                    <input 
                      type="text" 
                      placeholder="सीक्रेट कुंजी या मूल्य द्वारा खोजें..." 
                      value={kvSearch}
                      onChange={e => setKvSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-surface-900 border border-surface-800 rounded-2xl text-xs text-white focus:outline-none focus:border-primary-500 placeholder-surface-500 transition-colors"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setKvForm({ name: '', value: '' });
                      setKvModal({ open: true });
                    }}
                    className="py-2.5 px-4 bg-primary-600 hover:bg-primary-500 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    KV की-वैल्यू जोड़ें
                  </button>
                </div>

                {/* KV Secrets List Table */}
                <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                  {loadingKv ? (
                    <div className="p-8 text-center text-surface-500 text-xs">लोड हो रहा है...</div>
                  ) : filteredKvKeys.length === 0 ? (
                    <div className="p-12 text-center text-surface-500 space-y-2">
                      <Key className="w-10 h-10 text-surface-700 mx-auto" />
                      <p className="text-xs">कोई सीक्रेट कुंजी नहीं मिली</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-800 bg-surface-950/30 text-[10px] font-bold tracking-wider text-surface-400 uppercase">
                            <th className="px-6 py-4">कुंजी नाम (Key Name)</th>
                            <th className="px-6 py-4">मूल्य (Secret Value)</th>
                            <th className="px-6 py-4 text-right">कार्य</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/60 text-xs text-surface-300">
                          {filteredKvKeys.map(k => {
                            const isRevealed = revealedKvKeys[k.name] || (k.value || '').startsWith('[');
                            const displayVal = isRevealed ? (k.value ?? '') : '••••••••••••••••••••••••';

                            return (
                              <tr key={k.name} className="hover:bg-surface-800/20 transition-colors">
                                <td className="px-6 py-4 font-bold text-white font-mono">{k.name}</td>
                                <td className="px-6 py-4 font-mono text-surface-400 select-all max-w-lg truncate">
                                  {displayVal}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {!(k.value || '').startsWith('[') && (
                                      <button 
                                        onClick={() => toggleKvReveal(k.name)}
                                        className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-white transition-colors"
                                        title={isRevealed ? "छिपाएं" : "देखें"}
                                      >
                                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => {
                                        setKvForm({ name: k.name, value: (k.value || '').startsWith('[') ? '' : k.value ?? '' });
                                        setKvModal({ open: true, data: k });
                                      }}
                                      className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-white transition-colors"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => deleteKvSecret(k.name)}
                                      className="p-1.5 hover:bg-surface-800 rounded-lg text-surface-400 hover:text-rose-400 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
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
              </motion.div>
            )}

            {activeTab === 'database' && (
              <motion.div
                key="database"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white mb-1">डेटाबेस माइग्रेशन (Database Migration)</h2>
                    <p className="text-sm text-surface-400">स्कीमा की जांच करें और सुरक्षित रूप से डेटाबेस अपडेट करें</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={loadSchemaDiff}
                      disabled={loadingDiff}
                      className="p-2.5 bg-surface-900 border border-surface-800 hover:border-surface-700 hover:bg-surface-800 rounded-xl transition-colors disabled:opacity-50"
                      title="स्थिति रीफ्रेश करें"
                    >
                      <RefreshCw className={`w-4 h-4 text-surface-400 ${loadingDiff ? 'animate-spin' : ''}`} />
                    </button>
                    {schemaDiff?.status === 'needs_migration' && (
                      <button 
                        onClick={async () => {
                          if (confirm("क्या आप सुनिश्चित हैं कि आप डेटाबेस स्कीमा को माइग्रेट करना चाहते हैं?")) {
                            setLoadingDiff(true);
                            try {
                              const res = await fetch('/api/admin/migrate', { method: 'POST' });
                              const data: any = await res.json();
                              if (res.ok) {
                                addNotification(data.message, 'success');
                                loadSchemaDiff();
                              } else {
                                addNotification(data.error || 'माइग्रेशन विफल रहा', 'error');
                                setLoadingDiff(false);
                              }
                            } catch {
                              addNotification('सर्वर एरर', 'error');
                              setLoadingDiff(false);
                            }
                          }
                        }}
                        className="py-2.5 px-6 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs font-semibold text-white transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        स्कीमा अपडेट लागू करें
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-sm p-8">
                  {loadingDiff ? (
                    <div className="flex justify-center items-center py-12">
                      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
                    </div>
                  ) : !schemaDiff ? (
                    <div className="text-center py-12 text-surface-500">डेटा लोड नहीं हो पाया</div>
                  ) : schemaDiff.status === 'up_to_date' ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Check className="w-8 h-8 text-emerald-500" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-bold text-white mb-1">डेटाबेस स्कीमा पूरी तरह अपडेट है</h3>
                        <p className="text-sm text-surface-500">सभी टेबल्स और कॉलम्स source of truth (schema.sql) के साथ sync में हैं।</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-4">
                        <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-semibold text-amber-500 mb-1">माइग्रेशन आवश्यक है</h4>
                          <p className="text-xs text-amber-500/80 leading-relaxed">{schemaDiff.summary}</p>
                        </div>
                      </div>

                      {schemaDiff.missingTables && schemaDiff.missingTables.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-emerald-500" /> 
                            Missing Tables ({schemaDiff.missingTables.length})
                          </h4>
                          <div className="space-y-3">
                            {schemaDiff.missingTables.map((t: any, i: number) => (
                              <div key={i} className="bg-surface-950/50 border border-surface-800 rounded-xl p-4">
                                <div className="text-xs font-bold text-emerald-400 mb-2">{t.name}</div>
                                <pre className="text-[10px] text-surface-500 font-mono whitespace-pre-wrap">{t.sql}</pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {schemaDiff.missingColumns && schemaDiff.missingColumns.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-emerald-500" /> 
                            Missing Columns ({schemaDiff.missingColumns.length})
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-surface-800 text-surface-500">
                                  <th className="py-2 px-4">Table</th>
                                  <th className="py-2 px-4">Column</th>
                                  <th className="py-2 px-4">SQL Statement</th>
                                </tr>
                              </thead>
                              <tbody>
                                {schemaDiff.missingColumns.map((col: any, i: number) => (
                                  <tr key={i} className="border-b border-surface-800/50">
                                    <td className="py-3 px-4 font-mono text-emerald-400">{col.table}</td>
                                    <td className="py-3 px-4 font-mono text-primary-400">{col.column}</td>
                                    <td className="py-3 px-4 font-mono text-surface-500 text-[10px]">{col.sql}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {schemaDiff.extraTables && schemaDiff.extraTables.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500" /> 
                            Unrecognized/Extra Tables ({schemaDiff.extraTables.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {schemaDiff.extraTables.map((t: string, i: number) => (
                              <span key={i} className="px-3 py-1.5 bg-surface-950 border border-surface-800 rounded-lg text-xs font-mono text-surface-400">
                                {t}
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-surface-600 mt-2">These tables exist in the database but are not in schema.sql. They will not be dropped automatically.</p>
                        </div>
                      )}
                      
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ========================================== */}
      {/* DIALOG/MODAL COMPONENT DRAWER FALLBACKS */}
      {/* ========================================== */}

      {/* 1. User Modal */}
      {userModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-800 rounded-3xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white mb-4">
              {userModal.mode === 'create' ? 'नया उपयोगकर्ता पंजीकृत करें' : 'उपयोगकर्ता जानकारी अपडेट करें'}
            </h3>
            
            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">ईमेल एड्रेस</label>
                <input 
                  type="email" 
                  required
                  placeholder="name@company.com"
                  value={userForm.email}
                  disabled={userModal.mode === 'edit'}
                  onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">उपयोगकर्ता का नाम</label>
                <input 
                  type="text" 
                  placeholder="उदा. राहुल शर्मा"
                  value={userForm.name}
                  onChange={e => setUserForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex items-center gap-3 py-2">
                <input 
                  type="checkbox" 
                  id="is_registered"
                  checked={userForm.is_registered}
                  onChange={e => setUserForm(prev => ({ ...prev, is_registered: e.target.checked }))}
                  className="rounded bg-surface-950 border-surface-800 text-primary-600 focus:ring-0 w-4 h-4"
                />
                <label htmlFor="is_registered" className="text-xs text-surface-300 font-medium">पंजीकरण को सक्रिय रूप से सक्षम करें (Active Registration)</label>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button 
                  type="button" 
                  onClick={() => setUserModal({ open: false, mode: 'create' })}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-xl text-xs font-semibold text-surface-300 transition-colors"
                >
                  रद्द करें
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs font-semibold text-white transition-colors"
                >
                  सहेजें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Workspace Modal */}
      {workspaceModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-800 rounded-3xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white mb-4">
              {workspaceModal.mode === 'create' ? 'नया वर्कस्पेस बनाएं' : 'वर्कस्पेस कॉन्फ़िगर करें'}
            </h3>
            
            <form onSubmit={saveWorkspace} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">वर्कस्पेस नाम</label>
                <input 
                  type="text" 
                  required
                  placeholder="उदा. मार्केटिंग वर्कस्पेस"
                  value={workspaceForm.name}
                  onChange={e => setWorkspaceForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">सदस्यता योजना (Plan)</label>
                <select 
                  value={workspaceForm.plan_id}
                  onChange={e => setWorkspaceForm(prev => ({ ...prev, plan_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">कोई सदस्यता नहीं (No Plan)</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (₹{p.upfront_price}/mo)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">स्वामी (Owner) ID {workspaceModal.mode === 'create' && '- वैकल्पिक'}</label>
                <input 
                  type="text" 
                  placeholder="उदा. user-uuid-1234"
                  value={workspaceForm.owner_id}
                  onChange={e => setWorkspaceForm(prev => ({ ...prev, owner_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                />
                {workspaceModal.mode === 'edit' && (
                  <p className="text-[10px] text-surface-500 mt-1">खाली रखने पर मौजूदा owner बना रहेगा।</p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button 
                  type="button" 
                  onClick={() => setWorkspaceModal({ open: false, mode: 'create' })}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-xl text-xs font-semibold text-surface-300 transition-colors"
                >
                  रद्द करें
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs font-semibold text-white transition-colors"
                >
                  सहेजें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Subscription Plan Modal */}
      {planModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-800 rounded-3xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white mb-4">
              {planModal.mode === 'create' ? 'नया सदस्यता प्लान जोड़ें' : 'प्लान कॉन्फ़िगरेशन विवरण'}
            </h3>
            
            <form onSubmit={savePlan} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">प्लान ID (ID name)</label>
                <input 
                  type="text" 
                  required
                  placeholder="उदा. tier_pro, enterprise"
                  value={planForm.id}
                  disabled={planModal.mode === 'edit'}
                  onChange={e => setPlanForm(prev => ({ ...prev, id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">प्लान नाम (Display Name)</label>
                <input 
                  type="text" 
                  required
                  placeholder="उदा. Pro Business, Free Starter"
                  value={planForm.name}
                  onChange={e => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">विवरण (Description)</label>
                <textarea 
                  placeholder="प्लान की मुख्य बातों का संक्षेप में वर्णन करें"
                  value={planForm.description}
                  onChange={e => setPlanForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 h-16 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">मासिक मूल्य (₹)</label>
                  <input 
                    type="number" 
                    required
                    placeholder="0"
                    value={planForm.upfront_price}
                    onChange={e => setPlanForm(prev => ({ ...prev, upfront_price: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">PAYG संदेश दर (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="0.10"
                    value={planForm.pay_as_you_go_rate}
                    onChange={e => setPlanForm(prev => ({ ...prev, pay_as_you_go_rate: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">बिलिंग प्रकार (Billing Type)</label>
                  <select
                    value={planForm.billing_type}
                    onChange={e => setPlanForm(prev => ({ ...prev, billing_type: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="recurring">Recurring (Subscriptions)</option>
                    <option value="one_time">One-time (Orders)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">अवधि (Period)</label>
                  <select
                    value={planForm.billing_period}
                    onChange={e => setPlanForm(prev => ({ ...prev, billing_period: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">Interval (हर N अवधि)</label>
                  <input
                    type="number"
                    min="1"
                    value={planForm.billing_interval}
                    onChange={e => setPlanForm(prev => ({ ...prev, billing_interval: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">मुद्रा (Currency)</label>
                  <select
                    value={planForm.currency}
                    onChange={e => setPlanForm(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">क्रम (Sort Order)</label>
                  <input
                    type="number"
                    value={planForm.sort_order}
                    onChange={e => setPlanForm(prev => ({ ...prev, sort_order: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-5 py-1">
                <label className="flex items-center gap-2 text-xs text-surface-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.is_active === '1'}
                    onChange={e => setPlanForm(prev => ({ ...prev, is_active: e.target.checked ? '1' : '0' }))}
                    className="rounded bg-surface-950 border-surface-800 text-primary-600 focus:ring-0 w-4 h-4"
                  />
                  Active (खरीदने योग्य)
                </label>
                <label className="flex items-center gap-2 text-xs text-surface-300 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.is_free === '1'}
                    onChange={e => setPlanForm(prev => ({ ...prev, is_free: e.target.checked ? '1' : '0' }))}
                    className="rounded bg-surface-950 border-surface-800 text-emerald-600 focus:ring-0 w-4 h-4"
                  />
                  Free Plan (डिफ़ॉल्ट / downgrade)
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider">सुविधाएँ (Features)</label>
                  <button
                    type="button"
                    onClick={() => setPlanForm(prev => ({ ...prev, features: [...prev.features, { id: Math.random().toString(36).substr(2, 9), value: '' }] }))}
                    className="text-[10px] bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded border border-primary-500/20 hover:bg-primary-500/20 transition-colors"
                  >
                    + Add Feature
                  </button>
                </div>
                {planForm.features.map((f, i) => (
                  <div key={f.id} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="उदा. Unlimited Messages"
                      value={f.value}
                      onChange={e => {
                        const newFeatures = [...planForm.features];
                        newFeatures[i] = { ...newFeatures[i], value: e.target.value };
                        setPlanForm(prev => ({ ...prev, features: newFeatures }));
                      }}
                      className="flex-1 px-4 py-2 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newFeatures = planForm.features.filter(item => item.id !== f.id);
                        setPlanForm(prev => ({ ...prev, features: newFeatures }));
                      }}
                      className="px-3 py-2 bg-surface-950 border border-surface-800 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {planForm.features.length === 0 && (
                  <div className="text-xs text-surface-500 bg-surface-950/50 p-3 rounded-xl border border-surface-800/50 text-center border-dashed">
                    कोई सुविधा नहीं जोड़ी गई
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-3">Limits (सीमाएँ)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-surface-500 mb-1">Email Monthly Limit</label>
                    <input
                      type="number"
                      placeholder="उदा. 1000"
                      value={planForm.limits?.email_monthly_limit || ''}
                      onChange={e => setPlanForm(prev => ({ ...prev, limits: { ...prev.limits, email_monthly_limit: e.target.value } }))}
                      className="w-full px-4 py-2 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-surface-500 mb-1">Max Domains</label>
                    <input
                      type="number"
                      placeholder="उदा. 5"
                      value={planForm.limits?.max_domains || ''}
                      onChange={e => setPlanForm(prev => ({ ...prev, limits: { ...prev.limits, max_domains: e.target.value } }))}
                      className="w-full px-4 py-2 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-surface-500 mb-1">Max Mailboxes / Domain</label>
                    <input
                      type="number"
                      placeholder="उदा. 10"
                      value={planForm.limits?.max_mailboxes_per_domain || ''}
                      onChange={e => setPlanForm(prev => ({ ...prev, limits: { ...prev.limits, max_mailboxes_per_domain: e.target.value } }))}
                      className="w-full px-4 py-2 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button 
                  type="button" 
                  onClick={() => setPlanModal({ open: false, mode: 'create' })}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-xl text-xs font-semibold text-surface-300 transition-colors"
                >
                  रद्द करें
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs font-semibold text-white transition-colors"
                >
                  सहेजें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. KV Key/Value Modal */}
      {kvModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-900 border border-surface-800 rounded-3xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white mb-4">
              {kvModal.data ? 'KV सीक्रेट कुंजी अपडेट करें' : 'नया KV कुंजी-मूल्य सहेजें'}
            </h3>
            
            <form onSubmit={saveKvSecret} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">कुंजी (Key Name)</label>
                <input 
                  type="text" 
                  required
                  placeholder="उदा. WHATSAPP_API_TOKEN, FB_APP_ID"
                  value={kvForm.name}
                  disabled={!!kvModal.data}
                  onChange={e => setKvForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 font-mono text-[11px] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-surface-500 uppercase tracking-wider mb-2">मूल्य (Value string)</label>
                <textarea 
                  required
                  placeholder="यहाँ सीक्रेट मूल्य दर्ज करें..."
                  value={kvForm.value}
                  onChange={e => setKvForm(prev => ({ ...prev, value: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-surface-950 border border-surface-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500 font-mono text-[11px] h-32"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button 
                  type="button" 
                  onClick={() => setKvModal({ open: false })}
                  className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-xl text-xs font-semibold text-surface-300 transition-colors"
                >
                  रद्द करें
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl text-xs font-semibold text-white transition-colors"
                >
                  सुरक्षित सहेजें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponents helper
function SidebarButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-medium transition-all duration-150 ${
        active 
          ? 'bg-primary-600 text-white shadow-md shadow-primary-600/15 font-semibold' 
          : 'text-surface-400 hover:bg-surface-800/40 hover:text-white'
      }`}
    >
      <span className={active ? 'text-white' : 'text-surface-400'}>{icon}</span>
      {label}
    </button>
  );
}

function StatCard({ title, value, icon, subtitle }: { title: string, value: string, icon: React.ReactNode, subtitle?: string }) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-3xl p-6 relative group overflow-hidden shadow-sm">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-surface-800/20 to-transparent pointer-events-none"></div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-surface-400 text-xs font-medium">{title}</h4>
        <div className="w-8 h-8 rounded-lg bg-surface-950 flex items-center justify-center border border-surface-800">{icon}</div>
      </div>
      <div className="text-3xl font-extrabold tracking-tight text-white font-display mb-1">{value}</div>
      {subtitle && <p className="text-[10px] text-surface-500 font-medium">{subtitle}</p>}
    </div>
  );
}

function QuickActionButton({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2.5 px-4 bg-surface-950 hover:bg-surface-800 border border-surface-800/80 hover:border-primary-500/25 rounded-2xl text-xs font-medium text-left flex items-center justify-between group transition-all"
    >
      <span className="text-surface-300 group-hover:text-white transition-colors">{label}</span>
      <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}
