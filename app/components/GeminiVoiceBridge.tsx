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

  // Audio playback queue
  const nextPlayTimeRef = useRef<number>(0);
  const mediaStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/global-${workspaceId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'voice_agent_active' && data.payload) {
          const { from, instructions, provider, callId, sdp, phoneNumberId } = data.payload;

          if (provider === 'gemini') {
            setIsActive(true);
            setStatus("Connecting to Secure AI Proxy...");

            try {
              // 1. Initialize Audio Context
              if (!audioContextRef.current) {
                  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                  audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
                  nextPlayTimeRef.current = audioContextRef.current.currentTime;
                  // Create ONE destination for the outgoing WebRTC track
                  mediaStreamDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
              }

              // 2. Setup WebRTC Peer Connection using Cloudflare TURN/STUN
              let iceServers = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
              try {
                  const iceRes = await fetch('/api/webrtc/ice-servers');
                  const iceData = await iceRes.json() as any;
                  if (iceData.iceServers) {
                      iceServers = iceData.iceServers;
                  }
              } catch (e) {
                  console.warn("Failed to fetch TURN servers, using fallback STUN", e);
              }

              const pc = new RTCPeerConnection({ iceServers });
              pcRef.current = pc;

              // Ensure we expect audio back from the WebRTC peer and send audio to it
              pc.addTransceiver('audio', { direction: 'sendrecv' });

              // Attach our AI Audio destination to the WebRTC connection (so caller hears Gemini)
              if (mediaStreamDestinationRef.current) {
                  mediaStreamDestinationRef.current.stream.getTracks().forEach(track => {
                      pc.addTrack(track, mediaStreamDestinationRef.current!.stream);
                  });
              }

              pc.ontrack = (e) => {
                  // Browsers often suspend AudioContext if created without user interaction.
                  // Resuming it here just before processing audio ensures it's running.
                  if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                      audioContextRef.current.resume();
                  }

                  const stream = e.streams[0];
                  if (!audioContextRef.current) return;

                  const source = audioContextRef.current.createMediaStreamSource(stream);
                  const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

                  processor.onaudioprocess = (e) => {
                      const inputData = e.inputBuffer.getChannelData(0);
                      const pcm16 = new Int16Array(inputData.length);
                      for (let i = 0; i < inputData.length; i++) {
                          let s = Math.max(-1, Math.min(1, inputData[i]));
                          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                      }

                      const buffer = new Uint8Array(pcm16.buffer);
                      let binary = '';
                      for (let i = 0; i < buffer.byteLength; i++) {
                          binary += String.fromCharCode(buffer[i]);
                      }
                      const base64Data = window.btoa(binary);

                      if (geminiProxyWsRef.current && geminiProxyWsRef.current.readyState === WebSocket.OPEN) {
                          geminiProxyWsRef.current.send(JSON.stringify({
                              realtimeInput: {
                                  mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64Data }]
                              }
                          }));
                      }
                  };

                  source.connect(processor);
                  processor.connect(audioContextRef.current.destination);
              };

              // 3. Connect to Secure Backend Proxy for Gemini
              const proxyWsUrl = `${protocol}//${window.location.host}/api/ai/gemini-stream/${workspaceId}`;
              geminiProxyWsRef.current = new WebSocket(proxyWsUrl);

              geminiProxyWsRef.current.onopen = () => {
                 setStatus("Connected to Gemini, setting up audio...");
                 geminiProxyWsRef.current?.send(JSON.stringify({
                   setup: {
                     model: "models/gemini-2.0-flash-exp",
                     systemInstruction: { parts: [{ text: instructions }] },
                     generationConfig: { responseModalities: ["AUDIO"] }
                   }
                 }));
              };

              // Handle incoming messages (Audio/Text) from Gemini Proxy
              geminiProxyWsRef.current.onmessage = async (event) => {
                 try {
                     let textData = event.data;
                     if (event.data instanceof Blob) textData = await event.data.text();
                     const geminiData = JSON.parse(textData);

                     if (geminiData.serverContent && geminiData.serverContent.modelTurn) {
                         const parts = geminiData.serverContent.modelTurn.parts;
                         for (const part of parts) {
                             if (part.inlineData && part.inlineData.data) {
                                 const base64Audio = part.inlineData.data;
                                 const binaryString = window.atob(base64Audio);
                                 const bytes = new Uint8Array(binaryString.length);
                                 for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

                                 if (audioContextRef.current && mediaStreamDestinationRef.current) {
                                     const int16Array = new Int16Array(bytes.buffer);
                                     const float32Array = new Float32Array(int16Array.length);
                                     for (let i = 0; i < int16Array.length; i++) {
                                         float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
                                     }

                                     const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 16000);
                                     audioBuffer.copyToChannel(float32Array, 0);

                                     const source = audioContextRef.current.createBufferSource();
                                     source.buffer = audioBuffer;

                                     // Connect to local speakers AND WebRTC destination
                                     source.connect(audioContextRef.current.destination);
                                     source.connect(mediaStreamDestinationRef.current);

                                     // Queue audio playback to avoid overlapping noise
                                     const currentTime = audioContextRef.current.currentTime;
                                     if (nextPlayTimeRef.current < currentTime) {
                                         nextPlayTimeRef.current = currentTime;
                                     }
                                     source.start(nextPlayTimeRef.current);
                                     nextPlayTimeRef.current += audioBuffer.duration;
                                 }
                             }
                         }
                     }
                 } catch (err) {}
              };

              // 4. Accept Call via WebRTC & Meta Cloud API
              if (sdp && callId && phoneNumberId) {
                  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);

                  // Wait for ICE gathering to complete before sending SDP
                  await new Promise<void>((resolve) => {
                    if (pc.iceGatheringState === 'complete') {
                      resolve();
                    } else {
                      const checkState = () => {
                        if (pc.iceGatheringState === 'complete') {
                          pc.removeEventListener('icegatheringstatechange', checkState);
                          resolve();
                        }
                      };
                      pc.addEventListener('icegatheringstatechange', checkState);
                      // Timeout fallback
                      setTimeout(() => {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                      }, 5000);
                    }
                  });

                  const finalSdp = pc.localDescription?.sdp;

                  // Send SDP answer to backend to formally accept the call on Meta's side
                  const res = await fetch(`/api/whatsapp/calls/${callId}/answer`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-workspace-id': workspaceId
                    },
                    body: JSON.stringify({
                      sdp: finalSdp,
                      phoneNumberId: phoneNumberId
                    })
                  });

                  const result = await res.json() as { success: boolean };
                  if (!result.success) {
                    console.error('[GeminiVoiceBridge] Backend failed to accept call');
                  }
              }

              setStatus("AI Agent Active & Listening");
            } catch (err) {
                console.error(err);
                setStatus("Error connecting AI Agent");
            }
          }
        }
      } catch (e) {}
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
    <div className="fixed bottom-4 right-4 bg-surface-900 text-white p-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 border border-surface-700 animate-in slide-in-from-bottom-5">
      <div className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </div>
      <div>
        <h4 className="text-sm font-bold">Gemini Voice Agent</h4>
        <p className="text-xs text-surface-400">{status}</p>
      </div>
      <button
        onClick={() => {
            setIsActive(false);
            const proxyWs = geminiProxyWsRef.current;
            if (proxyWs) proxyWs.close();
            if (pcRef.current) pcRef.current.close();
            if (audioContextRef.current) audioContextRef.current.close();
        }}
        className="ml-4 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30"
      >
        End
      </button>
    </div>
  );
}
