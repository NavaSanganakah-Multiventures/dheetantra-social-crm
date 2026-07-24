'use client';

import React, { useEffect, useRef, useState } from 'react';

interface GeminiVoiceBridgeProps {
  workspaceId: string;
}

export default function GeminiVoiceBridge({ workspaceId }: GeminiVoiceBridgeProps) {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<string>("Idle");
  const wsRef = useRef<WebSocket | null>(null);
  const geminiProxyWsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    // Connect to our ChatDurableObject WebSocket to listen for 'voice_agent_active' events
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/global-${workspaceId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[GeminiVoiceBridge] Connected to DO Signaling Server");
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        // This is the signal we send from src/services/voiceAgent.ts
        if (data.type === 'voice_agent_active' && data.payload) {
          const { from, instructions, provider, callId, sdp } = data.payload;

          if (provider === 'gemini') {
            console.log(`[GeminiVoiceBridge] Activating AI Agent for call from ${from}`);
            setIsActive(true);
            setStatus("Connecting to Secure AI Proxy...");

            try {
              // Connect to our secure backend proxy instead of Google directly
              const proxyWsUrl = `${protocol}//${window.location.host}/api/ai/gemini-stream/${workspaceId}`;
              geminiProxyWsRef.current = new WebSocket(proxyWsUrl);

              geminiProxyWsRef.current.onopen = () => {
                 setStatus("Connected to Gemini, setting up audio...");
                 // Send initial setup message with instructions to Gemini (via Proxy)
                 geminiProxyWsRef.current?.send(JSON.stringify({
                   setup: {
                     model: "models/gemini-2.0-flash-exp",
                     systemInstruction: {
                       parts: [{ text: instructions }]
                     }
                   }
                 }));
              };

              // Setup WebRTC Peer Connection to receive WhatsApp Audio
              pcRef.current = new RTCPeerConnection({
                  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
              });

              pcRef.current.ontrack = (event) => {
                  // We received audio from WhatsApp user
                  const stream = event.streams[0];

                  // Process audio and send to Gemini WS Proxy
                  if (!audioContextRef.current) {
                      audioContextRef.current = new AudioContext({ sampleRate: 16000 }); // Gemini expects 16kHz
                  }

                  const source = audioContextRef.current.createMediaStreamSource(stream);
                  const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

                  processor.onaudioprocess = (e) => {
                      const inputData = e.inputBuffer.getChannelData(0);
                      // Convert Float32Array to Int16Array for Gemini (PCM 16-bit)
                      const pcm16 = new Int16Array(inputData.length);
                      for (let i = 0; i < inputData.length; i++) {
                          let s = Math.max(-1, Math.min(1, inputData[i]));
                          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                      }

                      // Convert Int16Array to base64
                      const buffer = new Uint8Array(pcm16.buffer);
                      let binary = '';
                      for (let i = 0; i < buffer.byteLength; i++) {
                          binary += String.fromCharCode(buffer[i]);
                      }
                      const base64Data = window.btoa(binary);

                      // Send to Gemini Proxy
                      if (geminiProxyWsRef.current && geminiProxyWsRef.current.readyState === WebSocket.OPEN) {
                          geminiProxyWsRef.current.send(JSON.stringify({
                              realtimeInput: {
                                  mediaChunks: [{
                                      mimeType: "audio/pcm;rate=16000",
                                      data: base64Data
                                  }]
                              }
                          }));
                      }
                  };

                  source.connect(processor);
                  processor.connect(audioContextRef.current.destination);
              };

              // If Meta sent an SDP offer (usually they send it in `whatsapp_incoming_call` event)
              // This is a simplified outline - real implementation requires full WebRTC signaling flow
              if (sdp) {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
                  const answer = await pcRef.current.createAnswer();
                  await pcRef.current.setLocalDescription(answer);

                  // In a real flow, you'd send this answer back to your backend
                  // fetch(`/api/whatsapp/calls/${callId}/answer`, { ... })
              }

              setStatus("AI Agent Active & Listening");

            } catch (err) {
                console.error(err);
                setStatus("Error connecting AI Agent");
            }
          }
        }
      } catch (e) {
        // Not a JSON message or error parsing
      }
    };

    return () => {
      ws.close();
      const proxyWs = geminiProxyWsRef.current;
      if (proxyWs) proxyWs.close();
      if (pcRef.current) pcRef.current.close();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [workspaceId]);

  if (!isActive) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-zinc-900 text-white p-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 border border-zinc-700 animate-in slide-in-from-bottom-5">
      <div className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </div>
      <div>
        <h4 className="text-sm font-bold">Gemini Voice Agent</h4>
        <p className="text-xs text-zinc-400">{status}</p>
      </div>
      <button
        onClick={() => {
            setIsActive(false);
            const proxyWs = geminiProxyWsRef.current;
            if (proxyWs) proxyWs.close();
            if (pcRef.current) pcRef.current.close();
        }}
        className="ml-4 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30"
      >
        End
      </button>
    </div>
  );
}
