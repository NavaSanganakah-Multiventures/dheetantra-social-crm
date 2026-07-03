"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WhatsAppCallEvent {
  id: string;
  from: string;
  sdp: string;
  phoneNumberId: string;
  workspace_id: string;
}

export function useWhatsAppWebRTC() {
  const [status, setStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setRemoteStream(null);
    setLocalStream(null);
    setStatus('idle');
  }, []);

  const answer = useCallback(async (call: WhatsAppCallEvent) => {
    try {
      setStatus('calling');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: call.sdp }));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete (Facebook requires SDES or full SDP with candidates)
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
          // Fallback timeout just in case it takes too long
          setTimeout(() => {
             pc.removeEventListener('icegatheringstatechange', checkState);
             resolve();
          }, 3000);
        }
      });

      const finalSdp = pc.localDescription?.sdp;

      // Send to our backend API to proxy to Facebook Graph API
      await fetch(`/api/whatsapp/calls/${call.id}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': call.workspace_id
        },
        body: JSON.stringify({
          sdp: finalSdp,
          phoneNumberId: call.phoneNumberId,
          from: call.from
        })
      });

      setStatus('connected');
    } catch (err) {
      console.error('Failed to answer call:', err);
      cleanup();
      throw err;
    }
  }, [cleanup]);

  const hangup = useCallback(async (call: WhatsAppCallEvent) => {
    try {
      await fetch(`/api/whatsapp/calls/${call.id}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': call.workspace_id
        },
        body: JSON.stringify({
          phoneNumberId: call.phoneNumberId
        })
      });
    } catch (err) {
      console.error('Failed to terminate call via API:', err);
    }
    
    cleanup();
  }, [cleanup]);

  // Handle incoming remote hangup via WebSocket broadcasts
  const handleRemoteHangup = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    status,
    remoteStream,
    localStream,
    answer,
    hangup,
    handleRemoteHangup
  };
}
