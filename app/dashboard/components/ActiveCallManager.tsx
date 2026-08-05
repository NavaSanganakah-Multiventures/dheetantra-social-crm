import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useWhatsAppWebRTC } from '@/lib/hooks/useWhatsAppWebRTC';

export function ActiveCallManager({ activeCall, setActiveCall, onHangup, remoteStream, localStream }: { activeCall: any, setActiveCall: any, onHangup?: () => void, remoteStream?: MediaStream | null, localStream?: MediaStream | null }) {
  const [callStartMs, setCallStartMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const seconds = callStartMs ? Math.floor((nowMs - callStartMs) / 1000) : 0;
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted, localStream]);

  // Track call start and current time for elapsed display
  // Synchronizes React state with an external clock â€” a legitimate use of setState in an effect
  useEffect(() => {
    if (activeCall.status === 'connected') {
      const startMs = Date.now();
      /* eslint-disable react-hooks/set-state-in-effect */
      setCallStartMs(startMs);
      setNowMs(startMs);
      /* eslint-enable react-hooks/set-state-in-effect */
      const interval = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [activeCall.status]);

  // Recording handled by useWhatsAppWebRTC hook (uploaded on hangup)

  const endCall = async () => {
    try {
      if (onHangup) {
        await onHangup();
      }
      await fetch(`/api/whatsapp/calls/${activeCall.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': activeCall.workspace_id
        },
        body: JSON.stringify({ status: 'completed', duration: seconds })
      });
    } catch(e) {}
    setActiveCall(null);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm text-indigo-400 shadow-inner">
          {activeCall.contact_name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-white truncate">{activeCall.contact_name || 'à¤…à¤œà¥à¤žà¤¾à¤¤'}</h4>
          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
            {activeCall.status === 'ringing' 
              ? (activeCall.direction === 'incoming' ? 'à¤•à¥‰à¤² à¤† à¤°à¤¹à¥€ à¤¹à¥ˆ...' : 'à¤¡à¤¾à¤¯à¤² à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') 
              : 'à¤•à¥‰à¤² à¤•à¤¨à¥‡à¤•à¥à¤Ÿà¥‡à¤¡'}
          </p>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-bold text-emerald-400">
            {activeCall.status === 'ringing' ? '00:00' : formatDuration(seconds)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
        <div className="flex gap-2">
          {/* Mute toggle button */}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 px-2.5 rounded-lg text-[10px] font-bold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>

          {/* Speaker toggle button */}
          <button 
            onClick={() => setIsSpeaker(!isSpeaker)}
            className="p-1.5 px-2.5 rounded-lg text-[10px] font-bold transition-all bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
            title="Speaker"
          >
            Speaker
          </button>
          {/* Recording handled by useWhatsAppWebRTC hook */}
        </div>

        {/* End Call Button */}
        <button
          onClick={endCall}
          className="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors shadow-lg shadow-rose-500/20 flex items-center gap-1.5"
        >
          <X className="w-3 h-3" />
          à¤•à¤¾à¤Ÿà¥‡à¤‚ (End)
        </button>
      </div>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

