import { useState, useEffect } from 'react';
import { Bot, MessageSquare, Megaphone, Settings, User, Phone, PhoneCall, Trash2, Edit, Instagram, Facebook } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { formatUserDateOnly } from '../lib/dates';

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
          setProfileMessage("à¤ªà¥à¤°à¥‹à¤«à¤¼à¤¾à¤‡à¤² à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤¹à¥‹ à¤—à¤ˆà¥¤ à¤ªà¥‡à¤œ à¤°à¥€à¤«à¥à¤°à¥‡à¤¶ à¤•à¤°à¥‡à¤‚ à¤¤à¤¾à¤•à¤¿ à¤¨à¤ à¤¬à¤¦à¤²à¤¾à¤µ à¤²à¤¾à¤—à¥‚ à¤¹à¥‹ à¤¸à¤•à¥‡à¤‚à¥¤");
          localStorage.setItem('userTimezone', userTimezone);
        } else {
          setProfileMessage("à¤¤à¥à¤°à¥à¤Ÿà¤¿: " + (data.error || "à¤…à¤œà¥à¤žà¤¾à¤¤"));
        }
      } catch (e) {
        setProfileMessage("à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤¤à¥à¤°à¥à¤Ÿà¤¿à¥¤");
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
      if (!confirm("à¤•à¥à¤¯à¤¾ à¤†à¤ª à¤µà¤¾à¤•à¤ˆ à¤‡à¤¸ WhatsApp à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤•à¥‹ à¤¹à¤Ÿà¤¾à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚?")) return;
      try {
        const res = await fetch(`/api/whatsapp/config/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
        });
        const data: any = await res.json();
        if (data.success) {
          setMessage("à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• à¤¹à¤Ÿà¤¾ à¤¦à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤");
          loadAllConfigs();
        } else {
          alert(data.error || "à¤¹à¤Ÿà¤¾à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
        }
      } catch (e) {
        alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
      }
    };

    const startEditing = (cfg: any) => {
      setEditingId(cfg.id);
      setPhoneNumberId(cfg.phone_number_id || "");
      setWabaId(cfg.waba_id || "");
      setVerifyToken(cfg.verify_token || "");
      setAccessToken("â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢");
      setReplyMode(cfg.reply_mode || "manual");
      setMessage("à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...");
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
              setMessage("Embedded Signup à¤ªà¥‚à¤°à¤¾ à¤¹à¥à¤†, à¤¸à¤°à¥à¤µà¤° à¤ªà¤° à¤°à¤œà¤¿à¤¸à¥à¤Ÿà¤° à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...");
              
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
                      setMessage(`Tech Provider Onboarding à¤¸à¤«à¤²! WABA: ${res.waba}`);
                      setPhoneNumberId(phone_number_id);
                      setWabaId(waba_id);
                  } else {
                      setMessage(`Tech Provider Onboarding à¤µà¤¿à¤«à¤²: ${res.error}`);
                  }
              }).catch(() => {
                  setMessage("à¤¸à¤°à¥à¤µà¤° à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤¤à¥à¤°à¥à¤Ÿà¤¿à¥¤");
              });
            } else if (data.event === 'CANCEL') {
              setMessage("Signup à¤°à¤¦à¥à¤¦ à¤•à¤° à¤¦à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤");
            } else if (data.event === 'ERROR') {
              setMessage("Signup à¤®à¥‡à¤‚ à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤†à¤ˆà¥¤");
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
          setAccessToken("â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢");
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
         setMessage("Tech Provider Config ID à¤²à¥‹à¤¡ à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤† à¤¹à¥ˆà¥¤");
         return;
      }
      if (typeof window !== 'undefined' && (window as any).FB) {
        (window as any).FB.login((response: any) => {
          if (response.authResponse) {
             console.log("FB login popup successful, waiting for WA_EMBEDDED_SIGNUP message...");
          } else {
             setMessage("Signup à¤°à¤¦à¥à¤¦ à¤•à¤° à¤¦à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾ à¤¯à¤¾ à¤µà¤¿à¤«à¤² à¤°à¤¹à¤¾à¥¤");
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
        setMessage("Facebook SDK à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ à¤¯à¤¾ à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤° à¤¨à¤¹à¥€à¤‚ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤ªà¥à¤¨à¤ƒ à¤ªà¥à¤°à¤¯à¤¾à¤¸ à¤•à¤°à¥‡à¤‚à¥¤");
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
        if (accessToken !== "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢") {
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
          setMessage(editingId ? "à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤°à¥‡à¤¶à¤¨ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾!" : "à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤°à¥‡à¤¶à¤¨ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• à¤¸à¥‡à¤µ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾!");
          setPhoneNumberId("");
          setWabaId("");
          setAccessToken("");
          setVerifyToken("");
          setEditingId(null);
          loadAllConfigs();
        } else {
          setMessage("à¤¤à¥à¤°à¥à¤Ÿà¤¿: " + (data.error || "à¤…à¤œà¥à¤žà¤¾à¤¤"));
        }
      } catch (e) {
         setMessage("à¤¸à¥‡à¤µ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥à¥¤");
      } finally {
         setSaving(false);
      }
    };

    if (loading) return <div className="p-8">à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...</div>;

    return (
        <div className="p-6 md:p-8 w-full max-w-4xl mx-auto space-y-6">
             <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸</h2>
             
             {/* User Profile Section */}
             <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display flex items-center gap-2">
                       <User className="w-5 h-5 text-indigo-500" /> à¤‰à¤ªà¤¯à¥‹à¤—à¤•à¤°à¥à¤¤à¤¾ à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸
                     </h3>
                     <p className="text-sm text-zinc-500 mb-6">à¤…à¤ªà¤¨à¤¾ à¤ªà¤¸à¤‚à¤¦à¥€à¤¦à¤¾ à¤Ÿà¤¾à¤‡à¤®à¤œà¤¼à¥‹à¤¨ à¤¸à¥‡à¤Ÿ à¤•à¤°à¥‡à¤‚ à¤¤à¤¾à¤•à¤¿ à¤¸à¤­à¥€ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤”à¤° à¤²à¥‰à¤— à¤¸à¤¹à¥€ à¤¸à¤®à¤¯ à¤¦à¤¿à¤–à¤¾à¤à¤‚à¥¤</p>
                     
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
                          {savingProfile ? "à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ..." : "à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚"}
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
                     <p className="text-sm text-zinc-500 mb-6">WhatsApp Business Account à¤•à¥‹ à¤•à¤¨à¥‡à¤•à¥à¤Ÿ à¤•à¤°à¥‡à¤‚ à¤¤à¤¾à¤•à¤¿ à¤†à¤ª Live Webhooks à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤ à¤•à¤° à¤¸à¤•à¥‡à¤‚ à¤”à¤° à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œ à¤¸à¤•à¥‡à¤‚à¥¤</p>
                     
                     <div className="space-y-4 max-w-xl">
                         <div className="mb-6 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex flex-col items-start gap-3">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">à¤†à¤¸à¤¾à¤¨ à¤¸à¥‡à¤Ÿà¤…à¤ª (Embedded Signup)</h4>
                            <p className="text-xs text-blue-800 dark:text-blue-400">Meta à¤•à¥‡ à¤†à¤§à¤¿à¤•à¤¾à¤°à¤¿à¤• Embedded Signup à¤•à¥‡ à¤œà¤¼à¤°à¤¿à¤ à¤¸à¤¿à¤°à¥à¤« à¤à¤• à¤•à¥à¤²à¤¿à¤• à¤®à¥‡à¤‚ à¤…à¤ªà¤¨à¤¾ WhatsApp Business à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤•à¤¨à¥‡à¤•à¥à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤</p>
                            <button onClick={launchWhatsAppSignup} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> Facebook à¤•à¥‡ à¤¸à¤¾à¤¥ à¤²à¥‰à¤—à¤¿à¤¨ à¤•à¤°à¥‡à¤‚
                            </button>
                         </div>
                         
                         <div className="flex items-center gap-4 mb-2">
                           <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
                           <span className="text-xs text-zinc-400 font-medium uppercase">
                             {editingId ? "à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤°à¥‡à¤¶à¤¨ à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚" : "à¤¯à¤¾ à¤®à¥ˆà¤¨à¥à¤¯à¥à¤…à¤² à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤°à¥‡à¤¶à¤¨ à¤œà¥‹à¤¡à¤¼à¥‡à¤‚"}
                           </span>
                           <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800"></div>
                         </div>

                         {editingId && (
                           <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-2">
                             <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ: {phoneNumberId || editingId}</span>
                             <button onClick={cancelEditing} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline font-medium">à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚ (Cancel)</button>
                           </div>
                         )}

                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">WhatsApp Phone Number ID</label>
                           <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="e.g. 10423049583..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">WhatsApp Business Account ID (WABA ID) <span className="text-indigo-500 font-normal">[à¤Ÿà¥‡à¤‚à¤ªà¤²à¥‡à¤Ÿà¥à¤¸ à¤•à¥‡ à¤²à¤¿à¤ à¤†à¤µà¤¶à¥à¤¯à¤•]</span></label>
                            <input type="text" value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="e.g. 109384729482..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="à¤…à¤ªà¤¨à¥€ à¤ªà¤¸à¤‚à¤¦ à¤•à¤¾ à¤•à¥‹à¤ˆ à¤­à¥€ à¤¸à¥€à¤•à¥à¤°à¥‡à¤Ÿ à¤Ÿà¥‹à¤•à¤¨ à¤¡à¤¾à¤²à¥‡à¤‚" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
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
                             <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mb-1">Meta Developer Dashboard à¤®à¥‡à¤‚ à¤¯à¤¹ Webhook URL à¤¡à¤¾à¤²à¥‡à¤‚:</p>
                             <code className="text-xs text-indigo-600 dark:text-indigo-400 break-all select-all">{webhookUrl}</code>
                           </div>
                         )}

                         <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                           <h4 className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wider mb-4 flex items-center gap-2">
                             <Bot className="w-4 h-4 text-indigo-500" /> à¤šà¥ˆà¤Ÿà¤¬à¥‰à¤Ÿ (Chatbot) à¤”à¤° AI à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸
                           </h4>
                           <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">à¤‘à¤Ÿà¥‹-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ˆ à¤®à¥‹à¤¡</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'manual' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'manual' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">à¤®à¥ˆà¤¨à¥à¤¯à¥à¤…à¤² (Manual)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">à¤‘à¤Ÿà¥‹-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ˆ à¤¬à¤‚à¤¦ à¤°à¤–à¥‡à¤‚à¥¤ à¤®à¥ˆà¤‚ à¤–à¥à¤¦ à¤œà¤µà¤¾à¤¬ à¤¦à¥‚à¤‚à¤—à¤¾à¥¤</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'ai' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'ai' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">AI à¤šà¥ˆà¤Ÿà¤¬à¥‰à¤Ÿ</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">à¤•à¥ƒà¤¤à¥à¤°à¤¿à¤® à¤¬à¥à¤¦à¥à¤§à¤¿à¤®à¤¤à¥à¤¤à¤¾ (AI) à¤¦à¥à¤µà¤¾à¤°à¤¾ à¤¸à¥à¤®à¤¾à¤°à¥à¤Ÿ à¤œà¤µà¤¾à¤¬à¥¤</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'rule_based' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'rule_based' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">à¤°à¥‚à¤²à¥à¤¸ (Rule-based)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ à¤¸à¥‡à¤Ÿ à¤•à¤¿à¤ à¤—à¤ à¤•à¥€à¤µà¤°à¥à¤¡à¥à¤¸ à¤•à¥‡ à¤†à¤§à¤¾à¤° à¤ªà¤°à¥¤</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2 flex gap-3">
                           <button onClick={saveConfig} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2">
                             {saving ? "à¤¸à¥à¤°à¤•à¥à¤·à¤¿à¤¤ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ..." : (editingId ? "à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤•à¤°à¥‡à¤‚" : "à¤¨à¤¯à¤¾ à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤œà¥‹à¤¡à¤¼à¥‡à¤‚")}
                           </button>
                           {editingId && (
                             <button onClick={cancelEditing} className="border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                               à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚
                             </button>
                           )}
                         </div>
                         {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">{message}</p>}
                     </div>
                 </div>

                 {/* Connected Accounts Table */}
                 <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                     <h3 className="font-bold text-lg mb-2 text-zinc-900 dark:text-white font-display flex items-center gap-2">
                       <Phone className="w-5 h-5 text-indigo-500" /> à¤•à¤¨à¥‡à¤•à¥à¤Ÿà¥‡à¤¡ WhatsApp à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿà¥à¤¸ (Connected WABAs)
                     </h3>
                     <p className="text-sm text-zinc-500 mb-6">à¤‡à¤¸ à¤µà¤°à¥à¤•à¤¸à¥à¤ªà¥‡à¤¸ à¤®à¥‡à¤‚ à¤•à¥‰à¤¨à¥à¤«à¤¼à¤¿à¤—à¤° à¤•à¤¿à¤ à¤—à¤ à¤¸à¤­à¥€ à¤¸à¤•à¥à¤°à¤¿à¤¯ WhatsApp à¤¨à¤‚à¤¬à¤° à¤”à¤° à¤²à¤¾à¤‡à¤¨à¥à¤¸à¥¤</p>
                     
                     {configs.length === 0 ? (
                        <div className="p-8 text-center text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/30">
                           à¤•à¥‹à¤ˆ à¤•à¤¨à¥‡à¤•à¥à¤Ÿà¥‡à¤¡ à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤Šà¤ªà¤° à¤¸à¥‡ à¤à¤• à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤œà¥‹à¤¡à¤¼à¥‡à¤‚à¥¤
                        </div>
                     ) : (
                        <div className="overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950">
                           <table className="w-full text-left border-collapse text-sm">
                              <thead>
                                 <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 font-semibold">
                                    <th className="p-4">Phone Number ID</th>
                                     <th className="p-4">WABA ID</th>
                                    <th className="p-4">à¤‘à¤Ÿà¥‹-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ˆ à¤®à¥‹à¤¡</th>
                                    <th className="p-4">à¤•à¤¨à¥‡à¤•à¥à¤Ÿà¥‡à¤¡ à¤¤à¤¿à¤¥à¤¿</th>
                                    <th className="p-4 text-right">à¤•à¤¾à¤°à¥à¤°à¤µà¤¾à¤ˆ (Actions)</th>
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
                                             {cfg.reply_mode === 'ai' ? 'ðŸ¤– AI Bot' : cfg.reply_mode === 'rule_based' ? 'âš¡ Rules' : 'ðŸ‘¤ Manual'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-zinc-500">{cfg.created_at ? formatUserDateOnly(cfg.created_at) : 'N/A'}</td>
                                       <td className="p-4 text-right flex justify-end gap-2">
                                          <button onClick={() => startEditing(cfg)} title="à¤¬à¤¦à¤²à¥‡à¤‚" className="p-2 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-all">
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => deleteConfig(cfg.id)} title="à¤¹à¤Ÿà¤¾à¤à¤‚" className="p-2 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
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
                     <p className="text-sm text-zinc-500 mb-6">Instagram à¤”à¤° Facebook à¤ªà¥‡à¤œà¥‹à¤‚ à¤•à¥‹ OAuth à¤•à¥‡ à¤®à¤¾à¤§à¥à¤¯à¤® à¤¸à¥‡ à¤•à¤¨à¥‡à¤•à¥à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤</p>
                     
                     <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50">
                         <Megaphone className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-4" />
                         <p className="text-sm text-zinc-500 font-medium text-center">OAuth à¤‡à¤‚à¤Ÿà¥€à¤—à¥à¤°à¥‡à¤¶à¤¨ à¤œà¤²à¥à¤¦ à¤¹à¥€ à¤† à¤°à¤¹à¤¾ à¤¹à¥ˆ</p>
                     </div>
                 </div>
             </div>
        </div>
    )
}

