"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export interface PlivoCallInfo {
  id: string;
  from: string;
  callerName: string;
  phone?: string;
  dialUri?: string;
  sipTarget?: string;
  workspaceId: string;
  plivoConfigId?: string;
  direction: "incoming" | "outgoing";
}

export interface PlivoContact {
  id?: string;
  name: string;
  phone: string;
}

interface PlivoVoiceContextValue {
  incoming: PlivoCallInfo | null;
  active: PlivoCallInfo | null;
  status: "idle" | "connecting" | "connected" | "incoming" | "ended" | "error";
  registered: boolean;
  isMuted: boolean;
  speakerOn: boolean;
  duration: number;
  startCall: (contact: PlivoContact, opts?: { fromNumber?: string; plivoConfigId?: string }) => Promise<void>;
  answer: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const PlivoVoiceContext = createContext<PlivoVoiceContextValue | null>(null);

export function usePlivoVoice() {
  return useContext(PlivoVoiceContext);
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Plivo call IDs are server-generated UUIDs (crypto.randomUUID()). Validate
// before interpolating into a request URL to satisfy CodeQL SSRF checks.
function isSafeCallId(id: string | null | undefined): id is string {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function PlivoVoiceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("workspaceId");
  });
  const [registered, setRegistered] = useState(false);
  const [incoming, setIncoming] = useState<PlivoCallInfo | null>(null);
  const [active, setActive] = useState<PlivoCallInfo | null>(null);
  const [status, setStatus] = useState<PlivoVoiceContextValue["status"]>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);

  const clientRef = useRef<any>(null);
  const sdkRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const activeRef = useRef<PlivoCallInfo | null>(null);

  const credentialsRef = useRef<any[]>([]);
  const currentConfigIdRef = useRef<string | null>(null);
  const registeredRef = useRef<boolean>(false);
  const incomingCallUUIDRef = useRef<string | null>(null);

  useEffect(() => {
    registeredRef.current = registered;
  }, [registered]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const switchPlivoAccount = useCallback((newConfigId: string) => {
    if (!newConfigId) return;
    if (currentConfigIdRef.current === newConfigId) return;
    
    const creds = credentialsRef.current.find((c: any) => c.plivoConfigId === newConfigId);
    if (!creds || !creds.username || !creds.password) return;

    if (clientRef.current) {
      console.log(`[PlivoWeb] Switching SIP endpoint to config: ${newConfigId}`);
      try {
        clientRef.current.logout();
        clientRef.current.login(creds.username, creds.password);
        currentConfigIdRef.current = newConfigId;
        registeredRef.current = false;
        setRegistered(false);
      } catch (e) {
        console.error("[PlivoWeb] Error switching SIP endpoint", e);
      }
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, [clearTimer]);

  const cleanupCall = useCallback(() => {
    clearTimer();
    setActive(null);
    setIncoming(null);
    setStatus("idle");
    setIsMuted(false);
    setSpeakerOn(false);
    setDuration(0);
    incomingCallUUIDRef.current = null;
  }, [clearTimer]);

  const updateAgentStatus = useCallback((newStatus: "live" | "busy" | "not_live") => {
    if (workspaceId) {
      fetch("/api/voice/agent-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-workspace-id": workspaceId },
        body: JSON.stringify({ status: newStatus }),
      }).catch(console.error);
    }
  }, [workspaceId]);

  // Initialise Plivo Browser SDK and register the workspace's SIP endpoint.
  useEffect(() => {
    if (!workspaceId) return;
    const wsId = workspaceId;
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/plivo/sip-credentials", {
          headers: { "x-workspace-id": wsId },
        });
        if (!res.ok) {
          console.warn("[PlivoWeb] sip credentials fetch failed", await res.text());
          return;
        }
        const data: any = await res.json();
        const credsList = data.credentials || [];
        if (credsList.length === 0) {
          console.warn("[PlivoWeb] Plivo softphone endpoint not configured");
          return;
        }
        credentialsRef.current = credsList;
        const defaultCreds = credsList[0];
        if (!defaultCreds.username || !defaultCreds.password) return;
        currentConfigIdRef.current = defaultCreds.plivoConfigId;
        if (cancelled) return;

        const mod: any = await import("plivo-browser-sdk");
        const PlivoCtor = mod.default || mod.Plivo || (typeof window !== "undefined" ? (window as any).Plivo : null);
        if (!PlivoCtor) {
          console.error("[PlivoWeb] Plivo SDK constructor not found");
          return;
        }

        const sdk = new PlivoCtor({
          debug: "ERROR",
          permOnClick: true,
          closeProtection: true,
          enableQualityTracking: "localonly",
        });
        const client = sdk.client;
        sdkRef.current = sdk;
        clientRef.current = client;

        client.on("onLogin", () => {
          setRegistered(true);
          updateAgentStatus("live");
        });
        client.on("onLogout", () => {
          setRegistered(false);
          updateAgentStatus("not_live");
        });
        client.on("onLoginFailed", (cause: any) => {
          console.error("[PlivoWeb] login failed", cause);
          setRegistered(false);
          updateAgentStatus("not_live");
        });
        client.on("onWebrtcNotSupported", () => {
          console.error("[PlivoWeb] WebRTC not supported in this browser");
        });
        client.on("onCallAnswered", () => {
          setStatus("connected");
        });
        client.on("onMediaConnected", () => {
          setStatus("connected");
          startTimer();
        });
        client.on("onCallTerminated", () => {
          cleanupCall();
          updateAgentStatus("live");
        });
        client.on("onCallFailed", () => {
          cleanupCall();
          setStatus("error");
          updateAgentStatus("live");
        });
        client.on("onIncomingCall", (callerID: any, extraHeaders: any, callInfo: any) => {
          // Direct SIP inbound: Plivo <Dial><User> se endpoint par ring aati hai.
          incomingCallUUIDRef.current = callInfo?.callUUID || null;
          setStatus("incoming");
        });
        client.on("onIncomingCallCanceled", () => {
          incomingCallUUIDRef.current = null;
          setIncoming(null);
          setStatus("idle");
        });

        client.login(defaultCreds.username, defaultCreds.password);
      } catch (err) {
        console.error("[PlivoWeb] init error", err);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (sdkRef.current?.client && typeof sdkRef.current.client.logout === "function") {
        try {
          sdkRef.current.client.logout();
        } catch (e) {
          console.error("[PlivoWeb] client logout error", e);
        }
      }
      sdkRef.current = null;
      clientRef.current = null;
      cleanupCall();
    };
  }, [workspaceId, cleanupCall, startTimer, updateAgentStatus]);

  // Own WebSocket listener for Plivo incoming-call alerts and status updates.
  useEffect(() => {
    if (!workspaceId) return;
    const wsId = workspaceId;
    let cancelled = false;

    function connectWs() {
      if (cancelled) return;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/global-${wsId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "plivo_incoming_call") {
              if (data.aiAgent) {
                // AI voice agent is answering via Audio Stream — do not ring the softphone.
                console.log("[PlivoWeb] AI agent answering call " + data.callId);
                return;
              }
              if (data.plivoConfigId) {
                switchPlivoAccount(data.plivoConfigId);
              }
              setIncoming({
                id: data.callId,
                from: data.from,
                callerName: data.callerName || data.from,
                sipTarget: data.sipTarget,
                workspaceId: wsId,
                plivoConfigId: data.plivoConfigId,
                direction: "incoming",
              });
            } else if (data.type === "call_status_updated" && data.source === "plivo") {
              const callId = data.call_id || data.callId;
              // Clear the overlay if the call is answered elsewhere (e.g. PSTN auto-dial).
              if (data.status === "in_progress") {
                setIncoming((prev) => (prev && prev.id === callId ? null : prev));
              }
              if (
                data.status === "ended" ||
                data.status === "busy" ||
                data.status === "failed" ||
                data.status === "no_answer" ||
                data.status === "canceled" ||
                data.status === "declined"
              ) {
                if (activeRef.current && activeRef.current.id === callId) {
                  cleanupCall();
                }
                setIncoming((prev) => (prev && prev.id === callId ? null : prev));
              }
            }
          } catch (e) {
            console.error("[PlivoWeb] WS message parse error", e);
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            reconnectRef.current = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error("[PlivoWeb] WS error", err);
          try {
            ws.close();
          } catch (e) {
            // ignore
          }
        };
      } catch (err) {
        console.error("[PlivoWeb] WS connect error", err);
        if (!cancelled) {
          reconnectRef.current = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [workspaceId, cleanupCall]);

  // Play an audible ringtone while a Plivo incoming call is waiting.
  useEffect(() => {
    let interval: any;
    let audioCtx: any = null;
    let cancelled = false;

    async function startRing() {
      if (!incoming) return;
      try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        if (cancelled) return;
        const playRing = () => {
          if (!audioCtx || audioCtx.state !== 'running') return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
          osc.start();
          osc.stop(audioCtx.currentTime + 1.2);
        };
        playRing();
        interval = setInterval(playRing, 2000);
      } catch (e) {
        console.error('[PlivoWeb] ringtone playback error', e);
      }
    }
    startRing();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [incoming?.id]);

  // Direct SIP dial (outbound): server ab sirf dialUri deta hai; use endpoint se dial karo.
  const connectDirectSip = useCallback(
    async (sipUri: string, plivoConfigId?: string) => {
      setStatus("connecting");
      try {
        const client = clientRef.current;
        if (!client) throw new Error("Plivo softphone not initialized");

        if (plivoConfigId) {
          switchPlivoAccount(plivoConfigId);
        }

        const checkAndDial = () => {
          if (registeredRef.current) {
            client.call(sipUri);
          } else {
            setTimeout(checkAndDial, 200);
          }
        };
        checkAndDial();
      } catch (e: any) {
        console.error("[PlivoWeb] direct SIP dial error", e);
        setStatus("error");
        cleanupCall();
      }
    },
    [cleanupCall, switchPlivoAccount]
  );

  // Inbound: Plivo <Wait length="3"/> ke baad INVITE bhejta hai; callUUID tak wait karo.
  const waitForIncoming = useCallback(async (ms = 8000): Promise<string | null> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (incomingCallUUIDRef.current) return incomingCallUUIDRef.current;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }, []);

  const startCall = useCallback(
    async (contact: PlivoContact, opts?: { fromNumber?: string; plivoConfigId?: string }) => {
      if (!workspaceId) throw new Error("No workspace selected");
      setStatus("connecting");
      try {
        const res = await fetch("/api/plivo/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            to: contact.phone,
            contactId: contact.id || undefined,
            ...(opts?.plivoConfigId ? { plivoConfigId: opts.plivoConfigId } : {}),
            ...(opts?.fromNumber ? { fromNumber: opts.fromNumber } : {}),
          }),
        });
        const data: any = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Failed to create Plivo call");
        }
        const info: PlivoCallInfo = {
          id: data.callId,
          from: contact.phone,
          callerName: contact.name || contact.phone,
          phone: contact.phone,
          dialUri: data.dialUri,
          workspaceId,
          plivoConfigId: data.plivoConfigId ?? opts?.plivoConfigId,
          direction: "outgoing",
        };
        await connectDirectSip(data.dialUri, data.plivoConfigId ?? opts?.plivoConfigId);
        setActive(info);
        updateAgentStatus("busy");
      } catch (err: any) {
        console.error("[PlivoWeb] startCall error", err);
        cleanupCall();
        setStatus("error");
        throw err;
      }
    },
    [workspaceId, connectDirectSip, cleanupCall, updateAgentStatus]
  );

  const answer = useCallback(async () => {
    if (!incoming) return;
    if (!clientRef.current) {
      console.warn("[PlivoWeb] cannot answer: softphone not registered");
      return;
    }
    const uuid = await waitForIncoming();
    if (!uuid) {
      setStatus("error");
      return;
    }
    clientRef.current.answer(uuid);
    setActive({ ...incoming });
    setIncoming(null);
    updateAgentStatus("busy");
  }, [incoming, waitForIncoming, updateAgentStatus]);

  const reject = useCallback(async () => {
    const callId = incoming?.id;
    const uuid = incomingCallUUIDRef.current;
    if (uuid && clientRef.current) {
      try {
        clientRef.current.reject(uuid);
      } catch (e) {
        console.error("[PlivoWeb] reject error", e);
      }
    }
    setIncoming(null);
    setStatus("idle");
    updateAgentStatus("live");
    if (isSafeCallId(callId) && workspaceId) {
      try {
        await fetch(`/api/plivo/call/${encodeURIComponent(callId)}/decline`, {
          method: "POST",
          headers: { "x-workspace-id": workspaceId },
        });
      } catch (e) {
        console.error("[PlivoWeb] reject error", e);
      }
    }
  }, [incoming, workspaceId, updateAgentStatus]);

  const hangup = useCallback(async () => {
    const callId = active?.id;
    try {
      if (clientRef.current) clientRef.current.hangup();
    } catch (e) {
      console.error("[PlivoWeb] hangup error", e);
    }
    cleanupCall();
    if (isSafeCallId(callId) && workspaceId) {
      try {
        await fetch(`/api/plivo/call/${encodeURIComponent(callId)}/hangup`, {
          method: "POST",
          headers: { "x-workspace-id": workspaceId },
        });
      } catch (e) {
        console.error("[PlivoWeb] backend hangup error", e);
      }
    }
  }, [active, workspaceId, cleanupCall]);

  const toggleMute = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const next = !isMuted;
    try {
      if (next) client.mute();
      else client.unmute();
      setIsMuted(next);
    } catch (e) {
      console.error("[PlivoWeb] mute error", e);
    }
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    const client = clientRef.current;
    try {
      const speaker = client?.audio?.speakerDevices;
      if (speaker) {
        if (!speakerOn) {
          if (typeof speaker.set === "function") speaker.set("default");
        } else {
          if (typeof speaker.reset === "function") speaker.reset();
        }
      }
    } catch (e) {
      console.error("[PlivoWeb] speaker error", e);
    }
    setSpeakerOn((s) => !s);
  }, [speakerOn]);

  const value: PlivoVoiceContextValue = {
    incoming,
    active,
    status,
    registered,
    isMuted,
    speakerOn,
    duration,
    startCall,
    answer,
    reject,
    hangup,
    toggleMute,
    toggleSpeaker,
  };

  return (
    <PlivoVoiceContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {incoming && !active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[61] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-900 border border-surface-800 rounded-3xl max-w-sm w-full p-8 text-center text-white shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-sky-500/10 to-transparent pointer-events-none" />
              <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-20 animate-ping" />
                <div className="w-16 h-16 rounded-full bg-sky-600 flex items-center justify-center text-2xl font-bold shadow-lg shadow-sky-500/30">
                  {incoming.callerName?.[0] || "?"}
                </div>
              </div>
              <span className="inline-block px-3 py-1 bg-sky-500/15 text-sky-400 text-[10px] font-bold uppercase tracking-widest rounded-full mb-3">
                Incoming Plivo Call
              </span>
              <h3 className="text-xl font-bold font-display tracking-tight text-white truncate">
                {incoming.callerName}
              </h3>
              <p className="text-xs text-surface-400 font-mono mt-1">{incoming.from}</p>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={reject}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Decline
                </button>
                <button
                  onClick={answer}
                  className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-sky-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Answer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(status === "connecting" || status === "connected") && active && (
          <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:w-80 z-[61]">
            <motion.div
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              className="bg-surface-950 border border-surface-800/80 rounded-2xl p-5 shadow-2xl w-full text-white flex flex-col relative overflow-hidden backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 font-bold">
                  {active.callerName?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{active.callerName}</p>
                  <p className="text-xs text-surface-400 truncate">{active.from}</p>
                </div>
                <div className="text-xs font-mono text-sky-400">
                  {status === "connecting" ? "Connecting..." : formatDuration(duration)}
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-colors ${
                    isMuted ? "bg-rose-500 text-white" : "bg-surface-800 text-white hover:bg-surface-700"
                  }`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={toggleSpeaker}
                  className={`p-3 rounded-full transition-colors ${
                    speakerOn ? "bg-primary-600 text-white" : "bg-surface-800 text-white hover:bg-surface-700"
                  }`}
                  title={speakerOn ? "Earpiece" : "Speaker"}
                >
                  {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
                <button
                  onClick={hangup}
                  className="p-3 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 transition-colors"
                  title="Hang up"
                >
                  <PhoneOff className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PlivoVoiceContext.Provider>
  );
}
