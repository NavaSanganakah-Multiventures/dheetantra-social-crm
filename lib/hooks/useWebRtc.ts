'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebRtcConfig {
  workspaceId: string;
}

export function useWebRtc(config: WebRtcConfig | null) {
  const [status, setStatus] = useState<'idle' | 'calling' | 'connected' | 'incoming' | 'ended' | 'error'>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const initWebRtc = useCallback(async (isCaller: boolean, target?: string) => {
    try {
      cleanup();
      setStatus('calling');

      // 1. Get Local Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Initialize PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote tracks
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setStatus('connected');
        }
      };

      // 3. Initialize Signaling (using standard WebSocket to Durable Object)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/voice_${config?.workspaceId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const send = (event: string, payload: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event, payload }));
        }
      };

      ws.onmessage = async (e) => {
        const data = JSON.parse(e.data);
        const { event, payload } = data;

        if (event === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send('answer', { answer });
        } else if (event === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        } else if (event === 'ice-candidate') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error("Error adding ice candidate", e);
          }
        } else if (event === 'hangup') {
          cleanup();
          setStatus('ended');
          setTimeout(() => setStatus('idle'), 2000);
        }
      };

      // 4. Create Offer if Caller
      if (isCaller) {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            send('ice-candidate', { candidate: event.candidate });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        ws.onopen = () => {
          send('offer', { 
            offer, 
            target, 
            callerId: config?.workspaceId 
          });
        };
      }

    } catch (err: any) {
      console.error("WebRTC Error:", err);
      setError(err.message);
      setStatus('error');
    }
  }, [config, cleanup]);

  const call = useCallback(async (target: string) => {
    await initWebRtc(true, target);
  }, [initWebRtc]);

  const answer = useCallback(async () => {
    // Logic for answering is mostly handled in ws.onmessage 'offer'
    // This function can be used to trigger the media flow if needed
  }, []);

  const hangup = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'hangup' }));
    }
    cleanup();
    setStatus('ended');
    setTimeout(() => setStatus('idle'), 2000);
  }, [cleanup]);

  return {
    status,
    localStream,
    remoteStream,
    error,
    call,
    answer,
    hangup
  };
}
