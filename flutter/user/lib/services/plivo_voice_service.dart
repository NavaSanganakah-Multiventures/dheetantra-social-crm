import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:sip_ua/sip_ua.dart';

import 'api_service.dart';

/// Plivo softphone wrapper (SIP over TCP) for the DheeTantra user app.
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
  static const String _sipPort = '5060';

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

  Future<bool> _ensureMicrophonePermissionGranted() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return true;
    final result = await Permission.microphone.request();
    return result.isGranted;
  }

  /// Deprecated compatibility method: returns silently after requesting mic.
  Future<void> _ensureMicrophonePermission() async {
    await _ensureMicrophonePermissionGranted();
  }
  }

  /// Backend se endpoint credentials lekar SIP UA ko start/register karta hai.
  /// Concurrent callers (init + outbound join) ek hi attempt par wait karte hain.
  Future<bool> _register() async {
    final inflight = _registrationCompleter;
    if (inflight != null && !inflight.isCompleted) {
      return _waitRegistration(inflight);
    }

    final creds = await ApiService().getPlivoSipCredentials();
    final username = creds['username'] as String?;
    final password = creds['password'] as String?;
    if (username == null || username.isEmpty || password == null || password.isEmpty) {
      debugPrint('[PlivoVoice] SIP endpoint credentials not configured');
      _callStateController.add('error: Plivo softphone endpoint not configured');
      return false;
    }

    // Single source of truth: backend se mila SIP URI/server/port hi use karo,
    // taaki registration ka SIP URI hamesha wahi ho jo settings me dikhta hai.
    final server = (creds['server']?.toString()) ?? _domain;
    final portRaw = creds['port']?.toString();
    final transportRaw = (creds['transport']?.toString() ?? '').toLowerCase();
    // Plivo normally returns 'UDP/TCP'. For mobile we prefer UDP (lighter /
    // more reliable across carriers), falling back to TCP/TLS only if the
    // backend explicitly asks for it.
    final TransportType transportType;
    final int port;
    if (transportRaw.contains('tls')) {
      transportType = TransportType.TLS;
      port = int.tryParse(portRaw ?? '') ?? 5061;
    } else if (transportRaw.contains('udp')) {
      transportType = TransportType.UDP;
      port = int.tryParse(portRaw ?? '') ?? 5060;
    } else if (transportRaw.contains('tcp')) {
      transportType = TransportType.TCP;
      port = int.tryParse(portRaw ?? '') ?? 5060;
    } else {
      // Default to UDP for Flutter mobile softphones.
      transportType = TransportType.UDP;
      port = int.tryParse(portRaw ?? '') ?? 5060;
    }
    final sipUri = (creds['sipUri']?.toString()) ?? 'sip:$username@$server';
    debugPrint('[PlivoVoice] registering SIP URI: $sipUri (${transportType.name.toUpperCase()}, $server:$port)');
    final settings = UaSettings()
      ..transportType = transportType
      ..host = server
      ..port = port
      ..uri = sipUri
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

    final completer = Completer<bool>();
    _registrationCompleter = completer;


    // Agar helper pehle se start hai (previous call ya failed attempt),
    // usko stop karke naye settings se restart karo — sip_ua reconfigure
    // properly nahi karta pehli start ke baad.
    try {
      if (_helper.started) {
        await _helper.stop();
      }
    } catch (e) {
      debugPrint('[PlivoVoice] helper stop warning: $e');
    }

    try {
      await _helper.start(settings);
    } catch (e) {
      debugPrint('[PlivoVoice] SIP start error: $e');
      if (!completer.isCompleted) completer.complete(false);
      return false;
    }

    return _waitRegistration(completer);
  }

  /// Registration attempt ka result wait karta hai (timeout ke saath). Fail
  /// hone par specific error stream par bhejta hai taaki CallScreen sahi wajah
  /// dikha sake.
  Future<bool> _waitRegistration(Completer<bool> completer) async {
    try {
      final ok = await completer.future.timeout(const Duration(seconds: 15));
      if (!ok) {
        _callStateController.add('error: SIP registration failed');
      }
      return ok;
    } on TimeoutException {
      debugPrint('[PlivoVoice] SIP registration timed out');
      _callStateController.add('error: SIP registration failed');
      return false;
    } finally {
      if (identical(_registrationCompleter, completer)) {
        _registrationCompleter = null;
      // Allow future retries (e.g. network came back, credentials linked later).
      _initStarted = false;
      }
    }
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
        final registered = await _register();
        if (!registered) {
          // _register() ne specific error already stream par bheja hai.
          return false;
        }
      }

      _callStateController.add('connecting');

      // Mic permission is required before WebRTC can capture audio. Query it
      // again here because the user may have denied it earlier.
      if (!await _ensureMicrophonePermissionGranted()) {
        _callStateController.add('error: Microphone permission required');
        return false;
      }

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
    debugPrint('[PlivoVoice] registration state: ${state.state}' +
        (state.cause != null ? ' (cause: ${state.cause})' : ''));
    final completer = _registrationCompleter;
    if (completer == null || completer.isCompleted) return;
    if (state.state == RegistrationStateEnum.REGISTERED) {
      completer.complete(true);
    } else if (state.state == RegistrationStateEnum.REGISTRATION_FAILED) {
      completer.complete(false);
    }
  }

  @override
  @override
  void transportStateChanged(TransportState state) {
    debugPrint('[PlivoVoice] transport state: ${state.state}');
    final completer = _registrationCompleter;
    if (completer == null || completer.isCompleted) return;
    if (state.state == TransportStateEnum.DISCONNECTED) {
      debugPrint('[PlivoVoice] transport disconnected before register response');
      completer.complete(false);
    }
  }
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
        _reset();
        _callStateController.add('ended');
        break;
      case CallStateEnum.FAILED:
        // A failed SIP leg is NOT a normal call end. Emitting 'ended' here
        // made CallScreen pop instantly on registration/dial failures.
        _reset();
        _callStateController.add('error: Plivo SIP call failed');
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
