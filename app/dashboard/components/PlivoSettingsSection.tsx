"use client";

import { useState, useEffect, useCallback } from "react";
import { PhoneCall, Link2, Plus, Trash2, Edit, Star, Loader2, Phone } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// Plivo Voice settings: agent availability + PSTN phone, Plivo accounts CRUD,
// SIP endpoint linking (for the Browser SDK softphone) and from-number setup.

interface Agent {
  userId: string;
  name?: string;
  email?: string;
  voiceStatus?: string;
  phoneMasked?: string;
}

interface PlivoConfig {
  id: string;
  name: string;
  authId: string;
  authTokenMasked: string;
  isActive: boolean;
  autoDialAgents: boolean;
  endpointConfigured: boolean;
  endpointUsername?: string;
  endpointPasswordMasked?: string;
  fromNumbers?: any[];
}

export function PlivoSettingsSection() {
  const { toast } = useToast();

  const [me, setMe] = useState<PlivoConfig | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configs, setConfigs] = useState<PlivoConfig[]>([]);

  const [voiceStatus, setVoiceStatus] = useState<string>("not_live");
  const [savingStatus, setSavingStatus] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formAuthId, setFormAuthId] = useState("");
  const [formAuthToken, setFormAuthToken] = useState("");
  const [formFromNumbers, setFormFromNumbers] = useState("");
  const [formAutoDial, setFormAutoDial] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [newFromNumber, setNewFromNumber] = useState<Record<string, string>>({});
  const [linkBusy, setLinkBusy] = useState<Record<string, boolean>>({});
  const [linkInfo, setLinkInfo] = useState<Record<string, any>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const [meRes, agentsRes, configsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/voice/agents", { headers: { "x-workspace-id": wId } }),
        fetch("/api/plivo/configs", { headers: { "x-workspace-id": wId } }),
      ]);
      const meData: any = meRes.ok ? await meRes.json() : {};
      const agentsData: any = agentsRes.ok ? await agentsRes.json() : { agents: [] };
      const configsData: any = configsRes.ok ? await configsRes.json() : { configs: [] };

      if (meData.user) {
        setMe(meData.user);
        setPhoneInput(meData.user.phone || "");
        const row = (agentsData.agents || []).find((a: any) => a.userId === meData.user.id);
        if (row) setVoiceStatus(row.voiceStatus || "not_live");
      }
      setAgents(agentsData.agents || []);
      setConfigs(configsData.configs || []);
    } catch (e) {
      console.error("[PlivoSettings] load error", e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const wId = localStorage.getItem("workspaceId");
      if (!wId) return;
      try {
        const [meRes, agentsRes, configsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/voice/agents", { headers: { "x-workspace-id": wId } }),
          fetch("/api/plivo/configs", { headers: { "x-workspace-id": wId } }),
        ]);
        const meData: any = meRes.ok ? await meRes.json() : {};
        const agentsData: any = agentsRes.ok ? await agentsRes.json() : { agents: [] };
        const configsData: any = configsRes.ok ? await configsRes.json() : { configs: [] };

        if (cancelled) return;
        if (meData.user) {
          setMe(meData.user);
          setPhoneInput(meData.user.phone || "");
          const row = (agentsData.agents || []).find((a: any) => a.userId === meData.user.id);
          if (row) setVoiceStatus(row.voiceStatus || "not_live");
        }
        setAgents(agentsData.agents || []);
        setConfigs(configsData.configs || []);
      } catch (e) {
        console.error("[PlivoSettings] load error", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveStatus = async (status: string) => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    setSavingStatus(true);
    try {
      const res = await fetch("/api/voice/agent-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wId },
        body: JSON.stringify({ status }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setVoiceStatus(data.voiceStatus || status);
      toast("success", "वॉयस स्टेटस अपडेट हो गया");
    } catch (e: any) {
      toast("error", e?.message || "स्टेटस अपडेट नहीं हुआ");
    } finally {
      setSavingStatus(false);
    }
  };

  const savePhone = async () => {
    setSavingPhone(true);
    try {
      const res = await fetch("/api/voice/agent-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "फोन सेव नहीं हुआ");
      setPhoneInput(data.phone || phoneInput);
      toast("success", "एजेंट फोन सेव हो गया");
    } catch (e: any) {
      toast("error", e?.message || "फोन सेव नहीं हुआ");
    } finally {
      setSavingPhone(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setFormName("");
    setFormAuthId("");
    setFormAuthToken("");
    setFormFromNumbers("");
    setFormAutoDial(false);
    setShowForm(true);
  };

  const openEdit = (cfg: any) => {
    setEditingId(cfg.id);
    setFormName(cfg.name || "");
    setFormAuthId(cfg.authId || "");
    setFormAuthToken("");
    setFormFromNumbers((cfg.fromNumbers || []).map((n: any) => n.fromNumber).join(", "));
    setFormAutoDial(!!cfg.autoDialAgents);
    setShowForm(true);
  };

  const saveConfig = async () => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    setSavingConfig(true);
    try {
      if (editingId) {
        const body: any = {
          name: formName.trim() || "My Plivo Account",
          autoDialAgents: formAutoDial,
        };
        const token = formAuthToken.trim();
        if (token) body.authToken = token;
        const res = await fetch("/api/plivo/configs/" + editingId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-workspace-id": wId },
          body: JSON.stringify(body),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error || "अकाउंट अपडेट नहीं हुआ");
        toast("success", "Plivo अकाउंट अपडेट हो गया");
      } else {
        const authId = formAuthId.trim();
        const authToken = formAuthToken.trim();
        if (!authId) throw new Error("Auth ID आवश्यक है");
        if (!authToken) throw new Error("Auth Token आवश्यक है");
        const fromNumbers = formFromNumbers.split(",").map((s: string) => s.trim()).filter(Boolean);
        const res = await fetch("/api/plivo/configs", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-workspace-id": wId },
          body: JSON.stringify({
            name: formName.trim() || "My Plivo Account",
            authId,
            authToken,
            fromNumbers,
            autoDialAgents: formAutoDial,
          }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error || "अकाउंट नहीं बना");
        toast("success", "Plivo अकाउंट जुड़ गया");
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast("error", e?.message || "अकाउंट सेव नहीं हुआ");
    } finally {
      setSavingConfig(false);
    }
  };

  const deleteConfig = async (cfg: any) => {
    if (!confirm('क्या आप वाकई "' + cfg.name + '" अकाउंट हटाना चाहते हैं?')) return;
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/configs/" + cfg.id, {
        method: "DELETE",
        headers: { "x-workspace-id": wId },
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "हटाने में विफल");
      toast("success", "Plivo अकाउंट हटा दिया गया");
      load();
    } catch (e: any) {
      toast("error", e?.message || "हटाने में विफल");
    }
  };

  const toggleAutoDial = async (cfg: any, value: boolean) => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/configs/" + cfg.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-workspace-id": wId },
        body: JSON.stringify({ autoDialAgents: value }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "अपडेट विफल");
      toast("success", value ? "ऑटो-डायल चालू" : "ऑटो-डायल बंद");
      load();
    } catch (e: any) {
      toast("error", e?.message || "अपडेट विफल");
    }
  };

  const linkEndpoint = async (cfg: any, force: boolean) => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    setLinkBusy((b) => ({ ...b, [cfg.id]: true }));
    try {
      const res = await fetch("/api/plivo/configs/" + cfg.id + "/link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wId },
        body: JSON.stringify({ force }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "SIP Endpoint लिंक नहीं हुआ");
      setLinkInfo((m) => ({ ...m, [cfg.id]: data }));
      toast("success", force ? "SIP Endpoint दोबारा जुड़ गया" : "SIP Endpoint जुड़ गया");
      load();
    } catch (e: any) {
      toast("error", e?.message || "SIP Endpoint लिंक नहीं हुआ");
    } finally {
      setLinkBusy((b) => ({ ...b, [cfg.id]: false }));
    }
  };

  const addFromNumber = async (cfgId: string) => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    const num = (newFromNumber[cfgId] || "").trim();
    if (!num) return;
    try {
      const res = await fetch("/api/plivo/configs/" + cfgId + "/from-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": wId },
        body: JSON.stringify({ fromNumber: num, isDefault: false }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "नंबर नहीं जुड़ा");
      toast("success", "फ्रॉम नंबर जुड़ गया");
      setNewFromNumber((m) => ({ ...m, [cfgId]: "" }));
      load();
    } catch (e: any) {
      toast("error", e?.message || "नंबर नहीं जुड़ा");
    }
  };

  const removeFromNumber = async (num: any) => {
    if (!confirm('"' + num.fromNumber + '" नंबर हटाएं?')) return;
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/from-numbers/" + num.id, {
        method: "DELETE",
        headers: { "x-workspace-id": wId },
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "नंबर नहीं हटा");
      toast("success", "नंबर हटा दिया गया");
      load();
    } catch (e: any) {
      toast("error", e?.message || "नंबर नहीं हटा");
    }
  };

  const makeDefault = async (num: any) => {
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/from-numbers/" + num.id + "/default", {
        method: "POST",
        headers: { "x-workspace-id": wId },
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "डिफ़ॉल्ट सेट नहीं हुआ");
      toast("success", "डिफ़ॉल्ट नंबर सेट हो गया");
      load();
    } catch (e: any) {
      toast("error", e?.message || "डिफ़ॉल्ट सेट नहीं हुआ");
    }
  };

  const statusLabels: Record<string, string> = {
    live: "लाइव",
    not_live: "ऑफ़लाइन",
    busy: "बिज़ी",
  };

  const statusStyles: Record<string, string> = {
    live: "bg-emerald-500 text-white border-emerald-500",
    not_live: "bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-700",
    busy: "bg-amber-500 text-white border-amber-500",
  };

  return (
    <div className="bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-2xl shadow-sm mb-8 overflow-hidden">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-1">
          <PhoneCall className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h2 className="font-bold text-lg text-surface-900 dark:text-white font-display">प्लिवो वॉयस (Plivo Voice)</h2>
        </div>
        <p className="text-sm text-surface-500 mb-6">Plivo से ब्राउज़र (WebRTC) और PSTN कॉलिंग — इनकमिंग/आउटगोइंग कॉल्स सेट करें।</p>

        {/* Agent availability + PSTN phone */}
        <div className="mb-8 pb-8 border-b border-surface-100 dark:border-surface-800">
          <h3 className="font-bold text-base mb-1 text-surface-900 dark:text-white">एजेंट वॉयस स्टेटस</h3>
          <p className="text-sm text-surface-500 mb-4">आपकी कॉल उपलब्धता और PSTN फोन नंबर (ऑटो-डायल और फॉलबैक ब्रिज के लिए)।</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {(["live", "not_live", "busy"] as const).map((s) => {
              const active = voiceStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => saveStatus(s)}
                  disabled={savingStatus}
                  className={
                    "px-4 py-2 rounded-full text-xs font-bold transition-all border " +
                    (active ? statusStyles[s] : "bg-white text-surface-600 border-surface-300 hover:border-surface-400 dark:bg-surface-900 dark:text-surface-300 dark:border-surface-700")
                  }
                >
                  {statusLabels[s]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">एजेंट फोन (PSTN)</label>
              <input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+919669509952"
                className="w-full px-4 py-2.5 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={savePhone}
              disabled={savingPhone}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
            >
              {savingPhone ? "सेविंग..." : "फोन सेव करें"}
            </button>
          </div>

          {agents.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-400 border-b border-surface-100 dark:border-surface-800">
                    <th className="py-2 pr-3 font-medium">एजेंट</th>
                    <th className="py-2 pr-3 font-medium">स्टेटस</th>
                    <th className="py-2 font-medium">फोन</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a: any) => (
                    <tr key={a.userId} className="border-b border-surface-50 dark:border-surface-800/50">
                      <td className="py-2 pr-3 text-surface-700 dark:text-surface-200">
                        {a.name || a.email}
                        {me && a.userId === me.id ? " (आप)" : ""}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold " +
                            (a.voiceStatus === "live"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : a.voiceStatus === "busy"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400")
                          }
                        >
                          {statusLabels[a.voiceStatus] || a.voiceStatus}
                        </span>
                      </td>
                      <td className="py-2 text-surface-500 font-mono text-xs">{a.phoneMasked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Accounts */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-surface-900 dark:text-white">Plivo अकाउंट्स</h3>
              <p className="text-sm text-surface-500">Plivo क्रेडेंशियल्स, फ्रॉम नंबर और SIP सॉफ्टफोन एंडपॉइंट।</p>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> नया अकाउंट
            </button>
          </div>

          {showForm && (
            <div className="mb-6 p-5 rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-primary-50/50 dark:bg-primary-950/20">
              <h4 className="font-bold text-sm text-surface-900 dark:text-white mb-4">
                {editingId ? "अकाउंट संपादित करें" : "नया Plivo अकाउंट"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">नाम</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="My Plivo Account"
                    className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Auth ID</label>
                  <input
                    value={formAuthId}
                    onChange={(e) => setFormAuthId(e.target.value)}
                    disabled={!!editingId}
                    placeholder="MAMjIx..."
                    className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">
                    Auth Token {editingId ? "(नया, बदलना हो तो)" : ""}
                  </label>
                  <input
                    value={formAuthToken}
                    onChange={(e) => setFormAuthToken(e.target.value)}
                    type="password"
                    placeholder={editingId ? "•••••••• (छोड़ें)" : "Auth Token"}
                    className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {!editingId && (
                  <div>
                    <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">फ्रॉम नंबर (कॉमा से अलग)</label>
                    <input
                      value={formFromNumbers}
                      onChange={(e) => setFormFromNumbers(e.target.value)}
                      placeholder="+919669509952, +14153334444"
                      className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={formAutoDial}
                    onChange={(e) => setFormAutoDial(e.target.checked)}
                    className="rounded border-surface-300"
                  />
                  ऑटो-डायल एजेंट्स (लाइव एजेंट के PSTN फोन पर ऑटो-फॉरवर्ड)
                </label>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                >
                  {savingConfig ? "सेविंग..." : editingId ? "अपडेट करें" : "अकाउंट जोड़ें"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 text-sm font-bold rounded-xl transition-all"
                >
                  रद्द करें
                </button>
              </div>
            </div>
          )}

          {configs.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
              <Phone className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-4" />
              <p className="text-sm text-surface-500 font-medium text-center">
                कोई Plivo अकाउंट नहीं जुड़ा। ऊपर &quot;नया अकाउंट&quot; से शुरू करें।
              </p>
            </div>
          )}

          {configs.map((cfg: any) => {
            const isOpen = expanded === cfg.id;
            const info = linkInfo[cfg.id];
            const sipUri = cfg.endpointUsername ? "sip:" + cfg.endpointUsername + "@phone.plivo.com" : null;
            return (
              <div key={cfg.id} className="mb-4 rounded-2xl border border-surface-200 dark:border-surface-800 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-surface-900 dark:text-white">{cfg.name}</h4>
                        {cfg.isActive ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                            INACTIVE
                          </span>
                        )}
                        {cfg.endpointConfigured && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            SIP LINKED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 mt-1 font-mono">Auth ID: {cfg.authId}</p>
                      <p className="text-xs text-surface-400 font-mono">Auth Token: {cfg.authTokenMasked}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpanded(isOpen ? null : cfg.id)}
                        className="p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-all"
                        title={isOpen ? "छोटा करें" : "विस्तार करें"}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                      <button onClick={() => openEdit(cfg)} title="संपादित करें" className="p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-all">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteConfig(cfg)} title="हटाएं" className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100 dark:border-surface-800">
                    <span className="text-xs font-bold text-surface-600 dark:text-surface-400">ऑटो-डायल एजेंट्स</span>
                    <button
                      onClick={() => toggleAutoDial(cfg, !cfg.autoDialAgents)}
                      className={
                        "relative w-11 h-6 rounded-full transition-colors " +
                        (cfg.autoDialAgents ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-700")
                      }
                      title="ऑटो-डायल टॉगल करें"
                    >
                      <span
                        className={
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform " +
                          (cfg.autoDialAgents ? "translate-x-5" : "")
                        }
                      />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-5 pt-5 border-t border-surface-100 dark:border-surface-800 space-y-5">
                      {/* From numbers */}
                      <div>
                        <h5 className="text-xs font-bold text-surface-600 dark:text-surface-400 mb-2">फ्रॉम नंबर (Caller ID)</h5>
                        {cfg.fromNumbers && cfg.fromNumbers.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {cfg.fromNumbers.map((n: any) => (
                              <span
                                key={n.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200"
                              >
                                {n.isDefault && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                                {n.fromNumber}
                                {!n.isDefault && (
                                  <button onClick={() => makeDefault(n)} title="डिफ़ॉल्ट बनाएं" className="text-surface-400 hover:text-amber-500">
                                    <Star className="w-3 h-3" />
                                  </button>
                                )}
                                <button onClick={() => removeFromNumber(n)} title="हटाएं" className="text-surface-400 hover:text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-surface-400 mb-3">कोई फ्रॉम नंबर नहीं।</p>
                        )}
                        <div className="flex gap-2">
                          <input
                            value={newFromNumber[cfg.id] || ""}
                            onChange={(e) => setNewFromNumber((m) => ({ ...m, [cfg.id]: e.target.value }))}
                            placeholder="+919669509952"
                            className="flex-1 px-4 py-2 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <button
                            onClick={() => addFromNumber(cfg.id)}
                            className="px-4 py-2 bg-surface-800 dark:bg-surface-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95"
                          >
                            जोड़ें
                          </button>
                        </div>
                      </div>

                      {/* SIP endpoint */}
                      <div>
                        <h5 className="text-xs font-bold text-surface-600 dark:text-surface-400 mb-2">SIP सॉफ्टफोन एंडपॉइंट</h5>
                        <div className="p-4 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 text-xs space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-surface-500">सर्वर</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">phone.plivo.com:5060</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-surface-500">यूज़रनेम</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">{cfg.endpointUsername || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-surface-500">पासवर्ड</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">{cfg.endpointPasswordMasked || "—"}</span>
                          </div>
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-surface-500">SIP URI</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200 break-all">{sipUri || "—"}</span>
                          </div>
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-surface-500">App SIP URI</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200 break-all">
                              {(info && info.applicationSipUri) || (cfg.endpointConfigured ? "sip:<app_id>@app.plivo.com" : "—")}
                            </span>
                          </div>
                          <p className="text-[11px] text-surface-400 pt-1">
                            ब्राउज़र सॉफ्टफोन अपने आप SIP क्रेडेंशियल्स लेता है। Zoiper/हार्ड फोन के लिए यह डिटेल इस्तेमाल करें।
                          </p>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => linkEndpoint(cfg, false)}
                            disabled={!!linkBusy[cfg.id]}
                            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                          >
                            {linkBusy[cfg.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                            {cfg.endpointConfigured ? "दोबारा जोड़ें" : "SIP Endpoint जोड़ें"}
                          </button>
                          {cfg.endpointConfigured && (
                            <button
                              onClick={() => linkEndpoint(cfg, true)}
                              disabled={!!linkBusy[cfg.id]}
                              className="px-4 py-2 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                            >
                              नया एंडपॉइंट बनाएं (force)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
