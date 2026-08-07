import 'dart:async';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

class WebRTCService {
  static final WebRTCService _instance = WebRTCService._internal();
  factory WebRTCService() => _instance;
  WebRTCService._internal();

  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;

  final _remoteStreamController = StreamController<MediaStream?>.broadcast();
  Stream<MediaStream?> get onRemoteStream => _remoteStreamController.stream;

  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  bool _isMuted = false;
  bool get isMuted => _isMuted;

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

      _peerConnection!.onAddStream = (stream) {
        _remoteStream = stream;
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
        RTCSessionDescription(callData['sdp'], 'offer'),
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
      print('WebRTC Error: $e');
      _callStateController.add('error');
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
      print('Reject Error: $e');
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
      print('Hangup Error: $e');
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

  void cleanup() {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream?.dispose();
    _localStream = null;

    _peerConnection?.close();
    _peerConnection = null;

    _remoteStream = null;
    _remoteStreamController.add(null);
    _isMuted = false;
  }
}
