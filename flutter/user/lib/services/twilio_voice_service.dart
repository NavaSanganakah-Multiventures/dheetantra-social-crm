import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:twilio_voice/twilio_voice.dart';
import 'api_service.dart';

/// Manages the Twilio Voice SDK connection for the DheeTantra Flutter app.
///
/// - Fetches access tokens from the backend (/api/twilio/token).
/// - Registers the device token so Twilio can deliver call invites.
/// - Provides helpers to join a conference room (used for both incoming and
///   outgoing calls) and to mute / speaker / hang up.
class TwilioVoiceService {
  static final TwilioVoiceService _instance = TwilioVoiceService._internal();
  factory TwilioVoiceService() => _instance;
  TwilioVoiceService._internal();

  String? _accessToken;
  String? _identity;
  StreamSubscription? _eventSub;

  final _callStateController = StreamController<String>.broadcast();
  Stream<String> get onCallState => _callStateController.stream;

  bool _muted = false;
  bool _speakerOn = false;
  bool get isMuted => _muted;
  bool get isSpeakerOn => _speakerOn;

  /// Call once after the user has logged in and a workspace is selected.
  Future<void> init() async {
    try {
      await _refreshToken();
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (_accessToken != null && _accessToken!.isNotEmpty) {
        await _setTokens(_accessToken!, fcmToken: fcmToken);
      }
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
        if (_accessToken != null && _accessToken!.isNotEmpty) {
          await _setTokens(_accessToken!, fcmToken: newToken);
        }
      });
      _eventSub = TwilioVoicePlatform.instance.callEventsListener.listen(_onEvent);
    } catch (e) {
      debugPrint('[TwilioVoice] init error: $e');
    }
  }

  Future<void> _refreshToken() async {
    try {
      final data = await ApiService().getTwilioVoiceToken();
      _accessToken = (data['token'] as String?);
      _identity = (data['identity'] as String?);
    } catch (e) {
      debugPrint('[TwilioVoice] token refresh error: $e');
    }
  }

  Future<void> _setTokens(String token, {String? fcmToken}) async {
    try {
      final ok = await TwilioVoicePlatform.instance.setTokens(
        accessToken: token,
        deviceToken: fcmToken,
      );
      debugPrint('[TwilioVoice] setTokens ok=$ok');
    } catch (e) {
      debugPrint('[TwilioVoice] setTokens error: $e');
    }
  }

  void _onEvent(dynamic event) {
    debugPrint('[TwilioVoice] event: $event');
    final eventStr = event.toString().toLowerCase();
    if (eventStr.contains('connected')) {
      _callStateController.add('connected');
    } else if (eventStr.contains('callended')) {
      _callStateController.add('ended');
      _resetLocalState();
    } else if (eventStr.contains('ringing')) {
      _callStateController.add('connecting');
    }
  }

  void _resetLocalState() {
    _muted = false;
    _speakerOn = false;
  }

  Future<bool> ensureMicrophonePermission() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return true;
    final requested = await Permission.microphone.request();
    return requested.isGranted;
  }

  /// Joins a conference room. Used for both incoming and outgoing Twilio calls.
  /// The backend TwiML app routes calls to a <Conference> with the same name.
  Future<bool> joinConference(String conferenceName, {String? callerName}) async {
    try {
      if (!await ensureMicrophonePermission()) {
        debugPrint('[TwilioVoice] microphone denied');
        return false;
      }
      await _refreshToken();
      final token = _accessToken;
      final identity = _identity;
      if (token == null || token.isEmpty || identity == null || identity.isEmpty) {
        debugPrint('[TwilioVoice] missing token/identity');
        return false;
      }
      await _setTokens(token);
      _callStateController.add('connecting');

      await TwilioVoicePlatform.instance.call.place(
        from: identity,
        to: conferenceName,
        extraOptions: {
          '__TWI_CALLER_NAME': callerName ?? 'DheeTantra',
        },
      );
      return true;
    } catch (e) {
      debugPrint('[TwilioVoice] joinConference error: $e');
      _callStateController.add('ended');
      return false;
    }
  }

  Future<void> hangUp() async {
    try {
      await TwilioVoicePlatform.instance.call.hangUp();
    } catch (e) {
      debugPrint('[TwilioVoice] hangUp error: $e');
    }
  }

  Future<void> toggleMute() async {
    _muted = !_muted;
    try {
      await TwilioVoicePlatform.instance.call.toggleMute(_muted);
    } catch (e) {
      debugPrint('[TwilioVoice] toggleMute error: $e');
    }
  }

  Future<void> setSpeaker(bool on) async {
    _speakerOn = on;
    try {
      await TwilioVoicePlatform.instance.call.toggleSpeaker(on);
    } catch (e) {
      debugPrint('[TwilioVoice] toggleSpeaker error: $e');
    }
  }

  Future<void> toggleSpeaker() async {
    await setSpeaker(!_speakerOn);
  }

  void dispose() {
    _eventSub?.cancel();
    _callStateController.close();
  }
}
