"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WhatsAppCallEvent {
  id: string;
  from: string;
  sdp: string;
  phoneNumberId: string;
  workspace_id: string;
}

type CallStatus = 'idle' | 'requesting' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'error';

export function useWhatsAppWebRTC() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number>(0);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch(e) {}
      mediaRecorderRef.current = null;
    }
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
    setIsMuted(false);
    setCallDuration(0);
    setError(null);
    connectedAtRef.current = 0;
    recordingChunksRef.current = [];
    setStatus('idle');
  }, []);

  // Fetch Cloudflare TURN credentials from backend
  const fetchIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch('/api/webrtc/ice-servers');
      const data = await res.json() as { iceServers: RTCIceServer[] };
      return data.iceServers || [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ];
    } catch (err) {
      console.warn('[WebRTC] Failed to fetch TURN credentials, using STUN only:', err);
      return [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ];
    }
  }, []);

  // Start call duration timer
  const startDurationTimer = useCallback(() => {
    connectedAtRef.current = Date.now();
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Answer incoming call
  const answer = useCallback(async (call: WhatsAppCallEvent) => {
    try {
      setStatus('connecting');
      setError(null);

      // Validate that we have SDP before proceeding
      if (!call.sdp) {
        throw new Error('SDP (Session Description Protocol) डेटा उपलब्ध नहीं है। कृपया WhatsApp Cloud API की Calling Webhook सेटिंग जांचें।');
      }
      
      // 1. Fetch Cloudflare TURN/STUN credentials
      const iceServers = await fetchIceServers();
      
      // 2. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 3. Create RTCPeerConnection with Cloudflare ICE servers
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = pc;

      // Add local audio tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle incoming remote audio
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      // Connection state monitoring
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setStatus('connected');
          startDurationTimer();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('कनेक्शन विफल हो गया');
          cleanup();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      };

      // 4. Set remote SDP offer from Meta
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: call.sdp }));
      
      // 5. Create SDP answer
      const answerSdp = await pc.createAnswer();
      await pc.setLocalDescription(answerSdp);

      // 6. Wait for ICE gathering to complete
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
          // Timeout fallback — Meta requires response within 30-60 seconds
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }, 5000);
        }
      });

      const finalSdp = pc.localDescription?.sdp;

      // 7. Send SDP answer to backend → backend sends to Meta Graph API (pre_accept + accept)
      const res = await fetch(`/api/whatsapp/calls/${call.id}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': call.workspace_id
        },
        body: JSON.stringify({
          sdp: finalSdp,
          phoneNumberId: call.phoneNumberId
        })
      });

      const result = await res.json() as { success: boolean };
      if (!result.success) {
        throw new Error('Backend failed to accept call');
      }

      setStatus('connected');
      startDurationTimer();

      // 8. Start recording (optional — using MediaRecorder)
      try {
        const combinedStream = new MediaStream();
        // Add local audio
        stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        
        const recorder = new MediaRecorder(combinedStream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current = recorder;
        recordingChunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordingChunksRef.current.push(e.data);
          }
        };
        
        recorder.start(1000); // Record in 1-second chunks
      } catch (recErr) {
        console.warn('[WebRTC] Recording not supported:', recErr);
      }

    } catch (err: any) {
      console.error('[WebRTC] Failed to answer call:', err);
      setError(err.message || 'कॉल उत्तर देने में विफल');
      cleanup();
      throw err;
    }
  }, [cleanup, fetchIceServers, startDurationTimer]);

  // Hangup active call
  const hangup = useCallback(async (call: WhatsAppCallEvent) => {
    // Stop recording and upload
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Upload recording if we have chunks
    if (recordingChunksRef.current.length > 0) {
      try {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('recording', blob, `call-${call.id}.webm`);
        formData.append('callId', call.id);
        
        fetch('/api/whatsapp/calls/recordings', {
          method: 'POST',
          headers: { 'x-workspace-id': call.workspace_id },
          body: formData
        }).catch(err => console.error('[WebRTC] Failed to upload recording:', err));
      } catch (err) {
        console.error('[WebRTC] Failed to create recording blob:', err);
      }
    }

    // Send terminate to backend → Meta Graph API
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
      console.error('[WebRTC] Failed to terminate call via API:', err);
    }
    
    cleanup();
  }, [cleanup]);

  // Handle incoming remote hangup via WebSocket broadcasts
  const handleRemoteHangup = useCallback(() => {
    setStatus('ended');
    setTimeout(() => cleanup(), 500);
  }, [cleanup]);

  return {
    status,
    remoteStream,
    localStream,
    isMuted,
    callDuration,
    error,
    answer,
    hangup,
    toggleMute,
    handleRemoteHangup
  };
}
