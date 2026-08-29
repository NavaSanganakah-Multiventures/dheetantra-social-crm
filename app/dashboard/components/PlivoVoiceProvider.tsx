"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export interface PlivoCallInfo {
  id: string;
  from: string;
  callerName: string;
  phone?: string;
  conferenceName: string;
  workspaceId: string;
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
  status: "idle" | "connecting" | "connected" | "ended" | "error";
  registered: boolean;
  isMuted: boolean;
  speakerOn: boolean;
  duration: number;
  startCall: (contact: PlivoContact) => Promise<void>;
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

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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
  }, [clearTimer]);

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
        if (!data.username || !data.password) {
          console.warn("[PlivoWeb] Plivo softphone endpoint not configured");
          return;
        }
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
          console.log("[PlivoWeb] endpoint registered");
          setRegistered(true);
        });
        client.on("onLogout", () => setRegistered(false));
        client.on("onLoginFailed", (cause: any) => {
          console.error("[PlivoWeb] login failed", cause);
          setRegistered(false);
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
        });
        client.on("onCallFailed", () => {
          cleanupCall();
          setStatus("error");
        });
        client.on("onIncomingCall", (callerID: any, extraHeaders: any, callInfo: any) => {
          // Direct endpoint SIP calls are not part of the PSTN conference flow.
          console.log("[PlivoWeb] direct endpoint incoming call (ignored)", callerID, extraHeaders, callInfo);
        });

        client.login(data.username, data.password);
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
  }, [workspaceId, cleanupCall, startTimer]);

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
              // Only ring inside the browser when the backend is in in-app
              // answering mode. With auto-dial ON the agent's PSTN phone rings.
              if (data.answerInApp !== true) return;
              setIncoming({
                id: data.callId,
                from: data.from,
                callerName: data.callerName || data.from,
                conferenceName: data.conferenceName,
                workspaceId: wsId,
                direction: "incoming",
              });
            } else if (data.type === "call_status_updated" && data.source === "plivo") {
              const callId = data.call_id || data.callId;
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

  // Join the Plivo conference by dialing the conference's SIP address through
  // the registered endpoint. This mirrors the Flutter softphone flow.
  const connectConference = useCallback(
    async (info: PlivoCallInfo) => {
      setIncoming(null);
      setStatus("connecting");
      try {
        const client = clientRef.current;
        if (!client) throw new Error("Plivo softphone not initialized");
        client.call("sip:" + info.conferenceName + "@phone.plivo.com");
        setActive(info);
      } catch (err) {
        console.error("[PlivoWeb] connectConference error", err);
        cleanupCall();
        setStatus("error");
        throw err;
      }
    },
    [cleanupCall]
  );

  const startCall = useCallback(
    async (contact: PlivoContact) => {
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
            mode: "in_app",
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
          conferenceName: data.conferenceName,
          workspaceId,
          direction: "outgoing",
        };
        await connectConference(info);
      } catch (err: any) {
        console.error("[PlivoWeb] startCall error", err);
        cleanupCall();
        setStatus("error");
        throw err;
      }
    },
    [workspaceId, connectConference, cleanupCall]
  );

  const answer = useCallback(() => {
    if (incoming) {
      connectConference(incoming);
    }
  }, [incoming, connectConference]);

  const reject = useCallback(async () => {
    const callId = incoming?.id;
    setIncoming(null);
    if (callId && workspaceId) {
      try {
        await fetch(`/api/plivo/call/${callId}/decline`, {
          method: "POST",
          headers: { "x-workspace-id": workspaceId },
        });
      } catch (e) {
        console.error("[PlivoWeb] reject error", e);
      }
    }
  }, [incoming, workspaceId]);

  const hangup = useCallback(async () => {
    const callId = active?.id;
    try {
      if (clientRef.current) clientRef.current.hangup();
    } catch (e) {
      console.error("[PlivoWeb] hangup error", e);
    }
    cleanupCall();
    if (callId && workspaceId) {
      try {
        await fetch(`/api/plivo/call/${callId}/hangup`, {
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
