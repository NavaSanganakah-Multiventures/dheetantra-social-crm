import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:twilio_voice/twilio_voice.dart';

import 'api_service.dart';

/// Twilio Voice SDK wrapper for DheeTantra Flutter user app.
///
/// - Conference-based calls ke liye use hota hai (PSTN customer + agent dono
///   ek hi Twilio conference room me join hote hain).
/// - Isme incoming Twilio native invites ka use nahi hota; incoming alert
///   hamare apne FCM push + flutter_callkit_incoming se aata hai. Agar aap
///   Twilio ke native push incoming chahate hain toh token generation me
///   pushCredentialSid include karna hoga.
/// - Android ConnectionService ke liye PhoneAccount register karna zaroori hai,
///   isliye init() me runtime permissions aur phone account setup hota hai.
class TwilioVoiceService {
  static final TwilioVoiceService _instance = TwilioVoiceService._internal();
  factory TwilioVoiceService() => _instance;
  TwilioVoiceService._internal();

  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  String _conferenceName = '';
  String get conferenceName => _conferenceName;

  String? _identity;
  String? _accessToken;
  String? _deviceToken;

  bool _isMuted = false;
  bool get isMuted => _isMuted;

  bool _speakerOn = false;
  bool get isSpeakerOn => _speakerOn;

  bool _isOnCall = false;
  bool get isOnCall => _isOnCall;

  bool _initStarted = false;

  TwilioVoice get _voice => TwilioVoice.instance;

  /// App start/login ke baad ek baar call karein. Ismein permissions,
  /// phone account registration aur Twilio token registration hota hai.
  Future<void> init() async {
    if (_initStarted) return;
    _initStarted = true;

    _listenEvents();

    try {
      await _ensurePermissionsAndAccount();
    } catch (e) {
      debugPrint('[TwilioVoice] permission/account setup error: $e');
    }

    try {
      // Default caller name set karo taaki unknown caller UI me "Unknown" dikhaye
      await _voice.setDefaultCallerName('Unknown Caller');
    } catch (e) {
      debugPrint('[TwilioVoice] setDefaultCallerName error: $e');
    }

    // Best-effort token registration so that SDK is ready when a call arrives.
    try {
      await _registerOrRefreshToken();
    } catch (e) {
      debugPrint('[TwilioVoice] initial token registration error: $e');
    }

    debugPrint('[TwilioVoice] init complete');
  }

  /// Microphone aur Android telecom permissions ensure karta hai.
  Future<void> _ensurePermissionsAndAccount() async {
    // Microphone permission zaroori hai dono platforms ke liye.
    final mic = await _request(Permission.microphone);
    if (!mic.isGranted) {
      throw Exception('Microphone permission denied');
    }

    if (kIsWeb || !Platform.isAndroid) return;

    // Android ConnectionService / Telecom integration ke liye zaroori permissions.
    await _request(Permission.phone);

    await _voice.requestCallPhonePermission();
    await _voice.requestReadPhoneStatePermission();
    await _voice.requestReadPhoneNumbersPermission();
    await _voice.requestManageOwnCallsPermission();

    // Phone account register karo. User ko pehli baar calling account enable
    // karne ke liye settings bhejna pad sakta hai.
    final registered = await _voice.registerPhoneAccount();
    debugPrint('[TwilioVoice] registerPhoneAccount result: $registered');

    if (!(await _voice.isPhoneAccountEnabled())) {
      debugPrint('[TwilioVoice] Phone account not enabled yet');
    }
  }

  Future<PermissionStatus> _request(Permission permission) async {
    final status = await permission.status;
    if (status.isGranted) return status;
    return permission.request();
  }

  /// Server se fresh Twilio token lekar SDK me register karta hai.
  /// Android par FCM token bhi pass karta hai (kam se kam re-registration ke
  /// liye useful hota hai).
  Future<void> _registerOrRefreshToken() async {
    try {
      final tokenRes = await ApiService().getTwilioVoiceToken();
      final token = tokenRes['token'] as String?;
      if (token == null || token.isEmpty) {
        throw Exception('Backend se Twilio token nahi mila');
      }

      _accessToken = token;
      _identity = _extractIdentity(token) ?? _identity;

      if (!kIsWeb && Platform.isAndroid) {
        _deviceToken = await FirebaseMessaging.instance.getToken();
      }

      debugPrint('[TwilioVoice] registering token, identity: $_identity');
      final ok = await _voice.setTokens(
        accessToken: token,
        deviceToken: _deviceToken,
      );
      if (ok != true) {
        throw Exception('Twilio setTokens() failed');
      }
    } catch (e) {
      debugPrint('[TwilioVoice] token registration error: $e');
      rethrow;
    }
  }

  /// Agent ko Twilio conference room me connect karta hai.
  /// [conferenceName] backend se conferenceName/CALL-XXX format me aata hai.
  Future<bool> joinConference(String conferenceName, {String? callerName}) async {
    if (conferenceName.isEmpty) {
      debugPrint('[TwilioVoice] joinConference: empty conference name');
      return false;
    }

    try {
      await _registerOrRefreshToken();
      _conferenceName = conferenceName;
      _callStateController.add('connecting');

      // TwiML app ke voice URL mein "To" body param conference name ke roop me
      // milega, jisse backend same conference mein join kar sakega.
      final ok = await _voice.call.connect(extraOptions: {'To': conferenceName});

      if (ok != true) {
        _callStateController.add('error: Twilio connect failed');
        _reset();
        return false;
      }

      return true;
    } catch (e) {
      debugPrint('[TwilioVoice] joinConference error: $e');
      _callStateController.add('error: $e');
      _reset();
      return false;
    }
  }

  Future<void> hangUp() async {
    if (!_isOnCall) {
      _reset();
      return;
    }
    try {
      await _voice.call.hangUp();
    } catch (e) {
      debugPrint('[TwilioVoice] hangUp error: $e');
    }
    _reset();
    _callStateController.add('ended');
  }

  Future<void> toggleMute() async {
    _isMuted = !_isMuted;
    try {
      await _voice.call.toggleMute(_isMuted);
    } catch (e) {
      debugPrint('[TwilioVoice] toggleMute error: $e');
    }
  }

  Future<void> toggleSpeaker() async {
    _speakerOn = !_speakerOn;
    try {
      await _voice.call.toggleSpeaker(_speakerOn);
    } catch (e) {
      debugPrint('[TwilioVoice] toggleSpeaker error: $e');
    }
  }

  /// SDK se aane wale events ko hamari app ke state machine mein map karta hai.
  void _listenEvents() {
    _voice.callEventsListener.listen((event) {
      debugPrint('[TwilioVoice] SDK event: $event');
      switch (event) {
        case CallEvent.ringing:
          _callStateController.add('ringing');
          break;
        case CallEvent.connected:
        case CallEvent.answer:
          _isOnCall = true;
          _callStateController.add('connected');
          break;
        case CallEvent.reconnecting:
          _callStateController.add('connecting');
          break;
        case CallEvent.reconnected:
          _callStateController.add('connected');
          break;
        case CallEvent.callEnded:
        case CallEvent.declined:
        case CallEvent.missedCall:
          _reset();
          _callStateController.add('ended');
          break;
        case CallEvent.mute:
          _isMuted = true;
          break;
        case CallEvent.unmute:
          _isMuted = false;
          break;
        case CallEvent.speakerOn:
          _speakerOn = true;
          break;
        case CallEvent.speakerOff:
          _speakerOn = false;
          break;
        case CallEvent.hold:
        case CallEvent.unhold:
        case CallEvent.incoming:
        case CallEvent.bluetoothOn:
        case CallEvent.bluetoothOff:
        case CallEvent.log:
        case CallEvent.permission:
        case CallEvent.returningCall:
          // In architecture mein ignore ya future use.
          break;
      }
    });
  }

  void _reset() {
    _conferenceName = '';
    _isOnCall = false;
    _isMuted = false;
    _speakerOn = false;
  }

  String? _extractIdentity(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length < 2) return null;
      final normalized = base64Url.normalize(parts[1]);
      final decoded = utf8.decode(base64Url.decode(normalized));
      final payload = jsonDecode(decoded) as Map<String, dynamic>;
      return payload['sub'] as String? ?? payload['identity'] as String?;
    } catch (e) {
      debugPrint('[TwilioVoice] token identity decode error: $e');
      return null;
    }
  }
}
