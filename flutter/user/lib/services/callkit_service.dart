import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_callkit_incoming/entities/call_event.dart';
import 'package:flutter_callkit_incoming/entities/call_kit_params.dart';
import 'package:flutter_callkit_incoming/entities/ios_params.dart';
import 'package:flutter_callkit_incoming/entities/android_params.dart';
import 'package:flutter_callkit_incoming/entities/notification_params.dart';

import 'webrtc_service.dart';

class CallKitService {
  static final CallKitService _instance = CallKitService._internal();
  factory CallKitService() => _instance;
  CallKitService._internal();

  bool _initialized = false;
  
  // This map keeps track of the currently active/ringing calls.
  final Map<String, Map<String, dynamic>> _activeCalls = {};

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // Listen to CallKit events (Action Answer/Decline)
    FlutterCallkitIncoming.onEvent.listen((CallEvent? event) {
      if (event == null) return;
      
      final callData = _activeCalls[event.body['id']] ?? event.body['extra'];
      
      switch (event.event) {
        case Event.actionCallAccept:
          debugPrint('CALLKIT: actionCallAccept');
          if (callData != null) {
            // Need to wrap in Future.delayed to ensure WebRTC service has time to init 
            // if the app was just launched from background.
            Future.delayed(const Duration(milliseconds: 500), () {
              WebRTCService().answerCall(Map<String, dynamic>.from(callData));
            });
          }
          break;
        case Event.actionCallDecline:
          debugPrint('CALLKIT: actionCallDecline');
          if (callData != null) {
            WebRTCService().rejectCall(Map<String, dynamic>.from(callData));
          }
          break;
        case Event.actionCallEnded:
          debugPrint('CALLKIT: actionCallEnded');
          break;
        case Event.actionCallTimeout:
          debugPrint('CALLKIT: actionCallTimeout');
          if (callData != null) {
             // Let the backend know we missed it or just ignore
          }
          break;
        default:
          break;
      }
    });
  }

  Future<void> showIncomingCall(Map<String, dynamic> data) async {
    final String uuid = data['id'] ?? 'unknown-call-id';
    final String callerName = data['callerName'] ?? 'DheeTantra Call';
    final String callerId = data['callerNumber'] ?? 'Unknown';
    
    // Store in memory in case the extra data is lost on some platforms
    _activeCalls[uuid] = data;

    final params = CallKitParams(
      id: uuid,
      nameCaller: callerName,
      appName: 'DheeTantra',
      avatar: 'https://i.pravatar.cc/100', // You can replace with actual avatar
      handle: callerId,
      type: 0,
      duration: 30000,
      textAccept: 'Accept',
      textDecline: 'Decline',
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
