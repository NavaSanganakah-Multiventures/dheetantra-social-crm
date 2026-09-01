import { useState, useEffect } from 'react';
import { Bot, MessageSquare, Megaphone, Settings, User, Users, UserPlus, UserX, Phone, PhoneCall, Trash2, Edit, Instagram, Facebook, CreditCard, CalendarClock, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { formatUserDateOnly } from '../lib/dates';
import { SubscriptionModal } from './SubscriptionModal';
import { PlivoSettingsSection } from './PlivoSettingsSection';

export function SettingsView() {
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

    // Workspace Members
    const [members, setMembers] = useState<any[] | null>(null);
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
    const [addingMember, setAddingMember] = useState(false);
    const [currentRole, setCurrentRole] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('workspaceRole') || '' : ''));

    // Fetch the caller's role for the active workspace straight from the server
    // (workspace_members), so the member-management UI reflects the live role
    // instead of a value cached once at mount/login.
    const refreshCurrentRole = async () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      try {
        const res = await fetch('/api/workspace', {
          headers: { 'x-workspace-id': wId }
        });
        if (!res.ok) return;
        const data: any = await res.json();
        if (data.currentRole) {
          setCurrentRole(data.currentRole);
          localStorage.setItem('workspaceRole', data.currentRole);
        }
      } catch (e) {
        console.error("Failed to refresh current role:", e);
      }
    };

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
          setProfileMessage("Profile updated. Refresh the page for the changes to take effect.");
          localStorage.setItem('userTimezone', userTimezone);
        } else {
          setProfileMessage("Error: " + (data.error || "Unknown"));
        }
      } catch (e) {
        setProfileMessage("Error updating.");
      } finally {
        setSavingProfile(false);
      }
    };

    const [configs, setConfigs] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Plan & Billing
    const [billing, setBilling] = useState<{ subscription: any; plan: any } | null>(null);
    const [payments, setPayments] = useState<any[]>([]);
    const [billingLoading, setBillingLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [showSubscription, setShowSubscription] = useState(false);


    const loadMembers = async () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      refreshCurrentRole();
      try {
        const res = await fetch('/api/workspace/members', {
          headers: { 'x-workspace-id': wId }
        });
        const data: any = await res.json();
        setMembers(data.members || []);
      } catch (e) {
        console.error("Failed to load members:", e);
        setMembers([]);
      }
    };

    const addMember = async () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId || !newMemberEmail.trim()) return;
      setAddingMember(true);
      try {
        const res = await fetch('/api/workspace/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
          body: JSON.stringify({ email: newMemberEmail.trim(), role: newMemberRole })
        });
        const data: any = await res.json();
        if (res.ok) {
          setNewMemberEmail("");
          setNewMemberRole('member');
          loadMembers();
        } else {
          alert(data.error || "Failed to add member");
        }
      } catch (e) {
        alert("Failed to add member");
      } finally {
        setAddingMember(false);
      }
    };

    const changeRole = async (userId: string, role: string) => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      try {
        const res = await fetch(`/api/workspace/members/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
          body: JSON.stringify({ role })
        });
        const data: any = await res.json();
        if (res.ok) {
          loadMembers();
        } else {
          alert(data.error || "Failed to change role");
        }
      } catch (e) {
        alert("Failed to change role");
      }
    };

    const removeMember = async (userId: string) => {
      if (!confirm("Are you sure you want to remove this member?")) return;
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      try {
        const res = await fetch(`/api/workspace/members/${userId}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': wId }
        });
        const data: any = await res.json();
        if (res.ok) {
          loadMembers();
        } else {
          alert(data.error || "Failed to delete");
        }
      } catch (e) {
        alert("Failed to delete");
      }
    };

    const loadBilling = () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      const headers = { 'x-workspace-id': wId };
      Promise.all([
        fetch('/api/billing/subscription', { headers }).then(r => r.json()),
        fetch('/api/billing/payments', { headers }).then(r => r.json()),
      ]).then(([subData, payData]: any[]) => {
        setBilling(subData);
        setPayments(payData.payments || []);
      }).catch(err => console.error("Failed to load billing:", err))
        .finally(() => setBillingLoading(false));
    };

    useEffect(() => {
      loadBilling();
    }, []);

    const cancelSubscription = async () => {
      if (!billing?.subscription) return;
      if (!confirm("Are you sure you want to cancel your subscription? It will stop at the end of the current billing period.")) return;
      setCancelling(true);
      try {
        const res = await fetch('/api/billing/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
          body: JSON.stringify({ subscription_id: billing.subscription.id }),
        });
        const data: any = await res.json();
        if (res.ok) {
          loadBilling();
          alert("Subscription cancelled. It will take effect at the end of the billing period.");
        } else {
          alert(data.error || "Failed to cancel.");
        }
      } catch {
        alert("Server error. Please try again.");
      } finally {
        setCancelling(false);
      }
    };

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
      if (!confirm("Are you sure you want to delete this WhatsApp account?")) return;
      try {
        const res = await fetch(`/api/whatsapp/config/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
        });
        const data: any = await res.json();
        if (data.success) {
          setMessage("Account deleted successfully.");
          loadAllConfigs();
        } else {
          alert(data.error || "Failed to delete");
        }
      } catch (e) {
        alert("Something went wrong");
      }
    };

    const startEditing = (cfg: any) => {
      setEditingId(cfg.id);
      setPhoneNumberId(cfg.phone_number_id || "");
      setWabaId(cfg.waba_id || "");
      setVerifyToken(cfg.verify_token || "");
      setAccessToken("••••••••••••••••");
      setReplyMode(cfg.reply_mode || "manual");
      setMessage("Editing account...");
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
              setMessage("Embedded Signup complete, registering on server...");
              
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
                      setMessage(`Tech provider onboarding successful! WABA: ${res.waba}`);
                      setPhoneNumberId(phone_number_id);
                      setWabaId(waba_id);
                  } else {
                      setMessage(`Tech provider onboarding failed: ${res.error}`);
                  }
              }).catch(() => {
                  setMessage("Error contacting the server.");
              });
            } else if (data.event === 'CANCEL') {
              setMessage("Signup cancelled.");
            } else if (data.event === 'ERROR') {
              setMessage("Signup failed.");
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
         setMessage("Tech provider Config ID is not loaded.");
         return;
      }
      if (typeof window !== 'undefined' && (window as any).FB) {
        (window as any).FB.login((response: any) => {
          if (response.authResponse) {
          } else {
             setMessage("Signup cancelled or failed.");
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
        setMessage("Facebook SDK is loading or not configured. Please try again.");
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
          setMessage(editingId ? "Configuration updated successfully!" : "Configuration saved successfully!");
          setPhoneNumberId("");
          setWabaId("");
          setAccessToken("");
          setVerifyToken("");
          setEditingId(null);
          loadAllConfigs();
        } else {
          setMessage("Error: " + (data.error || "Unknown"));
        }
      } catch (e) {
         setMessage("Unable to save.");
      } finally {
         setSaving(false);
      }
    };

    useEffect(() => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      fetch('/api/workspace/members', {
        headers: { 'x-workspace-id': wId }
      })
        .then(r => r.json())
        .then((data: any) => setMembers(data.members || []))
        .catch((e) => {
          console.error("Failed to load members:", e);
          setMembers([]);
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <>
        <div className="p-6 md:p-8 w-full max-w-4xl mx-auto space-y-6">
             <h2 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white font-display">Workspace Settings</h2>

             {/* Plan & Billing Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <CreditCard className="w-5 h-5 text-primary-500" /> Plan & Billing
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">Your current plan, subscription status and payment history.</p>

                     {billingLoading ? (
                       <div className="flex items-center gap-3 text-sm text-surface-500 py-6">
                         <RefreshCw className="w-4 h-4 animate-spin" /> Loading billing information...
                       </div>
                     ) : (
                       <div className="space-y-6">
                         {/* Current plan card */}
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-2xl p-5">
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl bg-primary-600/10 border border-primary-500/20 flex items-center justify-center">
                               <CreditCard className="w-5 h-5 text-primary-500" />
                             </div>
                             <div>
                               <div className="flex items-center gap-2 flex-wrap">
                                 <span className="font-bold text-surface-900 dark:text-white">{billing?.plan?.name || 'Free'}</span>
                                 {billing?.subscription && (
                                   <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                     billing.subscription.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                                     billing.subscription.status === 'past_due' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                     billing.subscription.status === 'paused' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                     'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                                   }`}>
                                     {billing.subscription.status}
                                   </span>
                                 )}
                               </div>
                               {billing?.subscription && billing.subscription.current_period_end ? (
                                 <p className="text-xs text-surface-500 mt-1 flex items-center gap-1.5">
                                   <CalendarClock className="w-3.5 h-3.5" />
                                   Next billing: {new Date(billing.subscription.current_period_end * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                   {billing.subscription.cancel_at_period_end === 1 && (
                                      <span className="text-amber-600 dark:text-amber-400 font-medium">(will be cancelled at the end of the billing period)</span>
                                   )}
                                 </p>
                               ) : (
                                 <p className="text-xs text-surface-500 mt-1">{billing?.plan?.description || 'No subscription'}</p>
                               )}
                             </div>
                           </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowSubscription(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition-colors"
                              >
                                 <Sparkles className="w-3.5 h-3.5" /> Upgrade
                              </button>
                             {billing?.subscription && ['active', 'past_due', 'paused'].includes(billing.subscription.status) && billing.subscription.cancel_at_period_end !== 1 && (
                               <button
                                 onClick={cancelSubscription}
                                 disabled={cancelling}
                                 className="inline-flex items-center gap-1.5 px-4 py-2 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                               >
                                 {cancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                  Cancel subscription
                               </button>
                             )}
                           </div>
                         </div>

                         {/* Payment history */}
                         <div>
                           <h4 className="text-sm font-bold text-surface-900 dark:text-white mb-3">Payment history</h4>
                           {payments.length === 0 ? (
                             <div className="text-center text-xs text-surface-500 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                                No payments yet.
                             </div>
                           ) : (
                             <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                               <table className="w-full text-left text-sm border-collapse">
                                 <thead>
                                   <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                                     <th className="p-4">Date</th>
                                      <th className="p-4">Payment ID</th>
                                     <th className="p-4">Amount</th>
                                     <th className="p-4">Method</th>
                                     <th className="p-4">Status</th>
                                   </tr>
                                 </thead>
                                 <tbody>
                                   {payments.map((p: any) => (
                                     <tr key={p.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50 dark:hover:bg-surface-900/50">
                                       <td className="p-4 text-xs text-surface-500">{p.created_at ? formatUserDateOnly(p.created_at) : 'N/A'}</td>
                                       <td className="p-4 font-mono text-xs text-surface-600 dark:text-surface-400">{p.razorpay_payment_id || p.id}</td>
                                       <td className="p-4 font-semibold text-surface-900 dark:text-white">{p.currency === 'USD' ? '$' : '₹'}{p.amount}</td>
                                       <td className="p-4 text-xs text-surface-500">{p.method || '-'}</td>
                                       <td className="p-4">
                                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                           p.status === 'captured' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                                           p.status === 'refunded' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                           'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                                         }`}>
                                           {p.status}
                                         </span>
                                       </td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                 </div>
             </div>
             
             {/* Workspace Members Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <Users className="w-5 h-5 text-primary-500" /> Workspace members
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">View members in this workspace and their roles. Only Owners/Admins can add members, change roles or remove them.</p>

                     <div className="flex items-center gap-2 mb-6">
                       <span className="text-sm text-surface-500">Your role:</span>
                       <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                         currentRole === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                         currentRole === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                         'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                       }`}>
                         {currentRole === 'owner' ? 'Owner' : currentRole === 'admin' ? 'Admin' : currentRole === 'member' ? 'Member' : '-'}
                       </span>
                     </div>

                     {(currentRole === 'owner' || currentRole === 'admin') && (
                       <div className="flex flex-col sm:flex-row gap-3 mb-6">
                         <input
                           type="email"
                           value={newMemberEmail}
                           onChange={e => setNewMemberEmail(e.target.value)}
                           placeholder="Member email"
                           className="flex-1 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         />
                         <select
                           value={newMemberRole}
                           onChange={e => setNewMemberRole(e.target.value as 'admin' | 'member')}
                           className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         >
                           <option value="admin">Admin</option>
                           <option value="member">Member</option>
                           {currentRole === 'owner' && <option value="owner">Owner</option>}
                         </select>
                         <button
                           onClick={addMember}
                           disabled={addingMember || !newMemberEmail.trim()}
                           className="bg-primary-600 hover:bg-primary-700 disabled:bg-surface-400 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                           {addingMember ? 'Adding...' : (<><UserPlus className="w-4 h-4" /> Add member</>)}
                         </button>
                       </div>
                     )}

                     {members === null ? (
                       <div className="text-sm text-surface-500 py-6">Loading members...</div>
                     ) : members.length === 0 ? (
                       <div className="text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                         No members found.
                       </div>
                     ) : (
                       <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                         <table className="w-full text-left text-sm border-collapse">
                           <thead>
                             <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                               <th className="p-4">Name</th>
                               <th className="p-4">Email</th>
                               <th className="p-4">Role</th>
                               {(currentRole === 'owner' || currentRole === 'admin') && <th className="p-4 text-right">Action</th>}
                             </tr>
                           </thead>
                           <tbody>
                             {members?.map((m: any) => (
                               <tr key={m.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50">
                                 <td className="p-4 font-medium text-surface-900 dark:text-white">{m.name || '-'}</td>
                                 <td className="p-4 text-surface-600 dark:text-surface-400 text-xs">{m.email}</td>
                                 <td className="p-4">
                                   {currentRole === 'owner' ? (
                                     <select
                                       value={m.role}
                                       onChange={e => changeRole(m.id, e.target.value)}
                                       className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 text-xs outline-none"
                                     >
                                       <option value="member">Member</option>
                                       <option value="admin">Admin</option>
                                       <option value="owner">Owner</option>
                                     </select>
                                   ) : currentRole === 'admin' && m.role !== 'owner' ? (
                                     <select
                                       value={m.role}
                                       onChange={e => changeRole(m.id, e.target.value)}
                                       className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 text-xs outline-none"
                                     >
                                       <option value="member">Member</option>
                                       <option value="admin">Admin</option>
                                     </select>
                                   ) : (
                                     <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                       m.role === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                                       m.role === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                                       'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                                     }`}>
                                       {m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Member'}
                                     </span>
                                   )}
                                 </td>
                                 {(currentRole === 'owner' || currentRole === 'admin') && (
                                   <td className="p-4 text-right">
                                     {(currentRole === 'owner' || m.role !== 'owner') && (
                                       <button
                                         onClick={() => removeMember(m.id)}
                                         className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                         title="Remove"
                                       >
                                         <UserX className="w-4 h-4" />
                                       </button>
                                     )}
                                   </td>
                                 )}
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     )}
                 </div>
             </div>

             {/* User Profile Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <User className="w-5 h-5 text-primary-500" /> User settings
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">Set your preferred timezone so all messages and logs show the correct time.</p>
                     
                     <div className="max-w-xl space-y-4">
                        <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Timezone</label>
                           <select value={userTimezone} onChange={e => setUserTimezone(e.target.value)} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all">
                              <option value="Asia/Kolkata">Indian Standard Time (IST)</option>
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
                          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm shadow-primary-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {savingProfile ? "Saving..." : "Save"}
                        </button>
                        {profileMessage && <p className="text-sm mt-2 text-emerald-600 dark:text-emerald-400 font-medium">{profileMessage}</p>}
                     </div>
                 </div>
             </div>

             {/* WhatsApp Config Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8 border-b border-surface-100 dark:border-surface-800">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <MessageSquare className="w-5 h-5 text-emerald-500" /> WhatsApp Cloud API
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">Connect a WhatsApp Business Account so you can receive live Webhooks and send messages.</p>
                     
                     <div className="space-y-4 max-w-xl">
                         <div className="mb-6 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex flex-col items-start gap-3">
                             <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">Easy setup</h4>
                            <p className="text-xs text-blue-800 dark:text-blue-400">Connect your WhatsApp Business Account in one click using Meta&apos;s official Embedded Signup.</p>
                            <button onClick={launchWhatsAppSignup} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> Login with Facebook
                            </button>
                         </div>
                         
                         <div className="flex items-center gap-4 mb-2">
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                           <span className="text-xs text-surface-400 font-medium uppercase">
                             {editingId ? "Edit configuration" : "or add manual configuration"}
                           </span>
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                         </div>

                         {editingId && (
                           <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-2">
                             <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">Editing: {phoneNumberId || editingId}</span>
                              <button onClick={cancelEditing} className="text-xs text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 underline font-medium">Cancel</button>
                           </div>
                         )}

                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Phone Number ID</label>
                           <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="e.g. 10423049583..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Business Account ID (WABA ID) <span className="text-primary-500 font-normal">[required for templates]</span></label>
                            <input type="text" value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="e.g. 109384729482..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="Enter any secret token of your choice" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                             <PhoneCall className="w-4 h-4 text-emerald-500" /> WhatsApp Voice Calling (SIP WebRTC)
                           </h4>
                           <div className="space-y-4">
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP URI</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="e.g. sip:1234@your-sip-provider.com" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP WebSocket Server</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="e.g. wss://your-sip-provider.com:8089/ws" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP username</label>
                                  <input type="text" value={""} onChange={e => {}} placeholder="Username" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP password</label>
                                  <input type="password" value={""} onChange={e => {}} placeholder="Password" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                             </div>
                           </div>
                         </div>

                         {webhookUrl && (
                           <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 rounded-xl">
                             <p className="text-xs font-semibold text-primary-800 dark:text-primary-300 mb-1">Enter this Webhook URL in the Meta Developer Dashboard:</p>
                             <code className="text-xs text-primary-600 dark:text-primary-400 break-all select-all">{webhookUrl}</code>
                           </div>
                         )}

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                              <Bot className="w-4 h-4 text-primary-500" /> Chatbot & AI settings
                           </h4>
                           <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">Auto-reply mode</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'manual' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'manual' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">Manual</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">Keep auto-reply off. I will reply myself.</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'ai' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'ai' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">AI Chatbot</span>
                               </div>
                                <p className="text-xs text-surface-500 pl-6">Smart replies powered by artificial intelligence.</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'rule_based' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'rule_based' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">Rules</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">Based on predefined keywords.</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2 flex gap-3">
                           <button onClick={saveConfig} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-primary-600/20 flex items-center gap-2">
                             {saving ? "Saving..." : (editingId ? "Update" : "Add new account")}
                           </button>
                           {editingId && (
                             <button onClick={cancelEditing} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                               Cancel
                             </button>
                           )}
                         </div>
                         {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">{message}</p>}
                     </div>
                 </div>

                 {/* Connected Accounts Table */}
                 <div className="p-8 border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                        <Phone className="w-5 h-5 text-primary-500" /> Connected WhatsApp Accounts
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">All active WhatsApp numbers and lines configured in this workspace.</p>
                     
                     {configs.length === 0 ? (
                        <div className="p-8 text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950/30">
                           No connected account found. Add an account above to get started.
                        </div>
                     ) : (
                        <div className="overflow-hidden border border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950">
                           <table className="w-full text-left border-collapse text-sm">
                              <thead>
                                 <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold">
                                    <th className="p-4">Phone Number ID</th>
                                     <th className="p-4">WABA ID</th>
                                    <th className="p-4">Auto-reply mode</th>
                                    <th className="p-4">Connected date</th>
                                     <th className="p-4 text-right">Action</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {configs.map((cfg) => (
                                    <tr key={cfg.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50 dark:hover:bg-surface-900/50 transition-colors">
                                       <td className="p-4 font-mono text-xs font-semibold text-surface-700 dark:text-surface-300">{cfg.phone_number_id}</td>
                                        <td className="p-4 font-mono text-xs text-surface-500">{cfg.waba_id || 'N/A'}</td>
                                       <td className="p-4">
                                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                             cfg.reply_mode === 'ai' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                                             cfg.reply_mode === 'rule_based' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                                             'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300'
                                          }`}>
                                              {cfg.reply_mode === 'ai' ? '🤖 AI Bot' : cfg.reply_mode === 'rule_based' ? '⚡ Rules' : '👤 Manual'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-surface-500">{cfg.created_at ? formatUserDateOnly(cfg.created_at) : 'N/A'}</td>
                                       <td className="p-4 text-right flex justify-end gap-2">
                                          <button onClick={() => startEditing(cfg)} title="Edit" className="p-2 text-surface-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-all">
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => deleteConfig(cfg.id)} title="Delete" className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
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
                      <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display">Social Accounts</h3>
                     <p className="text-sm text-surface-500 mb-6">Connect Instagram and Facebook pages via OAuth.</p>
                     
                     <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
                         <Megaphone className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-4" />
                         <p className="text-sm text-surface-500 font-medium text-center">OAuth integration coming soon</p>
                     </div>
                 </div>
             </div>
        {/* Plivo Voice (Plivo Browser SDK) Settings */}
        <PlivoSettingsSection />

        </div>

        {/* Subscription / Upgrade Popup */}
        <SubscriptionModal
          open={showSubscription}
          onClose={() => setShowSubscription(false)}
          onSuccess={() => {
            setShowSubscription(false);
            loadBilling();
            toast('success', 'Subscription activated successfully!');
          }}
        />
        </>
    )
}

