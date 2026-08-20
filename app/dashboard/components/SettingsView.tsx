import { useState, useEffect } from 'react';
import { Bot, MessageSquare, Megaphone, Settings, User, Users, UserPlus, UserX, Phone, PhoneCall, Trash2, Edit, Instagram, Facebook, CreditCard, CalendarClock, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { formatUserDateOnly } from '../lib/dates';
import { SubscriptionModal } from './SubscriptionModal';

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
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
    const [addingMember, setAddingMember] = useState(false);
    const [currentRole, setCurrentRole] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('workspaceRole') || '' : ''));

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

    // Plan & Billing
    const [billing, setBilling] = useState<{ subscription: any; plan: any } | null>(null);
    const [payments, setPayments] = useState<any[]>([]);
    const [billingLoading, setBillingLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [showSubscription, setShowSubscription] = useState(false);


    const loadMembers = async () => {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      setLoadingMembers(true);
      try {
        const res = await fetch('/api/workspace/members', {
          headers: { 'x-workspace-id': wId }
        });
        const data: any = await res.json();
        if (data.members) {
          setMembers(data.members);
        }
      } catch (e) {
        console.error("Failed to load members:", e);
      } finally {
        setLoadingMembers(false);
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
          alert(data.error || "सदस्य जोड़ने में विफलता");
        }
      } catch (e) {
        alert("सदस्य जोड़ने में विफलता");
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
          alert(data.error || "भूमिका बदलने में विफलता");
        }
      } catch (e) {
        alert("भूमिका बदलने में विफलता");
      }
    };

    const removeMember = async (userId: string) => {
      if (!confirm("क्या आप वाकई इस सदस्य को हटाना चाहते हैं?")) return;
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
          alert(data.error || "हटाने में विफलता");
        }
      } catch (e) {
        alert("हटाने में विफलता");
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
      if (!confirm("क्या आप सब्सक्रिप्शन रद्द करना चाहते हैं? यह वर्तमान बिलिंग अवधि के अंत में बंद हो जाएगा।")) return;
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
          alert("सब्सक्रिप्शन रद्द हो गई। यह बिलिंग अवधि के अंत में प्रभावी होगी।");
        } else {
          alert(data.error || "रद्द करने में विफल।");
        }
      } catch {
        alert("सर्वर एरर। फिर से प्रयास करें।");
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
                      setMessage(`टेक प्रोवाइडर ऑनबोर्डिंग सफल! WABA: ${res.waba}`);
                      setPhoneNumberId(phone_number_id);
                      setWabaId(waba_id);
                  } else {
                      setMessage(`टेक प्रोवाइडर ऑनबोर्डिंग विफल: ${res.error}`);
                  }
              }).catch(() => {
                  setMessage("सर्वर से संपर्क करने में त्रुटि।");
              });
            } else if (data.event === 'CANCEL') {
              setMessage("साइनअप रद्द कर दिया गया।");
            } else if (data.event === 'ERROR') {
              setMessage("साइनअप में त्रुटि आई।");
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
         setMessage("टेक प्रोवाइडर Config ID लोड नहीं हुआ है।");
         return;
      }
      if (typeof window !== 'undefined' && (window as any).FB) {
        (window as any).FB.login((response: any) => {
          if (response.authResponse) {
             console.log("FB login popup successful, waiting for WA_EMBEDDED_SIGNUP message...");
          } else {
             setMessage("साइनअप रद्द कर दिया गया या विफल रहा।");
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

    useEffect(() => {
      loadMembers();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <div className="p-8">लोड हो रहा है...</div>;

    return (
        <>
        <div className="p-6 md:p-8 w-full max-w-4xl mx-auto space-y-6">
             <h2 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white font-display">वर्कस्पेस सेटिंग्स</h2>

             {/* Plan & Billing Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <CreditCard className="w-5 h-5 text-primary-500" /> प्लान और बिलिंग
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">आपका वर्तमान प्लान, सब्सक्रिप्शन स्थिति और भुगतान इतिहास।</p>

                     {billingLoading ? (
                       <div className="flex items-center gap-3 text-sm text-surface-500 py-6">
                         <RefreshCw className="w-4 h-4 animate-spin" /> बिलिंग जानकारी लोड हो रही है...
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
                                   अगली बिलिंग: {new Date(billing.subscription.current_period_end * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                   {billing.subscription.cancel_at_period_end === 1 && (
                                      <span className="text-amber-600 dark:text-amber-400 font-medium">(बिलिंग अवधि के अंत में रद्द हो जाएगी)</span>
                                   )}
                                 </p>
                               ) : (
                                 <p className="text-xs text-surface-500 mt-1">{billing?.plan?.description || 'कोई सब्सक्रिप्शन नहीं'}</p>
                               )}
                             </div>
                           </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowSubscription(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition-colors"
                              >
                                 <Sparkles className="w-3.5 h-3.5" /> अपग्रेड करें
                              </button>
                             {billing?.subscription && ['active', 'past_due', 'paused'].includes(billing.subscription.status) && billing.subscription.cancel_at_period_end !== 1 && (
                               <button
                                 onClick={cancelSubscription}
                                 disabled={cancelling}
                                 className="inline-flex items-center gap-1.5 px-4 py-2 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                               >
                                 {cancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                  सब्सक्रिप्शन रद्द करें
                               </button>
                             )}
                           </div>
                         </div>

                         {/* Payment history */}
                         <div>
                           <h4 className="text-sm font-bold text-surface-900 dark:text-white mb-3">भुगतान इतिहास</h4>
                           {payments.length === 0 ? (
                             <div className="text-center text-xs text-surface-500 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                                अभी तक कोई भुगतान नहीं।
                             </div>
                           ) : (
                             <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                               <table className="w-full text-left text-sm border-collapse">
                                 <thead>
                                   <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                                     <th className="p-4">तिथि</th>
                                      <th className="p-4">भुगतान ID</th>
                                     <th className="p-4">राशि</th>
                                     <th className="p-4">विधि</th>
                                     <th className="p-4">स्थिति</th>
                                   </tr>
                                 </thead>
                                 <tbody>
                                   {payments.map((p: any) => (
                                     <tr key={p.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50 dark:hover:bg-surface-900/50">
                                       <td className="p-4 text-xs text-surface-500">{p.created_at ? formatUserDateOnly(p.created_at) : 'N/A'}</td>
                                       <td className="p-4 font-mono text-xs text-surface-600 dark:text-surface-400">{p.razorpay_payment_id || p.id}</td>
                                       <td className="p-4 font-semibold text-surface-900 dark:text-white">{p.currency === 'USD' ? '$' : '₹'}{p.amount}</td>
                                       <td className="p-4 text-xs text-surface-500">{p.method || '—'}</td>
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
                       <Users className="w-5 h-5 text-primary-500" /> वर्कस्पेस सदस्य
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">इस वर्कस्पेस में जुड़े सदस्य और उनकी भूमिकाएँ देखें। केवल Owner/Admin नए सदस्य जोड़ सकते हैं, Role बदल सकते हैं या हटा सकते हैं।</p>

                     <div className="flex items-center gap-2 mb-6">
                       <span className="text-sm text-surface-500">आपकी भूमिका:</span>
                       <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                         currentRole === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                         currentRole === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                         'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                       }`}>
                         {currentRole === 'owner' ? 'मालिक' : currentRole === 'admin' ? 'एडमिन' : currentRole === 'member' ? 'सदस्य' : '—'}
                       </span>
                     </div>

                     {(currentRole === 'owner' || currentRole === 'admin') && (
                       <div className="flex flex-col sm:flex-row gap-3 mb-6">
                         <input
                           type="email"
                           value={newMemberEmail}
                           onChange={e => setNewMemberEmail(e.target.value)}
                           placeholder="सदस्य का ईमेल"
                           className="flex-1 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         />
                         <select
                           value={newMemberRole}
                           onChange={e => setNewMemberRole(e.target.value as 'admin' | 'member')}
                           className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         >
                           <option value="admin">एडमिन</option>
                           <option value="member">सदस्य</option>
                           {currentRole === 'owner' && <option value="owner">मालिक</option>}
                         </select>
                         <button
                           onClick={addMember}
                           disabled={addingMember || !newMemberEmail.trim()}
                           className="bg-primary-600 hover:bg-primary-700 disabled:bg-surface-400 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                           {addingMember ? 'जोड़ा जा रहा है...' : (<><UserPlus className="w-4 h-4" /> सदस्य जोड़ें</>)}
                         </button>
                       </div>
                     )}

                     {loadingMembers ? (
                       <div className="text-sm text-surface-500 py-6">सदस्य लोड हो रहे हैं...</div>
                     ) : members.length === 0 ? (
                       <div className="text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                         कोई सदस्य नहीं मिला।
                       </div>
                     ) : (
                       <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                         <table className="w-full text-left text-sm border-collapse">
                           <thead>
                             <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                               <th className="p-4">नाम</th>
                               <th className="p-4">ईमेल</th>
                               <th className="p-4">भूमिका</th>
                               {(currentRole === 'owner' || currentRole === 'admin') && <th className="p-4 text-right">कार्रवाई</th>}
                             </tr>
                           </thead>
                           <tbody>
                             {members.map((m: any) => (
                               <tr key={m.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50">
                                 <td className="p-4 font-medium text-surface-900 dark:text-white">{m.name || '—'}</td>
                                 <td className="p-4 text-surface-600 dark:text-surface-400 text-xs">{m.email}</td>
                                 <td className="p-4">
                                   {(currentRole === 'owner' || (currentRole === 'admin' && m.role !== 'owner')) ? (
                                     <select
                                       value={m.role}
                                       onChange={e => changeRole(m.id, e.target.value)}
                                       className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 text-xs outline-none"
                                     >
                                       <option value="member">सदस्य</option>
                                       <option value="admin">एडमिन</option>
                                       {currentRole === 'owner' && <option value="owner">मालिक</option>}
                                     </select>
                                   ) : (
                                     <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                       m.role === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                                       m.role === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                                       'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                                     }`}>
                                       {m.role === 'owner' ? 'मालिक' : m.role === 'admin' ? 'एडमिन' : 'सदस्य'}
                                     </span>
                                   )}
                                 </td>
                                 {(currentRole === 'owner' || currentRole === 'admin') && (
                                   <td className="p-4 text-right">
                                     {(currentRole === 'owner' || m.role !== 'owner') && (
                                       <button
                                         onClick={() => removeMember(m.id)}
                                         className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                         title="हटाएँ"
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
                       <User className="w-5 h-5 text-primary-500" /> उपयोगकर्ता सेटिंग्स
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">अपना पसंदीदा टाइमज़ोन सेट करें ताकि सभी संदेश और लॉग सही समय दिखाएं।</p>
                     
                     <div className="max-w-xl space-y-4">
                        <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">टाइमज़ोन</label>
                           <select value={userTimezone} onChange={e => setUserTimezone(e.target.value)} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all">
                              <option value="Asia/Kolkata">भारतीय मानक समय (IST)</option>
                              <option value="America/New_York">पूर्वी समय (US और Canada)</option>
                              <option value="America/Chicago">केंद्रीय समय (US और Canada)</option>
                              <option value="America/Los_Angeles">प्रशांत समय (US और Canada)</option>
                              <option value="Europe/London">ग्रीनविच मीन टाइम (लंदन)</option>
                              <option value="Europe/Paris">मध्य यूरोपीय समय (पेरिस)</option>
                              <option value="Asia/Dubai">गल्फ मानक समय (दुबई)</option>
                              <option value="Asia/Singapore">सिंगापुर मानक समय</option>
                              <option value="Australia/Sydney">ऑस्ट्रेलियाई पूर्वी समय (सिडनी)</option>
                              <option value="UTC">समन्वित सार्वभौमिक समय (UTC)</option>
                           </select>
                        </div>

                        <button 
                          onClick={saveUserProfile} 
                          disabled={savingProfile} 
                          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm shadow-primary-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {savingProfile ? "सेव हो रहा है..." : "सेव करें"}
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
                     <p className="text-sm text-surface-500 mb-6">WhatsApp Business Account को कनेक्ट करें ताकि आप लाइव Webhooks प्राप्त कर सकें और संदेश भेज सकें।</p>
                     
                     <div className="space-y-4 max-w-xl">
                         <div className="mb-6 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex flex-col items-start gap-3">
                             <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">आसान सेटअप</h4>
                            <p className="text-xs text-blue-800 dark:text-blue-400">Meta के आधिकारिक Embedded Signup के ज़रिए सिर्फ एक क्लिक में अपना WhatsApp Business अकाउंट कनेक्ट करें।</p>
                            <button onClick={launchWhatsAppSignup} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> Facebook के साथ लॉगिन करें
                            </button>
                         </div>
                         
                         <div className="flex items-center gap-4 mb-2">
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                           <span className="text-xs text-surface-400 font-medium uppercase">
                             {editingId ? "कॉन्फ़िगरेशन संपादित करें" : "या मैन्युअल कॉन्फ़िगरेशन जोड़ें"}
                           </span>
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                         </div>

                         {editingId && (
                           <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-2">
                             <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">संपादित किया जा रहा है: {phoneNumberId || editingId}</span>
                              <button onClick={cancelEditing} className="text-xs text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 underline font-medium">रद्द करें</button>
                           </div>
                         )}

                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Phone Number ID</label>
                           <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="जैसे 10423049583..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Business Account ID (WABA ID) <span className="text-primary-500 font-normal">[टेंपलेट्स के लिए आवश्यक]</span></label>
                            <input type="text" value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="जैसे 109384729482..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="अपनी पसंद का कोई भी सीक्रेट टोकन डालें" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                             <PhoneCall className="w-4 h-4 text-emerald-500" /> WhatsApp Voice Calling (SIP WebRTC)
                           </h4>
                           <div className="space-y-4">
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP URI</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="जैसे sip:1234@your-sip-provider.com" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP WebSocket Server</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="जैसे wss://your-sip-provider.com:8089/ws" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP यूज़रनेम</label>
                                  <input type="text" value={""} onChange={e => {}} placeholder="यूज़रनेम" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP पासवर्ड</label>
                                  <input type="password" value={""} onChange={e => {}} placeholder="पासवर्ड" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                             </div>
                           </div>
                         </div>

                         {webhookUrl && (
                           <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 rounded-xl">
                             <p className="text-xs font-semibold text-primary-800 dark:text-primary-300 mb-1">Meta Developer Dashboard में यह Webhook URL डालें:</p>
                             <code className="text-xs text-primary-600 dark:text-primary-400 break-all select-all">{webhookUrl}</code>
                           </div>
                         )}

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                              <Bot className="w-4 h-4 text-primary-500" /> चैटबॉट और AI सेटिंग्स
                           </h4>
                           <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">ऑटो-रिप्लाई मोड</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'manual' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'manual' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">मैन्युअल</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">ऑटो-रिप्लाई बंद रखें। मैं खुद जवाब दूंगा।</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'ai' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'ai' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">AI चैटबॉट</span>
                               </div>
                                <p className="text-xs text-surface-500 pl-6">कृत्रिम बुद्धिमत्ता द्वारा स्मार्ट जवाब।</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'rule_based' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'rule_based' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">रूल्स</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">पहले से सेट किए गए कीवर्ड्स के आधार पर।</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2 flex gap-3">
                           <button onClick={saveConfig} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-primary-600/20 flex items-center gap-2">
                             {saving ? "सुरक्षित किया जा रहा है..." : (editingId ? "अपडेट करें" : "नया अकाउंट जोड़ें")}
                           </button>
                           {editingId && (
                             <button onClick={cancelEditing} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                               रद्द करें
                             </button>
                           )}
                         </div>
                         {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">{message}</p>}
                     </div>
                 </div>

                 {/* Connected Accounts Table */}
                 <div className="p-8 border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                        <Phone className="w-5 h-5 text-primary-500" /> कनेक्टेड WhatsApp अकाउंट्स
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">इस वर्कस्पेस में कॉन्फ़िगर किए गए सभी सक्रिय WhatsApp नंबर और लाइन्स।</p>
                     
                     {configs.length === 0 ? (
                        <div className="p-8 text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950/30">
                           कोई कनेक्टेड अकाउंट नहीं मिला। शुरू करने के लिए ऊपर से एक अकाउंट जोड़ें।
                        </div>
                     ) : (
                        <div className="overflow-hidden border border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950">
                           <table className="w-full text-left border-collapse text-sm">
                              <thead>
                                 <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold">
                                    <th className="p-4">Phone Number ID</th>
                                     <th className="p-4">WABA ID</th>
                                    <th className="p-4">ऑटो-रिप्लाई मोड</th>
                                    <th className="p-4">कनेक्टेड तिथि</th>
                                     <th className="p-4 text-right">कार्रवाई</th>
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
                                              {cfg.reply_mode === 'ai' ? '🤖 AI बॉट' : cfg.reply_mode === 'rule_based' ? '⚡ रूल्स' : '👤 मैन्युअल'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-surface-500">{cfg.created_at ? formatUserDateOnly(cfg.created_at) : 'N/A'}</td>
                                       <td className="p-4 text-right flex justify-end gap-2">
                                          <button onClick={() => startEditing(cfg)} title="बदलें" className="p-2 text-surface-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-all">
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => deleteConfig(cfg.id)} title="हटाएं" className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
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
                      <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display">सोशल अकाउंट्स</h3>
                     <p className="text-sm text-surface-500 mb-6">Instagram और Facebook पेजों को OAuth के माध्यम से कनेक्ट करें।</p>
                     
                     <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
                         <Megaphone className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-4" />
                         <p className="text-sm text-surface-500 font-medium text-center">OAuth इंटीग्रेशन जल्द ही आ रहा है</p>
                     </div>
                 </div>
             </div>
        </div>

        {/* Subscription / Upgrade Popup */}
        <SubscriptionModal
          open={showSubscription}
          onClose={() => setShowSubscription(false)}
          onSuccess={() => {
            setShowSubscription(false);
            loadBilling();
            toast('success', 'सब्सक्रिप्शन सफलतापूर्वक एक्टिव हो गया!');
          }}
        />
        </>
    )
}

