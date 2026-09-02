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
  voiceBotEnabled?: boolean;
  voiceBotInstructions?: string;
  voiceBotGreeting?: string;
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
  const [formVoiceBotEnabled, setFormVoiceBotEnabled] = useState(true);
  const [formVoiceBotInstructions, setFormVoiceBotInstructions] = useState("");
  const [formVoiceBotGreeting, setFormVoiceBotGreeting] = useState("");
  const [formOfficeHoursStart, setFormOfficeHoursStart] = useState("09:00");
  const [formOfficeHoursEnd, setFormOfficeHoursEnd] = useState("16:00");
  const [formOfficeHoursAudioUrl, setFormOfficeHoursAudioUrl] = useState("");
  const [formBusyAudioUrl, setFormBusyAudioUrl] = useState("");
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
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
      toast("success", "Voice status updated");
    } catch (e: any) {
      toast("error", e?.message || "Status not updated");
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
      if (!res.ok) throw new Error(data.error || "Phone not saved");
      setPhoneInput(data.phone || phoneInput);
      toast("success", "Agent phone saved");
    } catch (e: any) {
      toast("error", e?.message || "Phone not saved");
    } finally {
      setSavingPhone(false);
    }
  };

  const uploadAudio = async (e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isUploadingAudio) return;
    setIsUploadingAudio(true);
    toast("success", "Uploading audio...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setter(data.url);
      toast("success", "Audio uploaded successfully!");
    } catch (err: any) {
      toast("error", err?.message || "Audio upload failed");
    } finally {
      setIsUploadingAudio(false);
      e.target.value = "";
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setFormName("");
    setFormAuthId("");
    setFormAuthToken("");
    setFormFromNumbers("");
    setFormAutoDial(false);
    setFormVoiceBotEnabled(true);
    setFormVoiceBotInstructions("");
    setFormVoiceBotGreeting("");
    setFormOfficeHoursStart("09:00");
    setFormOfficeHoursEnd("16:00");
    setFormOfficeHoursAudioUrl("");
    setFormBusyAudioUrl("");
    setShowForm(true);
  };

  const openEdit = (cfg: any) => {
    setEditingId(cfg.id);
    setFormName(cfg.name || "");
    setFormAuthId(cfg.authId || "");
    setFormAuthToken("");
    setFormFromNumbers((cfg.fromNumbers || []).map((n: any) => n.fromNumber).join(", "));
    setFormAutoDial(!!cfg.autoDialAgents);
    setFormVoiceBotEnabled(cfg.voiceBotEnabled !== false);
    setFormVoiceBotInstructions(cfg.voiceBotInstructions || "");
    setFormVoiceBotGreeting(cfg.voiceBotGreeting || "");
    setFormOfficeHoursStart(cfg.officeHoursStart || "09:00");
    setFormOfficeHoursEnd(cfg.officeHoursEnd || "16:00");
    setFormOfficeHoursAudioUrl(cfg.officeHoursAudioUrl || "");
    setFormBusyAudioUrl(cfg.busyAudioUrl || "");
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
          voiceBotEnabled: formVoiceBotEnabled,
          voiceBotInstructions: formVoiceBotInstructions,
          voiceBotGreeting: formVoiceBotGreeting,
          officeHoursStart: formOfficeHoursStart,
          officeHoursEnd: formOfficeHoursEnd,
          officeHoursAudioUrl: formOfficeHoursAudioUrl,
          busyAudioUrl: formBusyAudioUrl,
        };
        const token = formAuthToken.trim();
        if (token) body.authToken = token;
        const res = await fetch("/api/plivo/configs/" + editingId, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-workspace-id": wId },
          body: JSON.stringify(body),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error || "Account not updated");
        toast("success", "Plivo account updated");
      } else {
        const authId = formAuthId.trim();
        const authToken = formAuthToken.trim();
        if (!authId) throw new Error("Auth ID is required");
        if (!authToken) throw new Error("Auth Token is required");
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
            voiceBotEnabled: formVoiceBotEnabled,
            voiceBotInstructions: formVoiceBotInstructions,
            voiceBotGreeting: formVoiceBotGreeting,
            officeHoursStart: formOfficeHoursStart,
            officeHoursEnd: formOfficeHoursEnd,
            officeHoursAudioUrl: formOfficeHoursAudioUrl,
            busyAudioUrl: formBusyAudioUrl,
          }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error || "Account not created");
        toast("success", "Plivo account connected");
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast("error", e?.message || "Account not saved");
    } finally {
      setSavingConfig(false);
    }
  };

  const deleteConfig = async (cfg: any) => {
    if (!confirm('Are you sure you want to delete "' + cfg.name + '" account?')) return;
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/configs/" + cfg.id, {
        method: "DELETE",
        headers: { "x-workspace-id": wId },
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast("success", "Plivo account deleted");
      load();
    } catch (e: any) {
      toast("error", e?.message || "Failed to delete");
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
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast("success", value ? "Auto-dial on" : "Auto-dial off");
      load();
    } catch (e: any) {
      toast("error", e?.message || "Update failed");
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
      if (!res.ok) throw new Error(data.error || "SIP Endpoint not linked");
      setLinkInfo((m) => ({ ...m, [cfg.id]: data }));
      toast("success", force ? "SIP Endpoint relinked" : "SIP Endpoint linked");
      load();
    } catch (e: any) {
      toast("error", e?.message || "SIP Endpoint not linked");
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
      if (!res.ok) throw new Error(data.error || "Number not linked");
      toast("success", "From number linked");
      setNewFromNumber((m) => ({ ...m, [cfgId]: "" }));
      load();
    } catch (e: any) {
      toast("error", e?.message || "Number not linked");
    }
  };

  const removeFromNumber = async (num: any) => {
    if (!confirm('"' + num.fromNumber + '" number?')) return;
    const wId = localStorage.getItem("workspaceId");
    if (!wId) return;
    try {
      const res = await fetch("/api/plivo/from-numbers/" + num.id, {
        method: "DELETE",
        headers: { "x-workspace-id": wId },
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "Number not deleted");
      toast("success", "Number deleted");
      load();
    } catch (e: any) {
      toast("error", e?.message || "Number not deleted");
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
      if (!res.ok) throw new Error(data.error || "Default not set");
      toast("success", "Default number set");
      load();
    } catch (e: any) {
      toast("error", e?.message || "Default not set");
    }
  };

  const statusLabels: Record<string, string> = {
    live: "Live",
    not_live: "Offline",
    busy: "Busy",
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
          <h2 className="font-bold text-lg text-surface-900 dark:text-white font-display">Plivo Voice</h2>
        </div>
        <p className="text-sm text-surface-500 mb-6">Browser (WebRTC) and PSTN calling via Plivo - set up incoming/outgoing calls.</p>

        {/* Agent availability + PSTN phone */}
        <div className="mb-8 pb-8 border-b border-surface-100 dark:border-surface-800">
          <h3 className="font-bold text-base mb-1 text-surface-900 dark:text-white">Agent voice status</h3>
          <p className="text-sm text-surface-500 mb-4">Your call availability and PSTN phone number (for auto-dial and fallback bridge).</p>

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
              <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Agent phone (PSTN)</label>
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
              {savingPhone ? "Saving..." : "Save phone"}
            </button>
          </div>

          {agents.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-surface-400 border-b border-surface-100 dark:border-surface-800">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a: any) => (
                    <tr key={a.userId} className="border-b border-surface-50 dark:border-surface-800/50">
                      <td className="py-2 pr-3 text-surface-700 dark:text-surface-200">
                        {a.name || a.email}
                        {me && a.userId === me.id ? " (you)" : ""}
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
              <h3 className="font-bold text-base text-surface-900 dark:text-white">Plivo Accounts</h3>
              <p className="text-sm text-surface-500">Plivo credentials, from numbers and SIP softphone endpoints.</p>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> New account
            </button>
          </div>

          {showForm && (
            <div className="mb-6 p-5 rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-primary-50/50 dark:bg-primary-950/20">
              <h4 className="font-bold text-sm text-surface-900 dark:text-white mb-4">
                {editingId ? "Edit account" : "New Plivo account"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Name</label>
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
                    Auth Token {editingId ? "(new, to change it)" : ""}
                  </label>
                  <input
                    value={formAuthToken}
                    onChange={(e) => setFormAuthToken(e.target.value)}
                    type="password"
                    placeholder={editingId ? "........ (leave blank)" : "Auth Token"}
                    className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {!editingId && (
                  <div>
                    <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">From numbers (comma separated)</label>
                    <input
                      value={formFromNumbers}
                      onChange={(e) => setFormFromNumbers(e.target.value)}
                      placeholder="+919669509952, +14153334444"
                      className="w-full px-4 py-2.5 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300 md:col-span-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formAutoDial}
                    onChange={(e) => setFormAutoDial(e.target.checked)}
                    className="rounded border-surface-300"
                  />
                  Auto-dial agents (forward to live agent&apos;s PSTN phone - extra per-minute cost)
                </label>
                
                <div className="md:col-span-2 pt-4 border-t border-surface-100 dark:border-surface-800">
                  <h5 className="font-bold text-sm text-surface-800 dark:text-surface-200 mb-1">AI Voice Bot (answers calls automatically)</h5>
                  <p className="text-xs text-surface-500 mb-3">When enabled, the AI assistant &quot;Arya&quot; answers incoming calls and talks to the caller directly (lowest cost - no agent PSTN leg). Leave off to ring human agents instead.</p>
                  
                  <label className="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300 mb-4">
                    <input
                      type="checkbox"
                      checked={formVoiceBotEnabled}
                      onChange={(e) => setFormVoiceBotEnabled(e.target.checked)}
                      className="rounded border-surface-300"
                    />
                    Enable AI Voice Bot &quot;Arya&quot; (uses Gemini Live; requires GEMINI_API_KEY in secrets)
                  </label>
                  
                  {formVoiceBotEnabled && (
                    <div className="grid grid-cols-1 gap-4 bg-surface-50 dark:bg-surface-900 p-4 rounded-xl border border-surface-100 dark:border-surface-800">
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Voice Bot Instructions (system prompt)</label>
                        <textarea
                          value={formVoiceBotInstructions}
                          onChange={(e) => setFormVoiceBotInstructions(e.target.value)}
                          rows={4}
                          placeholder="You are Arya, a friendly receptionist... Keep replies short and speak in the caller's language (default Hindi)."
                          className="w-full px-4 py-2.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                        />
                        <p className="text-[11px] text-surface-400 mt-1">Tells the AI how to behave. Leave blank for the built-in Arya persona.</p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Opening Greeting (played before AI starts)</label>
                        <input
                          value={formVoiceBotGreeting}
                          onChange={(e) => setFormVoiceBotGreeting(e.target.value)}
                          placeholder="Namaste, main Arya hoon. Aapse baat karke khushi hui..."
                          className="w-full px-4 py-2.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <p className="text-[11px] text-surface-400 mt-1">Short <code>&lt;Speak&gt;</code> line played while the AI connects. Leave blank for the default greeting.</p>
                      </div>
                    </div>
                  )}
                  
                  {formVoiceBotEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface-50 dark:bg-surface-900 p-4 rounded-xl border border-surface-100 dark:border-surface-800 mt-4">
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Office Start Time (HH:MM)</label>
                        <input
                          type="time"
                          value={formOfficeHoursStart}
                          onChange={(e) => setFormOfficeHoursStart(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Office End Time (HH:MM)</label>
                        <input
                          type="time"
                          value={formOfficeHoursEnd}
                          onChange={(e) => setFormOfficeHoursEnd(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <p className="text-[11px] text-surface-400 md:col-span-2">Outside these hours (IST), the bot plays an out-of-office message and hangs up instead of answering.</p>
                    </div>
                  )}
                  
                  {formVoiceBotEnabled && (
                    <div className="grid grid-cols-1 gap-4 bg-surface-50 dark:bg-surface-900 p-4 rounded-xl border border-surface-100 dark:border-surface-800 mt-4">
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Out of Office Audio MP3 (Optional)</label>
                        <div className="flex gap-2">
                          <input
                            value={formOfficeHoursAudioUrl}
                            onChange={(e) => setFormOfficeHoursAudioUrl(e.target.value)}
                            placeholder="https://.../audio.mp3"
                            className="flex-1 px-4 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <label className="cursor-pointer px-4 py-2 bg-surface-200 hover:bg-surface-300 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 text-xs font-bold rounded-xl transition-all flex items-center shrink-0">
                            Upload
                            <input type="file" accept="audio/mpeg, audio/mp3, audio/wav" className="hidden" disabled={isUploadingAudio} onChange={(e) => uploadAudio(e, setFormOfficeHoursAudioUrl)} />
                          </label>
                        </div>
                        <p className="text-[11px] text-surface-400 mt-1">If provided, this MP3 plays instead of the standard TTS voice when the office is closed.</p>
                      </div>
                      
                      <div>
                        <label className="text-xs font-bold text-surface-600 dark:text-surface-400 block mb-1">Team Busy Audio MP3 (Optional)</label>
                        <div className="flex gap-2">
                          <input
                            value={formBusyAudioUrl}
                            onChange={(e) => setFormBusyAudioUrl(e.target.value)}
                            placeholder="https://.../audio.mp3"
                            className="flex-1 px-4 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm text-surface-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <label className="cursor-pointer px-4 py-2 bg-surface-200 hover:bg-surface-300 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 text-xs font-bold rounded-xl transition-all flex items-center shrink-0">
                            Upload
                            <input type="file" accept="audio/mpeg, audio/mp3, audio/wav" className="hidden" disabled={isUploadingAudio} onChange={(e) => uploadAudio(e, setFormBusyAudioUrl)} />
                          </label>
                        </div>
                        <p className="text-[11px] text-surface-400 mt-1">Played when the voice bot is off and no agents are online (avoids TTS fees).</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                >
                  {savingConfig ? "Saving..." : editingId ? "Update" : "Add account"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 text-sm font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {configs.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-2xl bg-surface-50 dark:bg-surface-950/50">
              <Phone className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-4" />
              <p className="text-sm text-surface-500 font-medium text-center">
                No Plivo account connected. Start with &quot;New account&quot; above.
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
                        {cfg.voiceBotEnabled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                            AI BOT
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
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? "-" : "+"}
                      </button>
                      <button onClick={() => openEdit(cfg)} title="Edit" className="p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-all">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteConfig(cfg)} title="Delete" className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-surface-100 dark:border-surface-800">
                    <span className="text-xs font-bold text-surface-600 dark:text-surface-400">Auto-dial agents</span>
                    <button
                      onClick={() => toggleAutoDial(cfg, !cfg.autoDialAgents)}
                      className={
                        "relative w-11 h-6 rounded-full transition-colors " +
                        (cfg.autoDialAgents ? "bg-primary-600" : "bg-surface-300 dark:bg-surface-700")
                      }
                      title="Toggle auto-dial"
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
                        <h5 className="text-xs font-bold text-surface-600 dark:text-surface-400 mb-2">From numbers (Caller ID)</h5>
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
                                  <button onClick={() => makeDefault(n)} title="Make default" className="text-surface-400 hover:text-amber-500">
                                    <Star className="w-3 h-3" />
                                  </button>
                                )}
                                <button onClick={() => removeFromNumber(n)} title="Delete" className="text-surface-400 hover:text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-surface-400 mb-3">No from numbers.</p>
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
                            Add
                          </button>
                        </div>
                      </div>

                      {/* SIP endpoint */}
                      <div>
                        <h5 className="text-xs font-bold text-surface-600 dark:text-surface-400 mb-2">SIP softphone endpoint</h5>
                        <div className="p-4 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 text-xs space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-surface-500">Server</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">phone.plivo.com:5060</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-surface-500">Username</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">{cfg.endpointUsername || "-"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-surface-500">Password</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200">{cfg.endpointPasswordMasked || "-"}</span>
                          </div>
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-surface-500">SIP URI</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200 break-all">{sipUri || "-"}</span>
                          </div>
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-surface-500">App SIP URI</span>
                            <span className="font-mono text-surface-700 dark:text-surface-200 break-all">
                              {(info && info.applicationSipUri) || (cfg.endpointConfigured ? "sip:<app_id>@app.plivo.com" : "-")}
                            </span>
                          </div>
                          <p className="text-[11px] text-surface-400 pt-1">
                            The browser softphone picks up SIP credentials automatically. Use these details for Zoiper/hard phones.
                          </p>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => linkEndpoint(cfg, false)}
                            disabled={!!linkBusy[cfg.id]}
                            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                          >
                            {linkBusy[cfg.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                            {cfg.endpointConfigured ? "Relink" : "Add SIP Endpoint"}
                          </button>
                          {cfg.endpointConfigured && (
                            <button
                              onClick={() => linkEndpoint(cfg, true)}
                              disabled={!!linkBusy[cfg.id]}
                              className="px-4 py-2 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                            >
                              Create new endpoint (force)
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
