import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'plivo_voice_sdk.dart';

enum PlivoNativeCallState {
  idle,
  registering,
  registered,
  ringingIn,
  ringingOut,
  connecting,
  inCall,
  ended,
  error,
}

/// Plivo official Android SDK ka high-level Dart wrapper.
///
/// Ye class abhi [PlivoVoiceService] (sip_ua) ke SATH chalti hai - migration ke
/// doran dono ko parallel rakhna safe hai, lekin ek hi endpoint username se dono
/// ko ek sath register karne par Plivo last-register-wins karta hai.
class PlivoNativeVoiceService {
  PlivoNativeVoiceService._();
  static final PlivoNativeVoiceService _instance = PlivoNativeVoiceService._();
  factory PlivoNativeVoiceService() => _instance;

  final PlivoVoiceSdk _sdk = PlivoVoiceSdk();

  final _state = StreamController<PlivoNativeCallState>.broadcast();
  Stream<PlivoNativeCallState> get onCallState => _state.stream;

  PlivoNativeCallState _current = PlivoNativeCallState.idle;
  PlivoNativeCallState get current => _current;

  Map<String, dynamic>? _activeCallData;
  Map<String, dynamic>? get activeCallData => _activeCallData;

  bool _initStarted = false;
  bool _isMuted = false;
  bool get isMuted => _isMuted;

  Future<void> init() async {
    if (_initStarted) return;
    _initStarted = true;
    await _sdk.init();
    _sdk.events.listen(_onNativeEvent);
  }

  /// App login ke baad ya startup par call karo. Credentials backend se milte hain.
  Future<bool> registerEndpoint() async {
    try {
      final creds = await ApiService().getPlivoSipCredentials();
      final username = creds['username'] as String?;
      final password = creds['password'] as String?;
      if (username == null || username.isEmpty || password == null || password.isEmpty) {
        debugPrint('[PlivoNative] SIP endpoint credentials not configured');
        _set(PlivoNativeCallState.error);
        return false;
      }

      String? fcmToken;
      try {
        fcmToken = await FirebaseMessaging.instance.getToken();
      } catch (e) {
        debugPrint('[PlivoNative] FCM token fetch failed: ' + e.toString());
      }

      // certificateId abhi Model-1 (push) ke liye backend se aayega; abhi optional.
      final certificateId = creds['certificateId'] as String?;

      _set(PlivoNativeCallState.registering);
      final ok = await _sdk.login(
        username: username,
        password: password,
        fcmToken: fcmToken,
        certificateId: certificateId,
      );
      if (!ok) _set(PlivoNativeCallState.error);
      return ok;
    } catch (e) {
      debugPrint('[PlivoNative] registerEndpoint error: ' + e.toString());
      _set(PlivoNativeCallState.error);
      return false;
    }
  }

  Future<bool> _ensureRegistered() async {
    if (await _sdk.isLoggedIn()) return true;
    final ok = await registerEndpoint();
    if (!ok) return false;
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (await _sdk.isLoggedIn()) return true;
    }
    return false;
  }

  /// Outgoing call. destination = "+919876543210" ya "conf_xxx" (sip: prefix na lagayein).
  Future<bool> makeCall(String destination) async {
    if (!await _ensureRegistered()) {
      _set(PlivoNativeCallState.error);
      return false;
    }
    _set(PlivoNativeCallState.connecting);
    final ok = await _sdk.makeCall(destination);
    if (!ok) _set(PlivoNativeCallState.error);
    return ok;
  }

  Future<void> answer() async {
    await _sdk.answer();
  }

  Future<void> reject() async {
    await _sdk.reject();
  }

  Future<void> hangup() async {
    await _sdk.hangup();
    _set(PlivoNativeCallState.ended);
  }

  Future<void> toggleMute() async {
    _isMuted = !_isMuted;
    await _sdk.toggleMute(mute: _isMuted);
  }

  Future<void> sendDigits(String digits) async {
    await _sdk.sendDigits(digits);
  }

  void _onNativeEvent(Map<String, dynamic> envelope) {
    final event = envelope['event'] as String? ?? '';
    final data = Map<String, dynamic>.from(envelope['data'] as Map? ?? {});

    switch (event) {
      case 'onLogin':
        _set(PlivoNativeCallState.registered);
        break;
      case 'onLogout':
        _set(PlivoNativeCallState.idle);
        break;
      case 'onLoginFailed':
        _set(PlivoNativeCallState.error);
        break;
      case 'onIncomingCall':
        _activeCallData = data;
        _set(PlivoNativeCallState.ringingIn);
        break;
      case 'onIncomingCallHangup':
      case 'onIncomingCallRejected':
      case 'onIncomingCallInvalid':
      case 'onOutgoingCallHangup':
      case 'onOutgoingCallRejected':
      case 'onOutgoingCallInvalid':
        _activeCallData = null;
        _set(PlivoNativeCallState.ended);
        break;
      case 'onOutgoingCall':
        _set(PlivoNativeCallState.connecting);
        break;
      case 'onOutgoingCallRinging':
        _set(PlivoNativeCallState.ringingOut);
        break;
      case 'onOutgoingCallAnswered':
        _set(PlivoNativeCallState.inCall);
        break;
      default:
        break;
    }
  }

  void _set(PlivoNativeCallState s) {
    _current = s;
    if (!_state.isClosed) {
      _state.add(s);
    }
  }
}
