"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export interface TwilioCallInfo {
  id: string;
  from: string;
  callerName: string;
  phone?: string;
  conferenceName: string;
  workspaceId: string;
  direction: 'incoming' | 'outgoing';
}

export interface TwilioContact {
  id: string;
  name: string;
  phone: string;
}

interface TwilioVoiceContextValue {
  incoming: TwilioCallInfo | null;
  active: TwilioCallInfo | null;
  status: "idle" | "connecting" | "connected" | "ended" | "error";
  isMuted: boolean;
  speakerOn: boolean;
  duration: number;
  startCall: (contact: TwilioContact, opts?: { fromNumber?: string; twilioConfigId?: string }) => Promise<void>;
  answer: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const TwilioVoiceContext = createContext<TwilioVoiceContextValue | null>(null);

export function useTwilioVoice() {
  return useContext(TwilioVoiceContext);
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function TwilioVoiceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('workspaceId');
  });
  const [token, setToken] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<TwilioCallInfo | null>(null);
  const [active, setActive] = useState<TwilioCallInfo | null>(null);
  const [status, setStatus] = useState<TwilioVoiceContextValue["status"]>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [duration, setDuration] = useState(0);

  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const activeRef = useRef(active);

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
    callRef.current = null;
  }, [clearTimer]);

  useEffect(() => {
    if (!workspaceId) return;
    const wsId = workspaceId as string;
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/twilio/token?platform=web", {
          headers: { "x-workspace-id": wsId },
        });
        if (!res.ok) {
          console.warn("[TwilioWeb] token fetch failed", await res.text());
          return;
        }
        const data = await res.json() as any;
        if (!data.token || cancelled) return;
        setToken(data.token);

        const mod: any = await import("@twilio/voice-sdk");
        const Device = mod.Device || mod.default;
        const device = new Device(data.token, {
          logLevel: "warn",
          allowIncomingWhileBusy: true,
          closeProtection: true,
        });

        device.on("registered", () => {
          console.log("[TwilioWeb] device registered");
        });

        device.on("incoming", (call: any) => {
          console.log("[TwilioWeb] SDK incoming call", call.parameters);
          callRef.current = call;
          const params = call.parameters || {};
          setIncoming({
            id: params.CallSid || Date.now().toString(),
            from: params.From || "Unknown",
            callerName: params["__TWI_CALLER_NAME"] || params.From || "Unknown",
            conferenceName: params.To || "",
            workspaceId: wsId,
            direction: "incoming",
          });
        });

        device.on("error", (err: any) => {
          console.error("[TwilioWeb] device error", err);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err) {
        console.error("[TwilioWeb] init error", err);
      }
    }

    init();

    function connectWs() {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/global-${workspaceId as string}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "twilio_incoming_call") {
              setIncoming({
                id: data.callId,
                from: data.from,
                callerName: data.callerName || data.from,
                conferenceName: data.conferenceName,
                workspaceId: wsId,
                direction: "incoming",
              });
            } else if (data.type === "call_status_updated" && data.source === "twilio") {
              if (
                data.status === "ended" ||
                data.status === "busy" ||
                data.status === "failed" ||
                data.status === "no_answer" ||
                data.status === "canceled"
              ) {
                if (activeRef.current) cleanupCall();
              }
            }
          } catch (e) {
            console.error("[TwilioWeb] WS message parse error", e);
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            reconnectRef.current = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error("[TwilioWeb] WS error", err);
          ws.close();
        };
      } catch (err) {
        console.error("[TwilioWeb] WS connect error", err);
      }
    }

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
      if (deviceRef.current) {
        try {
          deviceRef.current.destroy();
        } catch (e) {
          console.error("[TwilioWeb] device destroy error", e);
        }
        deviceRef.current = null;
      }
      cleanupCall();
    };
  }, [workspaceId, cleanupCall]);

  const connectConference = useCallback(
    async (info: TwilioCallInfo, sdkCall?: any) => {
      setIncoming(null);
      setStatus("connecting");
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        let call = sdkCall;
        if (!call) {
          call = await deviceRef.current.connect({
            params: { To: info.conferenceName },
          });
        } else {
          await call.accept();
        }

        callRef.current = call;
        setActive(info);

        call.on("accept", () => {
          setStatus("connected");
          startTimer();
        });
        call.on("disconnect", () => cleanupCall());
        call.on("cancel", () => cleanupCall());
        call.on("reject", () => cleanupCall());
        call.on("error", () => cleanupCall());
      } catch (err) {
        console.error("[TwilioWeb] connectConference error", err);
        cleanupCall();
        setStatus("error");
        throw err;
      }
    },
    [cleanupCall, startTimer]
  );

  const startCall = useCallback(
    async (contact: TwilioContact, opts?: { fromNumber?: string; twilioConfigId?: string }) => {
      if (!workspaceId) throw new Error("No workspace selected");
      setStatus("connecting");
      try {
        const res = await fetch("/api/twilio/call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": workspaceId as string,
          },
          body: JSON.stringify({
            to: contact.phone,
            contactId: contact.id,
            ...(opts?.twilioConfigId ? { twilioConfigId: opts.twilioConfigId } : {}),
            ...(opts?.fromNumber ? { fromNumber: opts.fromNumber } : {}),
          }),
        });
        const data = await res.json() as any;
        if (!data.success) {
          throw new Error(data.error || "Failed to create Twilio call");
        }
        const info: TwilioCallInfo = {
          id: data.callId,
          from: contact.phone,
          callerName: contact.name,
          phone: contact.phone,
          conferenceName: data.conferenceName,
          workspaceId: workspaceId as string,
          direction: "outgoing",
        };
        await connectConference(info);
      } catch (err: any) {
        console.error("[TwilioWeb] startCall error", err);
        cleanupCall();
        setStatus("error");
        throw err;
      }
    },
    [workspaceId, connectConference, cleanupCall]
  );

  const answer = useCallback(() => {
    if (incoming) {
      connectConference(incoming, callRef.current);
    }
  }, [incoming, connectConference]);

  const reject = useCallback(() => {
    if (callRef.current && typeof callRef.current.reject === "function") {
      try {
        callRef.current.reject();
      } catch (e) {
        console.error("[TwilioWeb] reject error", e);
      }
    }
    setIncoming(null);
  }, []);

  const hangup = useCallback(() => {
    if (callRef.current && typeof callRef.current.disconnect === "function") {
      try {
        callRef.current.disconnect();
      } catch (e) {
        console.error("[TwilioWeb] hangup error", e);
      }
    }
    cleanupCall();
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    if (callRef.current && typeof callRef.current.mute === "function") {
      const next = !isMuted;
      callRef.current.mute(next);
      setIsMuted(next);
    }
  }, [isMuted]);

  const toggleSpeaker = useCallback(() => {
    try {
      const audio: any = deviceRef.current?.audio;
      if (audio?.speakerDevices) {
        if (!speakerOn) {
          audio.speakerDevices.set("default");
        } else {
          audio.speakerDevices.unset();
        }
      }
    } catch (e) {
      console.error("[TwilioWeb] toggle speaker error", e);
    }
    setSpeakerOn((s) => !s);
  }, [speakerOn]);

  const value: TwilioVoiceContextValue = {
    incoming,
    active,
    status,
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
    <TwilioVoiceContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {incoming && !active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-900 border border-surface-800 rounded-3xl max-w-sm w-full p-8 text-center text-white shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
              <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20 animate-ping" />
                <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-2xl font-bold shadow-lg shadow-emerald-500/30">
                  {incoming.callerName?.[0] || "?"}
                </div>
              </div>
              <span className="inline-block px-3 py-1 bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full mb-3">
                Incoming Twilio Call
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
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
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
          <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:w-80 z-[60]">
            <motion.div
              initial={{ y: 50, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 50, scale: 0.95, opacity: 0 }}
              className="bg-surface-950 border border-surface-800/80 rounded-2xl p-5 shadow-2xl w-full text-white flex flex-col relative overflow-hidden backdrop-blur-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  {active.callerName?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{active.callerName}</p>
                  <p className="text-xs text-surface-400 truncate">{active.from}</p>
                </div>
                <div className="text-xs font-mono text-emerald-400">
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
    </TwilioVoiceContext.Provider>
  );
}