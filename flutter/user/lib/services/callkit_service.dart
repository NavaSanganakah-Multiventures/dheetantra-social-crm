import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
import 'package:flutter_callkit_incoming/entities/call_kit_params.dart';
import 'package:flutter_callkit_incoming/entities/ios_params.dart';
import 'package:flutter_callkit_incoming/entities/android_params.dart';
import 'package:flutter_callkit_incoming/entities/notification_params.dart';

import '../core/app_navigator.dart';
import '../screens/call_screen.dart';
import 'webrtc_service.dart';

class CallKitService {
  static final CallKitService _instance = CallKitService._internal();
  factory CallKitService() => _instance;
  CallKitService._internal();

  bool _initialized = false;

  // This map keeps track of the currently active/ringing calls.
  final Map<String, Map<String, dynamic>> _activeCalls = {};

  String? _currentCallId;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // Listen to CallKit events (Action Answer/Decline)
    FlutterCallkitIncoming.onEvent.listen((CallEvent? event) {
      if (event == null) return;

      if (event is CallEventActionCallAccept) {
        debugPrint('CALLKIT: actionCallAccept');
        final params = event.callKitParams;
        _currentCallId = params.id;
        final callData = _activeCalls[params.id] ?? params.extra;
        if (callData != null) {
          final data = Map<String, dynamic>.from(callData);
          // Khulte hi alag call screen dikhao.
          _openCallScreen(data);
          Future.delayed(const Duration(milliseconds: 300), () {
            WebRTCService().answerCall(data);
          });
        }
      } else if (event is CallEventActionCallDecline) {
        debugPrint('CALLKIT: actionCallDecline');
        final params = event.callKitParams;
        _currentCallId = null;
        final callData = _activeCalls[params.id] ?? params.extra;
        if (callData != null) {
          WebRTCService().rejectCall(Map<String, dynamic>.from(callData));
        }
      } else if (event is CallEventActionCallEnded) {
        debugPrint('CALLKIT: actionCallEnded');
        _currentCallId = null;
      } else if (event is CallEventActionCallTimeout) {
        debugPrint('CALLKIT: actionCallTimeout');
        _currentCallId = null;
      }
    });

    // When WebRTC connected, inform CallKit so the native UI timer starts.
    WebRTCService().onCallState.listen((state) {
      if (state == 'connected' && _currentCallId != null) {
        FlutterCallkitIncoming.setCallConnected(_currentCallId!);
      }
    });
  }

  /// Request Android 13+ notification permission and Android 14+ full-screen
  /// intent permission. Call after the user is logged in.
  Future<void> requestPermissions() async {
    try {
      await FlutterCallkitIncoming.requestNotificationPermission({
        "title": "Notification permission",
        "rationaleMessagePermission":
            "Call notifications dikhane ke liye permission chahiye.",
        "postNotificationMessageRequired":
            "Settings me jaakar notification permission enable karein.",
      });
    } catch (e) {
      debugPrint('CALLKIT notification permission error: $e');
    }

    try {
      final canUseFull = await FlutterCallkitIncoming.canUseFullScreenIntent();
      if (!canUseFull) {
        await FlutterCallkitIncoming.requestFullIntentPermission();
      }
    } catch (e) {
      debugPrint('CALLKIT full intent permission error: $e');
    }
  }

  void _openCallScreen(Map<String, dynamic> callData) {
    final navigator = appNavigatorKey.currentState;
    if (navigator == null) {
      debugPrint('CALLKIT: navigator not ready, cannot open call screen');
      return;
    }
    navigator.push(
      MaterialPageRoute(
        builder: (_) => CallScreen(callData: callData),
      ),
    );
  }

  Future<void> showIncomingCall(Map<String, dynamic> data) async {
    final String uuid = data['id'] ?? 'unknown-call-id';
    final String callerName = data['callerName'] ?? 'DheeTantra Call';
    final String callerId = data['callerNumber'] ?? 'Unknown';
    
    // Store in memory in case the extra data is lost on some platforms
    _currentCallId = uuid;
    _activeCalls[uuid] = data;

    final params = CallKitParams(
      id: uuid,
      nameCaller: callerName,
      appName: 'DheeTantra',
      avatar: 'https://i.pravatar.cc/100', // You can replace with actual avatar
      handle: callerId,
      type: 0,
      duration: 30000,
      missedCallNotification: const NotificationParams(
        showNotification: true,
        isShowCallback: false,
        subtitle: 'Missed call',
        callbackText: 'Call back',
      ),
      extra: data, // Pass the whole payload
      headers: <String, dynamic>{'apiKey': '1234'},
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#0955fa',
        backgroundUrl: 'assets/test.png',
        actionColor: '#4CAF50',
        textColor: '#ffffff',
        incomingCallNotificationChannelName: "Incoming Call",
        missedCallNotificationChannelName: "Missed Call",
        isShowCallID: false,
      ),
      ios: const IOSParams(
        iconName: 'AppIcon',
        handleType: '',
        supportsVideo: true,
        maximumCallGroups: 2,
        maximumCallsPerCallGroup: 1,
        audioSessionMode: 'default',
        audioSessionActive: true,
        audioSessionPreferredSampleRate: 44100.0,
        audioSessionPreferredIOBufferDuration: 0.005,
        supportsDTMF: true,
        supportsHolding: true,
        supportsGrouping: false,
        supportsUngrouping: false,
        ringtonePath: 'system_ringtone_default',
      ),
    );

    await FlutterCallkitIncoming.showCallkitIncoming(params);
  }

  Future<void> endAllCalls() async {
    await FlutterCallkitIncoming.endAllCalls();
    _activeCalls.clear();
  }
}
