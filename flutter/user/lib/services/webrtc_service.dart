import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

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

  bool _isMuted = false;
  bool get isMuted => _isMuted;

  bool _speakerOn = false;
  bool get isSpeakerOn => _speakerOn;

  Future<void> requestPermissions() async {
    await [Permission.microphone].request();
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
    try {
      _callStateController.add('connecting');
      
      // Wait for app to become foreground (resumed) before accessing microphone.
      // On Android, accepting a call from lock screen might keep app in background briefly.
      int attempts = 0;
      while (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed && attempts < 100) {
        await Future.delayed(const Duration(milliseconds: 100));
        attempts++;
      }
      
      if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        throw Exception('App must be in foreground to answer call. Please unlock your phone.');
      }

      await requestPermissions();

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
        if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
          _callStateController.add('connected');
        } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
            state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
          _callStateController.add('ended');
          cleanup();
        }
      };

      await _peerConnection!.setRemoteDescription(
        RTCSessionDescription(callData['sdp']?.toString().isNotEmpty == true ? callData['sdp'] : throw Exception('WebRTC SDP is missing. This might be a standard WhatsApp call, not a WebRTC call.'), 'offer'),
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
            'phoneNumberId': callData['phoneNumberId'],
          },
        );
      }
    } catch (e) {
      debugPrint('WebRTC Error: $e');
      _callStateController.add('error: $e');
      cleanup();
    }
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
    cleanup();
    _callStateController.add('ended');
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
