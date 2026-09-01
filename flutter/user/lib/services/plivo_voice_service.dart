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

  String? _currentConfigId;
  List<dynamic> _credentialsList = [];
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
      await _ensureMicrophonePermissionGranted();
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

  /// Backend se endpoint credentials lekar SIP UA ko start/register karta hai.
  /// Concurrent callers (init + outbound join) ek hi attempt par wait karte hain.
  Future<bool> _register({String? targetConfigId}) async {
    final inflight = _registrationCompleter;
    if (inflight != null && !inflight.isCompleted) {
      await _waitRegistration(inflight);
      if (targetConfigId != null && _currentConfigId != targetConfigId) {
        // Continue to register with the requested config since the previous one was different
      } else {
        return true;
      }
    }

    if (_credentialsList.isEmpty) {
      final res = await ApiService().getPlivoSipCredentials();
      _credentialsList = res['credentials'] as List<dynamic>? ?? [];
    }

    if (_credentialsList.isEmpty) {
      debugPrint('[PlivoVoice] SIP endpoint credentials not configured');
      _callStateController.add('error: Plivo softphone endpoint not configured');
      return false;
    }

    // Default to the first config if none provided
    final configToUse = targetConfigId ?? (_credentialsList.first['plivoConfigId'] as String? ?? '');
    if (configToUse.isEmpty) return false;

    if (_helper.registered && _currentConfigId == configToUse) {
       return true; // Already registered to this config
    }

    final creds = _credentialsList.firstWhere(
      (c) => c['plivoConfigId'] == configToUse, 
      orElse: () => null
    );

    if (creds == null) {
      debugPrint('[PlivoVoice] SIP endpoint credentials not found for $configToUse');
      return false;
    }

    final username = creds['username'] as String?;
    final password = creds['password'] as String?;
    if (username == null || username.isEmpty || password == null || password.isEmpty) {
      debugPrint('[PlivoVoice] SIP endpoint credentials not configured');
      _callStateController.add('error: Plivo softphone endpoint not configured');
      return false;
    }

    if (_helper.registered || _helper.connected) {
      debugPrint('[PlivoVoice] Stopping current SIP UA to switch accounts');
      _helper.stop();
      int attempts = 0;
      while (_helper.connected && attempts < 20) {
        await Future.delayed(const Duration(milliseconds: 50));
        attempts++;
      }
    }

    final server = (creds['server']?.toString()) ?? _domain;
    final port = (creds['port']?.toString()) ?? _sipPort;
    final sipUri = (creds['sipUri']?.toString()) ?? 'sip:$username@$server';
    debugPrint('[PlivoVoice] registering SIP URI: $sipUri (TCP, $server:$port) for config $configToUse');
    
    final settings = UaSettings()
      ..transportType = TransportType.TCP
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

    try {
      await _helper.start(settings);
      _currentConfigId = configToUse;
    } catch (e) {
      debugPrint('[PlivoVoice] SIP start error: $e');
      if (!completer.isCompleted) completer.complete(false);
      return false;
    }

    return _waitRegistration(completer);
  }

  Future<void> switchAccountBackground(String configId) async {
    if (_currentConfigId == configId && _helper.registered) return;
    await _register(targetConfigId: configId);
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
      }
      // Allow future retries (e.g. network came back, credentials linked later).
      _initStarted = false;
    }
  }

  /// TCP/WebSocket transport register hone ke baad connected hone tak wait
  /// karta hai, kyunki sip_ua ka call() sirf connected state mein jaata hai.
  Future<bool> _waitUntilConnected({required Duration timeout}) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      if (_helper.registered && _helper.connected) return true;
      await Future.delayed(const Duration(milliseconds: 200));
    }
    debugPrint('[PlivoVoice] timeout waiting for SIP connection (registered=${_helper.registered}, connected=${_helper.connected})');
    return _helper.registered && _helper.connected;
  }

  /// Conference join karne ke liye SIP outbound call. Dest = conference name
  /// as a SIP URI on phone.plivo.com; backend ka /api/plivo/webhook/app usi
  /// naam ke Plivo conference me dial karke bridge kar deta hai.
  Future<bool> joinConference(String conferenceName, {String? plivoConfigId}) async {
    final name = conferenceName.trim();
    if (name.isEmpty) {
      debugPrint('[PlivoVoice] joinConference: empty conference name');
      return false;
    }

    try {
      if (!_helper.registered || (plivoConfigId != null && _currentConfigId != plivoConfigId)) {
        final registered = await _register(targetConfigId: plivoConfigId);
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

      // sip_ua may report registered before the TCP/WebSocket transport is
      // fully connected. Wait briefly so the INVITE doesn't fail immediately.
      final connected = await _waitUntilConnected(timeout: const Duration(seconds: 8));
      if (!connected) {
        _callStateController.add('error: SIP UA not connected');
        _reset();
        return false;
      }

      final dest = 'sip:$name@$_domain';
      var ok = await _helper.call(dest, voiceOnly: true, mediaStream: mediaStream);
      if (ok != true) {
        // One reconnect attempt: re-register and try again.
        debugPrint('[PlivoVoice] initial call attempt failed, reconnecting...');
        final registered = await _register(targetConfigId: plivoConfigId);
        if (registered) {
          await _waitUntilConnected(timeout: const Duration(seconds: 8));
          ok = await _helper.call(dest, voiceOnly: true, mediaStream: mediaStream);
        }
      }
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
  void transportStateChanged(TransportState state) {
    debugPrint('[PlivoVoice] transport state: ${state.state}');
    final completer = _registrationCompleter;
    if (completer == null || completer.isCompleted) return;
    if (state.state == TransportStateEnum.DISCONNECTED) {
      debugPrint('[PlivoVoice] transport disconnected before register response');
      completer.complete(false);
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
        final cause = state.cause?.toString();
        _callStateController.add(cause != null && cause.isNotEmpty
            ? 'error: Plivo SIP call failed: $cause'
            : 'error: Plivo SIP call failed');
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
