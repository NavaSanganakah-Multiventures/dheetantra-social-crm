import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';
import 'websocket_service.dart';

class WebRTCService {
  static final WebRTCService _instance = WebRTCService._internal();
  factory WebRTCService() => _instance;
  WebRTCService._internal();

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;

  final _remoteStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get onRemoteStream => _remoteStreamController.stream;

  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  // Network flap (Disconnected) par 12s grace — uske baad bhi connected na
  // hua toh call ended + cleanup (dead call hamesha stuck na rahe).
  Timer? _disconnectTimer;

  // Call end hone par 'ended' event ek hi baar fire ho — cleanup() ke andar
  // _peerConnection.close() se Closed state re-fire hota hai jo double
  // 'ended' → double pop/cleanup banata tha. _emitEnded() se dedupe karte
  // hain; agli call ke liye answerCall() mein reset hota hai.
  bool _endEmitted = false;

  // Outbound WhatsApp call progress (ringing/answer) subscription.
  StreamSubscription? _outgoingSub;

  void _emitEnded() {
    if (_endEmitted) return;
    _endEmitted = true;
    _callStateController.add('ended');
    cleanup();
  }

  bool _isMuted = false;
  bool get isMuted => _isMuted;

  bool _speakerOn = false;
  bool get isSpeakerOn => _speakerOn;

  Future<PermissionStatus> get _microphoneStatus => Permission.microphone.status;

  Future<bool> ensureMicrophonePermission() async {
    final status = await _microphoneStatus;
    if (status.isGranted) return true;
    final requested = await Permission.microphone.request();
    return requested.isGranted;
  }

  Future<List<Map<String, dynamic>>> _getIceServers() async {
    try {
      final res = await ApiService().dio.get('/api/webrtc/ice-servers');
      final servers = res.data['iceServers'] as List;
      return servers.map((s) => Map<String, dynamic>.from(s)).toList();
    } catch (e) {
      return [
        {'urls': 'stun:stun.cloudflare.com:3478'},
        {'urls': 'stun:stun.l.google.com:19302'}
      ];
    }
  }

  Future<void> answerCall(Map<String, dynamic> callData) async {
    debugPrint('[WebRTC] answerCall started for call id: ${callData['id']}');
    try {
      _callStateController.add('connecting');
      _endEmitted = false;
      
      // Wait for app to become foreground (resumed) before accessing microphone.
      // On Android, accepting a call from lock screen might keep app in background briefly.
      // 10s ki jagah 5s — plugin accept flow mein app jaldi foreground aa jati hai
      // aur itna wait sirf mic access ke liye hai.
      int attempts = 0;
      while (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed && attempts < 50) {
        await Future.delayed(const Duration(milliseconds: 100));
        attempts++;
      }

      if (!await ensureMicrophonePermission()) {
        debugPrint('[WebRTC] microphone permission denied — aborting answer');
        throw Exception('Microphone permission is required to answer calls');
      }
      debugPrint('[WebRTC] microphone permission granted');

      final iceServers = await _getIceServers();
      final configuration = {
        'iceServers': iceServers,
        'sdpSemantics': 'unified-plan',
      };

      _peerConnection = await createPeerConnection(configuration);

      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });

      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });

      // Default to earpiece (main speaker) when the call starts.
      await setSpeaker(false);

      _peerConnection!.onAddStream = (stream) {
        _remoteStreamController.add(stream);
      };

      _peerConnection!.onConnectionState = (state) {
        debugPrint('[WebRTC] connectionState changed to: $state');
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
          // Reconnected — disconnect watchdog cancel.
          _disconnectTimer?.cancel();
          _disconnectTimer = null;
          _callStateController.add('connected');
        } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
          // Network flap transient ho sakta hai (switch/ICE restart), isliye
          // call turant mat kato. Par dead call bhi hamesha na phanse — 12s
          // grace ke baad ended + cleanup.
          _disconnectTimer ??= Timer(const Duration(seconds: 12), () {
            _disconnectTimer = null;
            debugPrint('[WebRTC] disconnected 12s — ending call');
            _emitEnded();
          });
        } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
          _disconnectTimer?.cancel();
          _disconnectTimer = null;
          _emitEnded();
        }
      };

      var offerSdp = callData['sdp']?.toString() ?? '';
      var answerPhoneNumberId = callData['phoneNumberId']?.toString() ?? '';
      if (offerSdp.isEmpty) {
        // FCM push SDP nahi bhejta (payload size limit) - accept ke waqt
        // backend se stored offer fetch karo.
        final callId = callData['id']?.toString() ?? callData['callId']?.toString() ?? '';
        final sdpRes = await ApiService().getCallSdp(callId);
        offerSdp = sdpRes['sdp']?.toString() ?? '';
        if (sdpRes['phoneNumberId'] != null) {
          answerPhoneNumberId = sdpRes['phoneNumberId'].toString();
        }
      }
      if (offerSdp.isEmpty) {
        throw Exception('WebRTC SDP is missing. This might be a standard WhatsApp call, not a WebRTC call.');
      }

      await _peerConnection!.setRemoteDescription(
        RTCSessionDescription(offerSdp, 'offer'),
      );

      final answer = await _peerConnection!.createAnswer();
      await _peerConnection!.setLocalDescription(answer);

      // Wait a bit for ICE candidates to gather
      await Future.delayed(const Duration(seconds: 2));
      final finalSdp = await _peerConnection!.getLocalDescription();

      if (finalSdp != null) {
        await ApiService().dio.post(
          '/api/whatsapp/calls/${callData['id']}/answer',
          data: {
            'sdp': finalSdp.sdp,
            'phoneNumberId': answerPhoneNumberId,
          },
        );
      }
    } catch (e) {
      debugPrint('[WebRTC] answerCall error: $e');
      _callStateController.add('error: $e');
      cleanup();
    }
  }

  /// WhatsApp outbound WebRTC call: creates an offer, sends it to the backend
  /// (which proxies Meta Graph API), then applies Meta's answer when it arrives
  /// via the `whatsapp_outgoing_answer` WebSocket event. Returns the local callId.
  Future<String> startOutgoingCall(Map<String, dynamic> callData) async {
    debugPrint('[WebRTC] startOutgoingCall to ${callData['to']}');
    try {
      _callStateController.add('ringing');
      _endEmitted = false;

      int attempts = 0;
      while (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed && attempts < 50) {
        await Future.delayed(const Duration(milliseconds: 100));
        attempts++;
      }

      if (!await ensureMicrophonePermission()) {
        throw Exception('Microphone permission is required to place calls');
      }

      final iceServers = await _getIceServers();
      final configuration = {
        'iceServers': iceServers,
        'sdpSemantics': 'unified-plan',
      };

      _peerConnection = await createPeerConnection(configuration);

      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });

      _localStream!.getTracks().forEach((track) {
        _peerConnection!.addTrack(track, _localStream!);
      });

      await setSpeaker(false);

      _peerConnection!.onAddStream = (stream) {
        _remoteStreamController.add(stream);
      };

      _peerConnection!.onConnectionState = (state) {
        debugPrint('[WebRTC] connectionState changed to: $state');
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
          _disconnectTimer?.cancel();
          _disconnectTimer = null;
          _callStateController.add('connected');
        } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
          _disconnectTimer ??= Timer(const Duration(seconds: 12), () {
            _disconnectTimer = null;
            debugPrint('[WebRTC] disconnected 12s - ending call');
            _emitEnded();
          });
        } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
          _disconnectTimer?.cancel();
          _disconnectTimer = null;
          _emitEnded();
        }
      };

      final offer = await _peerConnection!.createOffer();
      await _peerConnection!.setLocalDescription(offer);

      // Wait for ICE gathering so the full offer reaches the backend.
      await Future.delayed(const Duration(seconds: 2));
      final finalOffer = await _peerConnection!.getLocalDescription();
      final offerSdp = finalOffer?.sdp;
      if (offerSdp == null || offerSdp.isEmpty) {
        throw Exception('Failed to create SDP offer');
      }

      final res = await ApiService().initiateWhatsAppCall(
        to: callData['to']?.toString() ?? '',
        contactId: callData['contactId']?.toString(),
        phoneNumberId: callData['phoneNumberId']?.toString(),
        recipient: callData['recipient']?.toString(),
        sdp: offerSdp,
        sdpType: 'offer',
      );

      if (res['success'] != true) {
        throw Exception(res['error'] ?? 'Call initiation failed');
      }

      final localCallId = res['callId']?.toString() ?? '';
      if (localCallId.isEmpty) {
        throw Exception('Backend did not return a call id');
      }

      // Meta's ringing/answer arrives over WebSocket; filter by local callId.
      _outgoingSub?.cancel();
      _outgoingSub = WebSocketService().onOutgoingCallUpdate.listen((data) {
        if (data['callId']?.toString() != localCallId) return;
        final type = data['type']?.toString() ?? '';
        if (type == 'whatsapp_outgoing_ringing') {
          _callStateController.add('ringing');
        } else if (type == 'whatsapp_outgoing_answer') {
          final sdp = data['sdp']?.toString() ?? '';
          if (sdp.isNotEmpty) {
            _applyAnswerSdp(sdp, data['sdpType']?.toString() ?? 'answer');
          }
        }
      });

      return localCallId;
    } catch (e) {
      debugPrint('[WebRTC] startOutgoingCall error: $e');
      _callStateController.add('error: $e');
      cleanup();
      rethrow;
    }
  }

  Future<void> _applyAnswerSdp(String sdp, String sdpType) async {
    final pc = _peerConnection;
    if (pc == null) return;
    debugPrint('[WebRTC] applying remote answer SDP');
    final type = sdpType == 'offer' ? 'offer' : 'answer';
    await pc.setRemoteDescription(RTCSessionDescription(sdp, type));
    _callStateController.add('connecting');
  }

  Future<void> rejectCall(Map<String, dynamic> callData) async {
    try {
      await ApiService().dio.post(
        '/api/whatsapp/calls/${callData['id']}/reject',
        data: {
          'phoneNumberId': callData['phoneNumberId'],
        },
      );
    } catch (e) {
      debugPrint('Reject Error: $e');
    }
    cleanup();
  }

  Future<void> hangup(Map<String, dynamic> callData) async {
    try {
      await ApiService().dio.post(
        '/api/whatsapp/calls/${callData['id']}/terminate',
        data: {
          'phoneNumberId': callData['phoneNumberId'],
        },
      );
    } catch (e) {
      debugPrint('Hangup Error: $e');
    }
    _emitEnded();
  }

  void toggleMute() {
    if (_localStream != null) {
      final audioTracks = _localStream!.getAudioTracks();
      if (audioTracks.isNotEmpty) {
        final track = audioTracks[0];
        track.enabled = !track.enabled;
        _isMuted = !track.enabled;
      }
    }
  }

  Future<void> setSpeaker(bool on) async {
    _speakerOn = on;
    try {
      await Helper.setSpeakerphoneOn(on);
    } catch (e) {
      debugPrint('WebRTC setSpeaker error: $e');
    }
  }

  Future<void> toggleSpeaker() async {
    await setSpeaker(!_speakerOn);
  }

  void cleanup() {
    debugPrint('[WebRTC] cleanup()');
    _disconnectTimer?.cancel();
    _disconnectTimer = null;
    _outgoingSub?.cancel();
    _outgoingSub = null;
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _localStream = null;

    _peerConnection?.close();
    _peerConnection = null;

    _remoteStreamController.add(null);
    _isMuted = false;
    _speakerOn = false;
    // Reset audio routing to earpiece so the next call starts normally.
    Helper.setSpeakerphoneOn(false).catchError((_) {});
  }
}
