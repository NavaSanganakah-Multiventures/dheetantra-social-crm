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
          setProfileMessage("à¤ªà¥à¤°à¥à¤«à¤¼à¤¾à¤à¤² à¤à¤ªà¤¡à¥à¤ à¤¹à¥ à¤à¤à¥¤ à¤ªà¥à¤ à¤°à¥à¤«à¥à¤°à¥à¤¶ à¤à¤°à¥à¤ à¤¤à¤¾à¤à¤¿ à¤¨à¤ à¤¬à¤¦à¤²à¤¾à¤µ à¤²à¤¾à¤à¥ à¤¹à¥ à¤¸à¤à¥à¤à¥¤");
          localStorage.setItem('userTimezone', userTimezone);
        } else {
          setProfileMessage("à¤¤à¥à¤°à¥à¤à¤¿: " + (data.error || "à¤à¤à¥à¤à¤¾à¤¤"));
        }
      } catch (e) {
        setProfileMessage("à¤à¤ªà¤¡à¥à¤ à¤à¤°à¤¨à¥ à¤®à¥à¤ à¤¤à¥à¤°à¥à¤à¤¿à¥¤");
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
          alert(data.error || "à¤¸à¤¦à¤¸à¥à¤¯ à¤à¥à¤¡à¤¼à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
        }
      } catch (e) {
        alert("à¤¸à¤¦à¤¸à¥à¤¯ à¤à¥à¤¡à¤¼à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
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
          alert(data.error || "à¤­à¥à¤®à¤¿à¤à¤¾ à¤¬à¤¦à¤²à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
        }
      } catch (e) {
        alert("à¤­à¥à¤®à¤¿à¤à¤¾ à¤¬à¤¦à¤²à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
      }
    };

    const removeMember = async (userId: string) => {
      if (!confirm("à¤à¥à¤¯à¤¾ à¤à¤ª à¤µà¤¾à¤à¤ à¤à¤¸ à¤¸à¤¦à¤¸à¥à¤¯ à¤à¥ à¤¹à¤à¤¾à¤¨à¤¾ à¤à¤¾à¤¹à¤¤à¥ à¤¹à¥à¤?")) return;
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
          alert(data.error || "à¤¹à¤à¤¾à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
        }
      } catch (e) {
        alert("à¤¹à¤à¤¾à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
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
      if (!confirm("à¤à¥à¤¯à¤¾ à¤à¤ª à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤°à¤¦à¥à¤¦ à¤à¤°à¤¨à¤¾ à¤à¤¾à¤¹à¤¤à¥ à¤¹à¥à¤? à¤¯à¤¹ à¤µà¤°à¥à¤¤à¤®à¤¾à¤¨ à¤¬à¤¿à¤²à¤¿à¤à¤ à¤à¤µà¤§à¤¿ à¤à¥ à¤à¤à¤¤ à¤®à¥à¤ à¤¬à¤à¤¦ à¤¹à¥ à¤à¤¾à¤à¤à¤¾à¥¤")) return;
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
          alert("à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤°à¤¦à¥à¤¦ à¤¹à¥ à¤à¤à¥¤ à¤¯à¤¹ à¤¬à¤¿à¤²à¤¿à¤à¤ à¤à¤µà¤§à¤¿ à¤à¥ à¤à¤à¤¤ à¤®à¥à¤ à¤ªà¥à¤°à¤­à¤¾à¤µà¥ à¤¹à¥à¤à¥à¥¤");
        } else {
          alert(data.error || "à¤°à¤¦à¥à¤¦ à¤à¤°à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¥¤");
        }
      } catch {
        alert("à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°à¥¤ à¤«à¤¿à¤° à¤¸à¥ à¤ªà¥à¤°à¤¯à¤¾à¤¸ à¤à¤°à¥à¤à¥¤");
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
      if (!confirm("à¤à¥à¤¯à¤¾ à¤à¤ª à¤µà¤¾à¤à¤ à¤à¤¸ WhatsApp à¤à¤à¤¾à¤à¤à¤ à¤à¥ à¤¹à¤à¤¾à¤¨à¤¾ à¤à¤¾à¤¹à¤¤à¥ à¤¹à¥à¤?")) return;
      try {
        const res = await fetch(`/api/whatsapp/config/${id}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
        });
        const data: any = await res.json();
        if (data.success) {
          setMessage("à¤à¤à¤¾à¤à¤à¤ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥à¤°à¥à¤µà¤ à¤¹à¤à¤¾ à¤¦à¤¿à¤¯à¤¾ à¤à¤¯à¤¾à¥¤");
          loadAllConfigs();
        } else {
          alert(data.error || "à¤¹à¤à¤¾à¤¨à¥ à¤®à¥à¤ à¤µà¤¿à¤«à¤²à¤¤à¤¾");
        }
      } catch (e) {
        alert("à¤¤à¥à¤°à¥à¤à¤¿ à¤¹à¥à¤");
      }
    };

    const startEditing = (cfg: any) => {
      setEditingId(cfg.id);
      setPhoneNumberId(cfg.phone_number_id || "");
      setWabaId(cfg.waba_id || "");
      setVerifyToken(cfg.verify_token || "");
      setAccessToken("â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢");
      setReplyMode(cfg.reply_mode || "manual");
      setMessage("à¤à¤à¤¾à¤à¤à¤ à¤¸à¤à¤ªà¤¾à¤¦à¤¿à¤¤ à¤à¤¿à¤¯à¤¾ à¤à¤¾ à¤°à¤¹à¤¾ à¤¹à¥...");
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
              setMessage("Embedded Signup à¤ªà¥à¤°à¤¾ à¤¹à¥à¤, à¤¸à¤°à¥à¤µà¤° à¤ªà¤° à¤°à¤à¤¿à¤¸à¥à¤à¤° à¤à¤¿à¤¯à¤¾ à¤à¤¾ à¤°à¤¹à¤¾ à¤¹à¥...");
              
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
                      setMessage(`à¤à¥à¤ à¤ªà¥à¤°à¥à¤µà¤¾à¤à¤¡à¤° à¤à¤¨à¤¬à¥à¤°à¥à¤¡à¤¿à¤à¤ à¤¸à¤«à¤²! WABA: ${res.waba}`);
                      setPhoneNumberId(phone_number_id);
                      setWabaId(waba_id);
                  } else {
                      setMessage(`à¤à¥à¤ à¤ªà¥à¤°à¥à¤µà¤¾à¤à¤¡à¤° à¤à¤¨à¤¬à¥à¤°à¥à¤¡à¤¿à¤à¤ à¤µà¤¿à¤«à¤²: ${res.error}`);
                  }
              }).catch(() => {
                  setMessage("à¤¸à¤°à¥à¤µà¤° à¤¸à¥ à¤¸à¤à¤ªà¤°à¥à¤ à¤à¤°à¤¨à¥ à¤®à¥à¤ à¤¤à¥à¤°à¥à¤à¤¿à¥¤");
              });
            } else if (data.event === 'CANCEL') {
              setMessage("à¤¸à¤¾à¤à¤¨à¤à¤ª à¤°à¤¦à¥à¤¦ à¤à¤° à¤¦à¤¿à¤¯à¤¾ à¤à¤¯à¤¾à¥¤");
            } else if (data.event === 'ERROR') {
              setMessage("à¤¸à¤¾à¤à¤¨à¤à¤ª à¤®à¥à¤ à¤¤à¥à¤°à¥à¤à¤¿ à¤à¤à¥¤");
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
          setAccessToken("â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢");
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
         setMessage("à¤à¥à¤ à¤ªà¥à¤°à¥à¤µà¤¾à¤à¤¡à¤° Config ID à¤²à¥à¤¡ à¤¨à¤¹à¥à¤ à¤¹à¥à¤ à¤¹à¥à¥¤");
         return;
      }
      if (typeof window !== 'undefined' && (window as any).FB) {
        (window as any).FB.login((response: any) => {
          if (response.authResponse) {
             console.log("FB login popup successful, waiting for WA_EMBEDDED_SIGNUP message...");
          } else {
             setMessage("à¤¸à¤¾à¤à¤¨à¤à¤ª à¤°à¤¦à¥à¤¦ à¤à¤° à¤¦à¤¿à¤¯à¤¾ à¤à¤¯à¤¾ à¤¯à¤¾ à¤µà¤¿à¤«à¤² à¤°à¤¹à¤¾à¥¤");
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
        setMessage("Facebook SDK à¤²à¥à¤¡ à¤¹à¥ à¤°à¤¹à¤¾ à¤¹à¥ à¤¯à¤¾ à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤° à¤¨à¤¹à¥à¤ à¤à¤¿à¤¯à¤¾ à¤à¤¯à¤¾ à¤¹à¥à¥¤ à¤à¥à¤ªà¤¯à¤¾ à¤ªà¥à¤¨à¤ à¤ªà¥à¤°à¤¯à¤¾à¤¸ à¤à¤°à¥à¤à¥¤");
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
        if (accessToken !== "â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢â¢") {
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
          setMessage(editingId ? "à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤°à¥à¤¶à¤¨ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥à¤°à¥à¤µà¤ à¤à¤ªà¤¡à¥à¤ à¤à¤¿à¤¯à¤¾ à¤à¤¯à¤¾!" : "à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤°à¥à¤¶à¤¨ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥à¤°à¥à¤µà¤ à¤¸à¥à¤µ à¤à¤¿à¤¯à¤¾ à¤à¤¯à¤¾!");
          setPhoneNumberId("");
          setWabaId("");
          setAccessToken("");
          setVerifyToken("");
          setEditingId(null);
          loadAllConfigs();
        } else {
          setMessage("à¤¤à¥à¤°à¥à¤à¤¿: " + (data.error || "à¤à¤à¥à¤à¤¾à¤¤"));
        }
      } catch (e) {
         setMessage("à¤¸à¥à¤µ à¤à¤°à¤¨à¥ à¤®à¥à¤ à¤à¤¸à¤®à¤°à¥à¤¥à¥¤");
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

    if (loading) return <div className="p-8">à¤²à¥à¤¡ à¤¹à¥ à¤°à¤¹à¤¾ à¤¹à¥...</div>;

    return (
        <>
        <div className="p-6 md:p-8 w-full max-w-4xl mx-auto space-y-6">
             <h2 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white font-display">à¤µà¤°à¥à¤à¤¸à¥à¤ªà¥à¤¸ à¤¸à¥à¤à¤¿à¤à¤à¥à¤¸</h2>

             {/* Plan & Billing Section */}
             <div className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl overflow-hidden shadow-sm">
                 <div className="p-8">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                       <CreditCard className="w-5 h-5 text-primary-500" /> à¤ªà¥à¤²à¤¾à¤¨ à¤à¤° à¤¬à¤¿à¤²à¤¿à¤à¤
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">à¤à¤ªà¤à¤¾ à¤µà¤°à¥à¤¤à¤®à¤¾à¤¨ à¤ªà¥à¤²à¤¾à¤¨, à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤¸à¥à¤¥à¤¿à¤¤à¤¿ à¤à¤° à¤­à¥à¤à¤¤à¤¾à¤¨ à¤à¤¤à¤¿à¤¹à¤¾à¤¸à¥¤</p>

                     {billingLoading ? (
                       <div className="flex items-center gap-3 text-sm text-surface-500 py-6">
                         <RefreshCw className="w-4 h-4 animate-spin" /> à¤¬à¤¿à¤²à¤¿à¤à¤ à¤à¤¾à¤¨à¤à¤¾à¤°à¥ à¤²à¥à¤¡ à¤¹à¥ à¤°à¤¹à¥ à¤¹à¥...
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
                                   à¤à¤à¤²à¥ à¤¬à¤¿à¤²à¤¿à¤à¤: {new Date(billing.subscription.current_period_end * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                   {billing.subscription.cancel_at_period_end === 1 && (
                                      <span className="text-amber-600 dark:text-amber-400 font-medium">(à¤¬à¤¿à¤²à¤¿à¤à¤ à¤à¤µà¤§à¤¿ à¤à¥ à¤à¤à¤¤ à¤®à¥à¤ à¤°à¤¦à¥à¤¦ à¤¹à¥ à¤à¤¾à¤à¤à¥)</span>
                                   )}
                                 </p>
                               ) : (
                                 <p className="text-xs text-surface-500 mt-1">{billing?.plan?.description || 'à¤à¥à¤ à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤¨à¤¹à¥à¤'}</p>
                               )}
                             </div>
                           </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowSubscription(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-semibold transition-colors"
                              >
                                 <Sparkles className="w-3.5 h-3.5" /> à¤à¤ªà¤à¥à¤°à¥à¤¡ à¤à¤°à¥à¤
                              </button>
                             {billing?.subscription && ['active', 'past_due', 'paused'].includes(billing.subscription.status) && billing.subscription.cancel_at_period_end !== 1 && (
                               <button
                                 onClick={cancelSubscription}
                                 disabled={cancelling}
                                 className="inline-flex items-center gap-1.5 px-4 py-2 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                               >
                                 {cancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                                  à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤
                               </button>
                             )}
                           </div>
                         </div>

                         {/* Payment history */}
                         <div>
                           <h4 className="text-sm font-bold text-surface-900 dark:text-white mb-3">à¤­à¥à¤à¤¤à¤¾à¤¨ à¤à¤¤à¤¿à¤¹à¤¾à¤¸</h4>
                           {payments.length === 0 ? (
                             <div className="text-center text-xs text-surface-500 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                                à¤à¤­à¥ à¤¤à¤ à¤à¥à¤ à¤­à¥à¤à¤¤à¤¾à¤¨ à¤¨à¤¹à¥à¤à¥¤
                             </div>
                           ) : (
                             <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                               <table className="w-full text-left text-sm border-collapse">
                                 <thead>
                                   <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                                     <th className="p-4">à¤¤à¤¿à¤¥à¤¿</th>
                                      <th className="p-4">à¤­à¥à¤à¤¤à¤¾à¤¨ ID</th>
                                     <th className="p-4">à¤°à¤¾à¤¶à¤¿</th>
                                     <th className="p-4">à¤µà¤¿à¤§à¤¿</th>
                                     <th className="p-4">à¤¸à¥à¤¥à¤¿à¤¤à¤¿</th>
                                   </tr>
                                 </thead>
                                 <tbody>
                                   {payments.map((p: any) => (
                                     <tr key={p.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50 dark:hover:bg-surface-900/50">
                                       <td className="p-4 text-xs text-surface-500">{p.created_at ? formatUserDateOnly(p.created_at) : 'N/A'}</td>
                                       <td className="p-4 font-mono text-xs text-surface-600 dark:text-surface-400">{p.razorpay_payment_id || p.id}</td>
                                       <td className="p-4 font-semibold text-surface-900 dark:text-white">{p.currency === 'USD' ? '$' : 'â¹'}{p.amount}</td>
                                       <td className="p-4 text-xs text-surface-500">{p.method || 'â'}</td>
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
                       <Users className="w-5 h-5 text-primary-500" /> à¤µà¤°à¥à¤à¤¸à¥à¤ªà¥à¤¸ à¤¸à¤¦à¤¸à¥à¤¯
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">à¤à¤¸ à¤µà¤°à¥à¤à¤¸à¥à¤ªà¥à¤¸ à¤®à¥à¤ à¤à¥à¤¡à¤¼à¥ à¤¸à¤¦à¤¸à¥à¤¯ à¤à¤° à¤à¤¨à¤à¥ à¤­à¥à¤®à¤¿à¤à¤¾à¤à¤ à¤¦à¥à¤à¥à¤à¥¤ à¤à¥à¤µà¤² Owner/Admin à¤¨à¤ à¤¸à¤¦à¤¸à¥à¤¯ à¤à¥à¤¡à¤¼ à¤¸à¤à¤¤à¥ à¤¹à¥à¤, Role à¤¬à¤¦à¤² à¤¸à¤à¤¤à¥ à¤¹à¥à¤ à¤¯à¤¾ à¤¹à¤à¤¾ à¤¸à¤à¤¤à¥ à¤¹à¥à¤à¥¤</p>

                     <div className="flex items-center gap-2 mb-6">
                       <span className="text-sm text-surface-500">à¤à¤ªà¤à¥ à¤­à¥à¤®à¤¿à¤à¤¾:</span>
                       <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                         currentRole === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                         currentRole === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                         'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                       }`}>
                         {currentRole === 'owner' ? 'à¤®à¤¾à¤²à¤¿à¤' : currentRole === 'admin' ? 'à¤à¤¡à¤®à¤¿à¤¨' : currentRole === 'member' ? 'à¤¸à¤¦à¤¸à¥à¤¯' : 'â'}
                       </span>
                     </div>

                     {(currentRole === 'owner' || currentRole === 'admin') && (
                       <div className="flex flex-col sm:flex-row gap-3 mb-6">
                         <input
                           type="email"
                           value={newMemberEmail}
                           onChange={e => setNewMemberEmail(e.target.value)}
                           placeholder="à¤¸à¤¦à¤¸à¥à¤¯ à¤à¤¾ à¤à¤®à¥à¤²"
                           className="flex-1 bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         />
                         <select
                           value={newMemberRole}
                           onChange={e => setNewMemberRole(e.target.value as 'admin' | 'member')}
                           className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500"
                         >
                           <option value="admin">à¤à¤¡à¤®à¤¿à¤¨</option>
                           <option value="member">à¤¸à¤¦à¤¸à¥à¤¯</option>
                           {currentRole === 'owner' && <option value="owner">à¤®à¤¾à¤²à¤¿à¤</option>}
                         </select>
                         <button
                           onClick={addMember}
                           disabled={addingMember || !newMemberEmail.trim()}
                           className="bg-primary-600 hover:bg-primary-700 disabled:bg-surface-400 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                           {addingMember ? 'à¤à¥à¤¡à¤¼à¤¾ à¤à¤¾ à¤°à¤¹à¤¾ à¤¹à¥...' : (<><UserPlus className="w-4 h-4" /> à¤¸à¤¦à¤¸à¥à¤¯ à¤à¥à¤¡à¤¼à¥à¤</>)}
                         </button>
                       </div>
                     )}

                     {members === null ? (
                       <div className="text-sm text-surface-500 py-6">à¤¸à¤¦à¤¸à¥à¤¯ à¤²à¥à¤¡ à¤¹à¥ à¤°à¤¹à¥ à¤¹à¥à¤...</div>
                     ) : members.length === 0 ? (
                       <div className="text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl py-8">
                         à¤à¥à¤ à¤¸à¤¦à¤¸à¥à¤¯ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾à¥¤
                       </div>
                     ) : (
                       <div className="overflow-x-auto border border-surface-200 dark:border-surface-800 rounded-2xl">
                         <table className="w-full text-left text-sm border-collapse">
                           <thead>
                             <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold text-xs">
                               <th className="p-4">à¤¨à¤¾à¤®</th>
                               <th className="p-4">à¤à¤®à¥à¤²</th>
                               <th className="p-4">à¤­à¥à¤®à¤¿à¤à¤¾</th>
                               {(currentRole === 'owner' || currentRole === 'admin') && <th className="p-4 text-right">à¤à¤¾à¤°à¥à¤°à¤µà¤¾à¤</th>}
                             </tr>
                           </thead>
                           <tbody>
                             {members?.map((m: any) => (
                               <tr key={m.id} className="border-b border-surface-100 dark:border-surface-900 hover:bg-surface-50/50">
                                 <td className="p-4 font-medium text-surface-900 dark:text-white">{m.name || 'â'}</td>
                                 <td className="p-4 text-surface-600 dark:text-surface-400 text-xs">{m.email}</td>
                                 <td className="p-4">
                                   {currentRole === 'owner' ? (
                                     <select
                                       value={m.role}
                                       onChange={e => changeRole(m.id, e.target.value)}
                                       className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 text-xs outline-none"
                                     >
                                       <option value="member">à¤¸à¤¦à¤¸à¥à¤¯</option>
                                       <option value="admin">à¤à¤¡à¤®à¤¿à¤¨</option>
                                       <option value="owner">à¤®à¤¾à¤²à¤¿à¤</option>
                                     </select>
                                   ) : currentRole === 'admin' && m.role !== 'owner' ? (
                                     <select
                                       value={m.role}
                                       onChange={e => changeRole(m.id, e.target.value)}
                                       className="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 text-xs outline-none"
                                     >
                                       <option value="member">à¤¸à¤¦à¤¸à¥à¤¯</option>
                                       <option value="admin">à¤à¤¡à¤®à¤¿à¤¨</option>
                                     </select>
                                   ) : (
                                     <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                       m.role === 'owner' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' :
                                       m.role === 'admin' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-400' :
                                       'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                                     }`}>
                                       {m.role === 'owner' ? 'à¤®à¤¾à¤²à¤¿à¤' : m.role === 'admin' ? 'à¤à¤¡à¤®à¤¿à¤¨' : 'à¤¸à¤¦à¤¸à¥à¤¯'}
                                     </span>
                                   )}
                                 </td>
                                 {(currentRole === 'owner' || currentRole === 'admin') && (
                                   <td className="p-4 text-right">
                                     {(currentRole === 'owner' || m.role !== 'owner') && (
                                       <button
                                         onClick={() => removeMember(m.id)}
                                         className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                         title="à¤¹à¤à¤¾à¤à¤"
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
                       <User className="w-5 h-5 text-primary-500" /> à¤à¤ªà¤¯à¥à¤à¤à¤°à¥à¤¤à¤¾ à¤¸à¥à¤à¤¿à¤à¤à¥à¤¸
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">à¤à¤ªà¤¨à¤¾ à¤ªà¤¸à¤à¤¦à¥à¤¦à¤¾ à¤à¤¾à¤à¤®à¤à¤¼à¥à¤¨ à¤¸à¥à¤ à¤à¤°à¥à¤ à¤¤à¤¾à¤à¤¿ à¤¸à¤­à¥ à¤¸à¤à¤¦à¥à¤¶ à¤à¤° à¤²à¥à¤ à¤¸à¤¹à¥ à¤¸à¤®à¤¯ à¤¦à¤¿à¤à¤¾à¤à¤à¥¤</p>
                     
                     <div className="max-w-xl space-y-4">
                        <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">à¤à¤¾à¤à¤®à¤à¤¼à¥à¤¨</label>
                           <select value={userTimezone} onChange={e => setUserTimezone(e.target.value)} className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all">
                              <option value="Asia/Kolkata">à¤­à¤¾à¤°à¤¤à¥à¤¯ à¤®à¤¾à¤¨à¤ à¤¸à¤®à¤¯ (IST)</option>
                              <option value="America/New_York">à¤ªà¥à¤°à¥à¤µà¥ à¤¸à¤®à¤¯ (US à¤à¤° Canada)</option>
                              <option value="America/Chicago">à¤à¥à¤à¤¦à¥à¤°à¥à¤¯ à¤¸à¤®à¤¯ (US à¤à¤° Canada)</option>
                              <option value="America/Los_Angeles">à¤ªà¥à¤°à¤¶à¤¾à¤à¤¤ à¤¸à¤®à¤¯ (US à¤à¤° Canada)</option>
                              <option value="Europe/London">à¤à¥à¤°à¥à¤¨à¤µà¤¿à¤ à¤®à¥à¤¨ à¤à¤¾à¤à¤® (à¤²à¤à¤¦à¤¨)</option>
                              <option value="Europe/Paris">à¤®à¤§à¥à¤¯ à¤¯à¥à¤°à¥à¤ªà¥à¤¯ à¤¸à¤®à¤¯ (à¤ªà¥à¤°à¤¿à¤¸)</option>
                              <option value="Asia/Dubai">à¤à¤²à¥à¤« à¤®à¤¾à¤¨à¤ à¤¸à¤®à¤¯ (à¤¦à¥à¤¬à¤)</option>
                              <option value="Asia/Singapore">à¤¸à¤¿à¤à¤à¤¾à¤ªà¥à¤° à¤®à¤¾à¤¨à¤ à¤¸à¤®à¤¯</option>
                              <option value="Australia/Sydney">à¤à¤¸à¥à¤à¥à¤°à¥à¤²à¤¿à¤¯à¤¾à¤ à¤ªà¥à¤°à¥à¤µà¥ à¤¸à¤®à¤¯ (à¤¸à¤¿à¤¡à¤¨à¥)</option>
                              <option value="UTC">à¤¸à¤®à¤¨à¥à¤µà¤¿à¤¤ à¤¸à¤¾à¤°à¥à¤µà¤­à¥à¤®à¤¿à¤ à¤¸à¤®à¤¯ (UTC)</option>
                           </select>
                        </div>

                        <button 
                          onClick={saveUserProfile} 
                          disabled={savingProfile} 
                          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm shadow-primary-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                          {savingProfile ? "à¤¸à¥à¤µ à¤¹à¥ à¤°à¤¹à¤¾ à¤¹à¥..." : "à¤¸à¥à¤µ à¤à¤°à¥à¤"}
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
                     <p className="text-sm text-surface-500 mb-6">WhatsApp Business Account à¤à¥ à¤à¤¨à¥à¤à¥à¤ à¤à¤°à¥à¤ à¤¤à¤¾à¤à¤¿ à¤à¤ª à¤²à¤¾à¤à¤µ Webhooks à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤ à¤à¤° à¤¸à¤à¥à¤ à¤à¤° à¤¸à¤à¤¦à¥à¤¶ à¤­à¥à¤ à¤¸à¤à¥à¤à¥¤</p>
                     
                     <div className="space-y-4 max-w-xl">
                         <div className="mb-6 p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex flex-col items-start gap-3">
                             <h4 className="font-semibold text-blue-900 dark:text-blue-300 text-sm">à¤à¤¸à¤¾à¤¨ à¤¸à¥à¤à¤à¤ª</h4>
                            <p className="text-xs text-blue-800 dark:text-blue-400">Meta à¤à¥ à¤à¤§à¤¿à¤à¤¾à¤°à¤¿à¤ Embedded Signup à¤à¥ à¤à¤¼à¤°à¤¿à¤ à¤¸à¤¿à¤°à¥à¤« à¤à¤ à¤à¥à¤²à¤¿à¤ à¤®à¥à¤ à¤à¤ªà¤¨à¤¾ WhatsApp Business à¤à¤à¤¾à¤à¤à¤ à¤à¤¨à¥à¤à¥à¤ à¤à¤°à¥à¤à¥¤</p>
                            <button onClick={launchWhatsAppSignup} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" /> Facebook à¤à¥ à¤¸à¤¾à¤¥ à¤²à¥à¤à¤¿à¤¨ à¤à¤°à¥à¤
                            </button>
                         </div>
                         
                         <div className="flex items-center gap-4 mb-2">
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                           <span className="text-xs text-surface-400 font-medium uppercase">
                             {editingId ? "à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤°à¥à¤¶à¤¨ à¤¸à¤à¤ªà¤¾à¤¦à¤¿à¤¤ à¤à¤°à¥à¤" : "à¤¯à¤¾ à¤®à¥à¤¨à¥à¤¯à¥à¤à¤² à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤°à¥à¤¶à¤¨ à¤à¥à¤¡à¤¼à¥à¤"}
                           </span>
                           <div className="flex-1 h-px bg-surface-200 dark:bg-surface-800"></div>
                         </div>

                         {editingId && (
                           <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-2">
                             <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">à¤¸à¤à¤ªà¤¾à¤¦à¤¿à¤¤ à¤à¤¿à¤¯à¤¾ à¤à¤¾ à¤°à¤¹à¤¾ à¤¹à¥: {phoneNumberId || editingId}</span>
                              <button onClick={cancelEditing} className="text-xs text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 underline font-medium">à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤</button>
                           </div>
                         )}

                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Phone Number ID</label>
                           <input type="text" value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="à¤à¥à¤¸à¥ 10423049583..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">WhatsApp Business Account ID (WABA ID) <span className="text-primary-500 font-normal">[à¤à¥à¤à¤ªà¤²à¥à¤à¥à¤¸ à¤à¥ à¤²à¤¿à¤ à¤à¤µà¤¶à¥à¤¯à¤]</span></label>
                            <input type="text" value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="à¤à¥à¤¸à¥ 109384729482..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Permanent Access Token</label>
                           <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Webhook Verify Token</label>
                           <input type="text" value={verifyToken} onChange={e => setVerifyToken(e.target.value)} placeholder="à¤à¤ªà¤¨à¥ à¤ªà¤¸à¤à¤¦ à¤à¤¾ à¤à¥à¤ à¤­à¥ à¤¸à¥à¤à¥à¤°à¥à¤ à¤à¥à¤à¤¨ à¤¡à¤¾à¤²à¥à¤" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
                         </div>

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                             <PhoneCall className="w-4 h-4 text-emerald-500" /> WhatsApp Voice Calling (SIP WebRTC)
                           </h4>
                           <div className="space-y-4">
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP URI</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="à¤à¥à¤¸à¥ sip:1234@your-sip-provider.com" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div>
                               <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP WebSocket Server</label>
                                <input type="text" value={""} onChange={e => {}} placeholder="à¤à¥à¤¸à¥ wss://your-sip-provider.com:8089/ws" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                             </div>
                             <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP à¤¯à¥à¤à¤¼à¤°à¤¨à¥à¤®</label>
                                  <input type="text" value={""} onChange={e => {}} placeholder="à¤¯à¥à¤à¤¼à¤°à¤¨à¥à¤®" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                               <div>
                                  <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">SIP à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡</label>
                                  <input type="password" value={""} onChange={e => {}} placeholder="à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡" className="w-full bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                               </div>
                             </div>
                           </div>
                         </div>

                         {webhookUrl && (
                           <div className="mt-4 p-4 bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-500/20 rounded-xl">
                             <p className="text-xs font-semibold text-primary-800 dark:text-primary-300 mb-1">Meta Developer Dashboard à¤®à¥à¤ à¤¯à¤¹ Webhook URL à¤¡à¤¾à¤²à¥à¤:</p>
                             <code className="text-xs text-primary-600 dark:text-primary-400 break-all select-all">{webhookUrl}</code>
                           </div>
                         )}

                         <div className="mt-6 pt-6 border-t border-surface-100 dark:border-surface-800">
                           <h4 className="block text-sm font-bold text-surface-900 dark:text-surface-100 tracking-wider mb-4 flex items-center gap-2">
                              <Bot className="w-4 h-4 text-primary-500" /> à¤à¥à¤à¤¬à¥à¤ à¤à¤° AI à¤¸à¥à¤à¤¿à¤à¤à¥à¤¸
                           </h4>
                           <label className="block text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">à¤à¤à¥-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ à¤®à¥à¤¡</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'manual' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'manual' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">à¤®à¥à¤¨à¥à¤¯à¥à¤à¤²</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">à¤à¤à¥-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ à¤¬à¤à¤¦ à¤°à¤à¥à¤à¥¤ à¤®à¥à¤ à¤à¥à¤¦ à¤à¤µà¤¾à¤¬ à¤¦à¥à¤à¤à¤¾à¥¤</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'ai' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'ai' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">AI à¤à¥à¤à¤¬à¥à¤</span>
                               </div>
                                <p className="text-xs text-surface-500 pl-6">à¤à¥à¤¤à¥à¤°à¤¿à¤® à¤¬à¥à¤¦à¥à¤§à¤¿à¤®à¤¤à¥à¤¤à¤¾ à¤¦à¥à¤µà¤¾à¤°à¤¾ à¤¸à¥à¤®à¤¾à¤°à¥à¤ à¤à¤µà¤¾à¤¬à¥¤</p>
                             </label>
                             <label className={`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all ${replyMode === 'rule_based' ? 'bg-primary-50 border-primary-200 dark:bg-primary-500/10 dark:border-primary-500/30 ring-1 ring-primary-500' : 'bg-white border-surface-200 dark:bg-surface-950 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${replyMode === 'rule_based' ? 'border-primary-600 bg-primary-600' : 'border-surface-300'}`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                  <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">à¤°à¥à¤²à¥à¤¸</span>
                               </div>
                               <p className="text-xs text-surface-500 pl-6">à¤ªà¤¹à¤²à¥ à¤¸à¥ à¤¸à¥à¤ à¤à¤¿à¤ à¤à¤ à¤à¥à¤µà¤°à¥à¤¡à¥à¤¸ à¤à¥ à¤à¤§à¤¾à¤° à¤ªà¤°à¥¤</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2 flex gap-3">
                           <button onClick={saveConfig} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-md shadow-primary-600/20 flex items-center gap-2">
                             {saving ? "à¤¸à¥à¤°à¤à¥à¤·à¤¿à¤¤ à¤à¤¿à¤¯à¤¾ à¤à¤¾ à¤°à¤¹à¤¾ à¤¹à¥..." : (editingId ? "à¤à¤ªà¤¡à¥à¤ à¤à¤°à¥à¤" : "à¤¨à¤¯à¤¾ à¤à¤à¤¾à¤à¤à¤ à¤à¥à¤¡à¤¼à¥à¤")}
                           </button>
                           {editingId && (
                             <button onClick={cancelEditing} className="border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900 text-surface-700 dark:text-surface-300 px-6 py-2.5 rounded-xl text-sm font-medium transition-all">
                               à¤°à¤¦à¥à¤¦ à¤à¤°à¥à¤
                             </button>
                           )}
                         </div>
                         {message && <p className="text-sm mt-3 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/30">{message}</p>}
                     </div>
                 </div>

                 {/* Connected Accounts Table */}
                 <div className="p-8 border-b border-surface-100 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50">
                     <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display flex items-center gap-2">
                        <Phone className="w-5 h-5 text-primary-500" /> à¤à¤¨à¥à¤à¥à¤à¥à¤¡ WhatsApp à¤à¤à¤¾à¤à¤à¤à¥à¤¸
                     </h3>
                     <p className="text-sm text-surface-500 mb-6">à¤à¤¸ à¤µà¤°à¥à¤à¤¸à¥à¤ªà¥à¤¸ à¤®à¥à¤ à¤à¥à¤¨à¥à¤«à¤¼à¤¿à¤à¤° à¤à¤¿à¤ à¤à¤ à¤¸à¤­à¥ à¤¸à¤à¥à¤°à¤¿à¤¯ WhatsApp à¤¨à¤à¤¬à¤° à¤à¤° à¤²à¤¾à¤à¤¨à¥à¤¸à¥¤</p>
                     
                     {configs.length === 0 ? (
                        <div className="p-8 text-center text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950/30">
                           à¤à¥à¤ à¤à¤¨à¥à¤à¥à¤à¥à¤¡ à¤à¤à¤¾à¤à¤à¤ à¤¨à¤¹à¥à¤ à¤®à¤¿à¤²à¤¾à¥¤ à¤¶à¥à¤°à¥ à¤à¤°à¤¨à¥ à¤à¥ à¤²à¤¿à¤ à¤à¤ªà¤° à¤¸à¥ à¤à¤ à¤à¤à¤¾à¤à¤à¤ à¤à¥à¤¡à¤¼à¥à¤à¥¤
                        </div>
                     ) : (
                        <div className="overflow-hidden border border-surface-200 dark:border-surface-800 rounded-2xl bg-white dark:bg-surface-950">
                           <table className="w-full text-left border-collapse text-sm">
                              <thead>
                                 <tr className="bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-800 text-surface-400 font-semibold">
                                    <th className="p-4">Phone Number ID</th>
                                     <th className="p-4">WABA ID</th>
                                    <th className="p-4">à¤à¤à¥-à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ à¤®à¥à¤¡</th>
                                    <th className="p-4">à¤à¤¨à¥à¤à¥à¤à¥à¤¡ à¤¤à¤¿à¤¥à¤¿</th>
                                     <th className="p-4 text-right">à¤à¤¾à¤°à¥à¤°à¤µà¤¾à¤</th>
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
                                              {cfg.reply_mode === 'ai' ? 'ð¤ AI à¤¬à¥à¤' : cfg.reply_mode === 'rule_based' ? 'â¡ à¤°à¥à¤²à¥à¤¸' : 'ð¤ à¤®à¥à¤¨à¥à¤¯à¥à¤à¤²'}
                                          </span>
                                       </td>
                                       <td className="p-4 text-xs text-surface-500">{cfg.created_at ? formatUserDateOnly(cfg.created_at) : 'N/A'}</td>
                                       <td className="p-4 text-right flex justify-end gap-2">
                                          <button onClick={() => startEditing(cfg)} title="à¤¬à¤¦à¤²à¥à¤" className="p-2 text-surface-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-lg transition-all">
                                             <Edit className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => deleteConfig(cfg.id)} title="à¤¹à¤à¤¾à¤à¤" className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
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
                      <h3 className="font-bold text-lg mb-2 text-surface-900 dark:text-white font-display">à¤¸à¥à¤¶à¤² à¤à¤à¤¾à¤à¤à¤à¥à¤¸</h3>
                     <p className="text-sm text-surface-500 mb-6">Instagram à¤à¤° Facebook à¤ªà¥à¤à¥à¤ à¤à¥ OAuth à¤à¥ à¤®à¤¾à¤§à¥à¤¯à¤® à¤¸à¥ à¤à¤¨à¥à¤à¥à¤ à¤à¤°à¥à¤à¥¤</p>
                     
                     <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
                         <Megaphone className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-4" />
                         <p className="text-sm text-surface-500 font-medium text-center">OAuth à¤à¤à¤à¥à¤à¥à¤°à¥à¤¶à¤¨ à¤à¤²à¥à¤¦ à¤¹à¥ à¤ à¤°à¤¹à¤¾ à¤¹à¥</p>
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
            toast('success', 'à¤¸à¤¬à¥à¤¸à¤à¥à¤°à¤¿à¤ªà¥à¤¶à¤¨ à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥à¤°à¥à¤µà¤ à¤à¤à¥à¤à¤¿à¤µ à¤¹à¥ à¤à¤¯à¤¾!');
          }}
        />
        </>
    )
}

