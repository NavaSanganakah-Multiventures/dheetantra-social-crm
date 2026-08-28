import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:sip_ua/sip_ua.dart';

import 'api_service.dart';

/// Plivo softphone wrapper (SIP over WebSocket) for the DheeTantra user app.
///
/// Jab Plivo account ka "auto-forward to live agent" toggle OFF hota hai, tab
/// inbound caller Plivo conference me hold par rehta hai aur agent ki app
/// (FCM + CallKit ke through) ring hoti hai. Accept hone par CallScreen is
/// service ko conference name deta hai aur ye registered SIP endpoint se
/// outbound call karke usi conference me join ho jata hai.
class PlivoVoiceService implements SipUaHelperListener {
  static final PlivoVoiceService _instance = PlivoVoiceService._internal();
  factory PlivoVoiceService() => _instance;
  PlivoVoiceService._internal();

  static const String _domain = 'phone.plivo.com';
  static const String _webSocketUrl = 'wss://phone.plivo.com';

  final SIPUAHelper _helper = SIPUAHelper();
  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  Call? _call;
  MediaStream? _localStream;
  Completer<bool>? _registrationCompleter;

  bool _initStarted = false;
  bool _isMuted = false;
  bool _speakerOn = false;
  bool _isOnCall = false;

  bool get isMuted => _isMuted;
  bool get isSpeakerOn => _speakerOn;
  bool get isOnCall => _isOnCall;

  /// App start/login ke baad ek baar call karein: SIP UA start + register.
  Future<void> init() async {
    if (_initStarted) return;
    _initStarted = true;
    _helper.addSipUaHelperListener(this);

    try {
      await _ensureMicrophonePermission();
    } catch (e) {
      debugPrint('[PlivoVoice] mic permission error: $e');
    }

    try {
      await _register();
    } catch (e) {
      debugPrint('[PlivoVoice] initial SIP registration error: $e');
    }
  }

  Future<void> _ensureMicrophonePermission() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return;
    await Permission.microphone.request();
  }

  /// Backend se endpoint credentials lekar SIP UA ko start/register karta hai.
  Future<bool> _register() async {
    final existing = _registrationCompleter;
    if (existing != null && !existing.isCompleted) {
      return existing.future;
    }

    final creds = await ApiService().getPlivoSipCredentials();
    final username = creds['username'] as String?;
    final password = creds['password'] as String?;
    if (username == null || username.isEmpty || password == null || password.isEmpty) {
      debugPrint('[PlivoVoice] SIP endpoint credentials not configured');
      _callStateController.add('error: Plivo softphone endpoint not configured');
      return false;
    }

    final uri = 'sip:$username@$_domain';
    final settings = UaSettings()
      ..transportType = TransportType.WS
      ..webSocketUrl = creds['websocketUrl'] as String? ?? _webSocketUrl
      ..host = _domain
      ..uri = uri
      ..authorizationUser = username
      ..password = password
      ..displayName = creds['displayName'] as String? ?? 'DheeTantra'
      ..userAgent = 'DheeTantra-SIP/1.0'
      ..register = true
      ..dtmfMode = DtmfMode.RFC2833
      ..iceServers = [
        {'urls': 'stun:stun.plivo.com:3478'},
        {'urls': 'stun:stun.l.google.com:19302'},
      ];

    _registrationCompleter = Completer<bool>();
    await _helper.start(settings);
    return _registrationCompleter!.future.timeout(
      const Duration(seconds: 15),
      onTimeout: () => false,
    );
  }

  /// Conference join karne ke liye SIP outbound call. Dest = conference name
  /// as a SIP URI on phone.plivo.com; backend ka /api/plivo/webhook/app usi
  /// naam ke Plivo conference me dial karke bridge kar deta hai.
  Future<bool> joinConference(String conferenceName) async {
    final name = (conferenceName ?? '').trim();
    if (name.isEmpty) {
      debugPrint('[PlivoVoice] joinConference: empty conference name');
      return false;
    }

    try {
      if (!_helper.registered) {
        await _register();
        if (!_helper.registered) {
          _callStateController.add('error: SIP registration failed');
          return false;
        }
      }

      _callStateController.add('connecting');

      final mediaStream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });
      _localStream = mediaStream;

      final dest = 'sip:$name@$_domain';
      final ok = await _helper.call(dest, voiceOnly: true, mediaStream: mediaStream);
      if (ok != true) {
        _callStateController.add('error: SIP call failed');
        _reset();
        return false;
      }
      return true;
    } catch (e) {
      debugPrint('[PlivoVoice] joinConference error: $e');
      _callStateController.add('error: $e');
      _reset();
      return false;
    }
  }

  Future<void> hangUp() async {
    try {
      _call?.hangup();
    } catch (e) {
      debugPrint('[PlivoVoice] hangup error: $e');
    }
    _reset();
    _callStateController.add('ended');
  }

  Future<void> toggleMute() async {
    _isMuted = !_isMuted;
    try {
      if (_call != null) {
        if (_isMuted) {
          _call!.mute(true, false);
        } else {
          _call!.unmute(true, false);
        }
      }
    } catch (e) {
      debugPrint('[PlivoVoice] toggleMute error: $e');
    }
  }

  Future<void> toggleSpeaker() async {
    _speakerOn = !_speakerOn;
    try {
      final tracks = _localStream?.getAudioTracks() ?? [];
      if (tracks.isNotEmpty) {
        tracks.first.enableSpeakerphone(_speakerOn);
      }
    } catch (e) {
      debugPrint('[PlivoVoice] toggleSpeaker error: $e');
    }
  }

  @override
  void registrationStateChanged(RegistrationState state) {
    debugPrint('[PlivoVoice] registration state: ${state.state}');
    final completer = _registrationCompleter;
    if (completer == null || completer.isCompleted) return;
    if (state.state == RegistrationStateEnum.REGISTERED) {
      completer.complete(true);
    } else if (state.state == RegistrationStateEnum.REGISTRATION_FAILED) {
      completer.complete(false);
    }
  }

  @override
  void transportStateChanged(TransportState state) {
    debugPrint('[PlivoVoice] transport state: ${state.state}');
  }

  @override
  void callStateChanged(Call call, CallState state) {
    _call = call;
    switch (state.state) {
      case CallStateEnum.CALL_INITIATION:
      case CallStateEnum.CONNECTING:
        _callStateController.add('connecting');
        break;
      case CallStateEnum.PROGRESS:
        _callStateController.add('ringing');
        break;
      case CallStateEnum.ACCEPTED:
      case CallStateEnum.CONFIRMED:
        _isOnCall = true;
        break;
      case CallStateEnum.STREAM:
        _isOnCall = true;
        if (state.stream != null) {
          _localStream = state.stream;
        }
        _callStateController.add('connected');
        break;
      case CallStateEnum.MUTED:
        _isMuted = true;
        break;
      case CallStateEnum.UNMUTED:
        _isMuted = false;
        break;
      case CallStateEnum.ENDED:
      case CallStateEnum.FAILED:
        _reset();
        _callStateController.add('ended');
        break;
      default:
        break;
    }
  }

  @override
  void onNewMessage(SIPMessageRequest msg) {}

  @override
  void onNewNotify(Notify ntf) {}

  @override
  void onNewReinvite(ReInvite event) {}

  void _reset() {
    _call = null;
    _localStream = null;
    _isMuted = false;
    _speakerOn = false;
    _isOnCall = false;
  }
}
