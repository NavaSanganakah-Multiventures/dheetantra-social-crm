import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  UserAgent, 
  UserAgentOptions, 
  Inviter, 
  Invitation, 
  SessionState, 
  Registerer,
  Web,
} from 'sip.js';

export interface SipConfig {
  uri: string;
  wsServer: string;
  authorizationUsername?: string;
  authorizationPassword?: string;
  displayName?: string;
}

export function useSip(config: SipConfig | null) {
  const [ua, setUa] = useState<UserAgent | null>(null);
  const [registerer, setRegisterer] = useState<Registerer | null>(null);
  const [session, setSession] = useState<Inviter | Invitation | null>(null);
  const [status, setStatus] = useState<'unregistered' | 'registering' | 'registered' | 'calling' | 'connected' | 'ended'>('unregistered');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize UserAgent
  useEffect(() => {
    if (!config || !config.uri || !config.wsServer) return;

    const options: UserAgentOptions = {
      uri: UserAgent.makeURI(config.uri),
      transportOptions: {
        server: config.wsServer
      },
      authorizationUsername: config.authorizationUsername,
      authorizationPassword: config.authorizationPassword,
      displayName: config.displayName || 'WhatsApp Web Agent',
      delegate: {
        onInvite: (invitation) => {
          console.log('Incoming call from:', invitation.remoteIdentity.uri.toString());
          setSession(invitation);
          setStatus('calling');
          
          invitation.stateChange.addListener((newState) => {
            if (newState === SessionState.Terminated) {
              setSession(null);
              setStatus('ended');
              setRemoteStream(null);
            }
          });
        }
      }
    };

    const newUa = new UserAgent(options);
    const newRegisterer = new Registerer(newUa);

    Promise.resolve().then(() => {
      setUa(newUa);
      setRegisterer(newRegisterer);
    });

    newUa.start().then(() => {
      setStatus('registering');
      return newRegisterer.register();
    }).then(() => {
      setStatus('registered');
    }).catch(err => {
      console.error('SIP registration failed:', err);
      setStatus('unregistered');
    });

    return () => {
      newRegisterer.unregister();
      newUa.stop();
    };
  }, [config]);

  const answer = useCallback(async () => {
    if (session instanceof Invitation) {
      const options = {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false }
        }
      };
      
      await session.accept(options);
      setStatus('connected');

      // Set remote stream
      const remoteStream = new MediaStream();
      const receiver = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      receiver.peerConnection?.getReceivers().forEach((receiver) => {
        if (receiver.track) {
          remoteStream.addTrack(receiver.track);
        }
      });
      setRemoteStream(remoteStream);
    }
  }, [session]);

  const hangup = useCallback(async () => {
    if (session) {
      if (session.state === SessionState.Initial || session.state === SessionState.Establishing) {
        if (session instanceof Invitation) {
          await session.reject();
        } else {
          await session.cancel();
        }
      } else {
        await session.bye();
      }
      setSession(null);
      setStatus('ended');
      setRemoteStream(null);
    }
  }, [session]);

  const call = useCallback(async (target: string) => {
    if (!ua) return;

    const targetUri = UserAgent.makeURI(target);
    if (!targetUri) return;

    const inviter = new Inviter(ua, targetUri);
    setSession(inviter);
    setStatus('calling');

    inviter.stateChange.addListener((newState) => {
      if (newState === SessionState.Established) {
        setStatus('connected');
        const remoteStream = new MediaStream();
        const receiver = inviter.sessionDescriptionHandler as Web.SessionDescriptionHandler;
        receiver.peerConnection?.getReceivers().forEach((receiver) => {
          if (receiver.track) {
            remoteStream.addTrack(receiver.track);
          }
        });
        setRemoteStream(remoteStream);
      } else if (newState === SessionState.Terminated) {
        setSession(null);
        setStatus('ended');
        setRemoteStream(null);
      }
    });

    await inviter.invite();
  }, [ua]);

  return {
    ua,
    session,
    status,
    remoteStream,
    answer,
    hangup,
    call
  };
}
