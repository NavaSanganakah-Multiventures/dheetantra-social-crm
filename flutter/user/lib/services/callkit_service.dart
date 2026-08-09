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

  // Agar app cold start / kill ke baad user call accept kare toh navigator abhi
  // ready nahi hota. Us event ko yahan queue karte hain aur HomeShell shuru hone
  // par navigate kar dete hain.
  Map<String, dynamic>? _pendingAcceptCall;

  // Same call ka accept ek hi baar process ho (onEvent actionCallAccept aur
  // acceptCallHandle dono ek saath fire ho sakte hain → double CallScreen +
  // double answerCall race na ho isliye dedupe karte hain).
  final Set<String> _handledAcceptIds = {};

  /// Ek accept event ko sirf ek baar process karta hai. Returns false agar
  /// ye call pehle hi accept ho chuki hai.
  bool _handleAccept(String id, Map<String, dynamic> data) {
    if (id.isEmpty || _handledAcceptIds.contains(id)) {
      debugPrint('CALLKIT: accept for $id already handled, skipping duplicate');
      return false;
    }
    _handledAcceptIds.add(id);
    _currentCallId = id;
    // Agar navigator ready hai toh turant open karo, warna pending mein save
    // karo taaki HomeShell shuru hone par route kar sake.
    if (appNavigatorKey.currentState != null) {
      _openCallScreen(data);
      Future.delayed(const Duration(milliseconds: 300), () {
        WebRTCService().answerCall(data);
      });
    } else {
      debugPrint('CALLKIT: navigator not ready, queuing accepted call');
      _pendingAcceptCall = data;
    }
    return true;
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // IMPORTANT: App killed / terminated hone par user agar native call UI se
    // accept karta hai toh actionCallAccept event main isolate tak tabhi
    // pahunchega jab plugin ka background engine registered ho. acceptCallHandle
    // native callback hai jo app wapas khulne par main isolate mein chalta hai —
    // isi se killed-state accept ko CallScreen + WebRTC answer se jodte hain.
    try {
      FlutterCallkitIncoming.acceptCallHandle((dynamic rawData) {
        debugPrint('CALLKIT: acceptCallHandle (killed-state accept)');
        try {
          if (rawData is! Map) return;
          final data = Map<String, dynamic>.from(rawData);
          if (data.isEmpty) return;
          final id = data['id']?.toString() ?? '';
          if (id.isEmpty) return;
          // Extra data (caller info, sdp...) bhi merge kar lo agar mila ho.
          final extra = data['extra'];
          if (extra is Map) {
            data.addAll(Map<String, dynamic>.from(extra));
          }
          data.remove('extra');
          _handleAccept(id, data);
        } catch (e) {
          debugPrint('CALLKIT acceptCallHandle error: $e');
        }
      });
    } catch (e) {
      debugPrint('CALLKIT acceptCallHandle register error: $e');
    }

    // Listen to CallKit events (Action Answer/Decline)
    FlutterCallkitIncoming.onEvent.listen((CallEvent? event) {
      if (event == null) return;

      if (event is CallEventActionCallAccept) {
        debugPrint('CALLKIT: actionCallAccept');
        final params = event.callKitParams;
        final callData = _activeCalls[params.id] ?? params.extra;
        if (callData != null) {
          final data = Map<String, dynamic>.from(callData);
          _handleAccept(params.id, data);
        }
      } else if (event is CallEventActionCallDecline) {
        debugPrint('CALLKIT: actionCallDecline');
        final params = event.callKitParams;
        _currentCallId = null;
        _handledAcceptIds.remove(params.id);
        _activeCalls.remove(params.id);
        final callData = _activeCalls[params.id] ?? params.extra;
        if (callData != null) {
          WebRTCService().rejectCall(Map<String, dynamic>.from(callData));
        }
      } else if (event is CallEventActionCallEnded) {
        debugPrint('CALLKIT: actionCallEnded');
        final params = event.callKitParams;
        _currentCallId = null;
        _handledAcceptIds.remove(params.id);
        _activeCalls.remove(params.id);
      } else if (event is CallEventActionCallTimeout) {
        debugPrint('CALLKIT: actionCallTimeout');
        _currentCallId = null;
        _handledAcceptIds.remove(event.id);
        _activeCalls.remove(event.id);
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
  /// Returns any call accepted while the app was not yet initialized/navigated
  /// to HomeShell. The caller must then route to [CallScreen] and answer the
  /// WebRTC call. Returns null after the first read.
  Map<String, dynamic>? takePendingAcceptCall() {
    final data = _pendingAcceptCall;
    _pendingAcceptCall = null;
    return data;
  }

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

  /// Kya abhi koi call active/ringing hai (plugin ya in-app overlay dono se)।
  bool get hasActiveIncomingCall => _activeCalls.isNotEmpty;

  bool hasCall(String id) => _activeCalls.containsKey(id);

  /// WebSocket overlay wali call ko CallKit registry mein note karta hai taaki
  /// FCM push baad mein aaye toh plugin double-UI/ring na dikhaye.
  void registerInAppCall(Map<String, dynamic> data) {
    final id = data['id']?.toString() ?? data['callId']?.toString() ?? '';
    if (id.isEmpty) return;
    _activeCalls[id] = Map<String, dynamic>.from(data);
  }

  void unregisterInAppCall(String id) {
    if (id.isEmpty) return;
    _activeCalls.remove(id);
    if (_currentCallId == id) _currentCallId = null;
  }

  Future<void> showIncomingCall(Map<String, dynamic> data) async {
    final String uuid = data['id']?.toString() ?? 'unknown-call-id';

    // Duplicate guard: agar ye call pehle se dikh rahi hai (WebSocket overlay
    // ya plugin ke through) toh dubara se show mat karo — warna double ring +
    // double UI hota hai aur user call attend nahi kar paata.
    if (uuid != 'unknown-call-id' && _activeCalls.containsKey(uuid)) {
      debugPrint('CALLKIT: call $uuid already showing, skipping duplicate');
      return;
    }

    final String callerName = data['callerName']?.toString().isNotEmpty == true
        ? data['callerName'].toString()
        : 'DheeTantra Call';
    final String callerId = data['callerNumber']?.toString().isNotEmpty == true
        ? data['callerNumber'].toString()
        : (data['from']?.toString().isNotEmpty == true ? data['from'].toString() : 'Unknown');

    // Push payload mein aaya email/lastMessage safe extra mein rakh lo taaki
    // CallScreen par poora caller context dikha sakein.
    final String email = data['contactEmail']?.toString() ?? '';
    final String lastMessage = data['lastMessage']?.toString() ?? '';
    final String displayName = callerName == 'DheeTantra Call' && callerId != 'Unknown' ? callerId : callerName;

    // Store in memory in case the extra data is lost on some platforms
    _currentCallId = uuid;
    _activeCalls[uuid] = {
      ...data,
      'contact_name': displayName,
      'phone': callerId,
      'callerName': displayName,
      'callerNumber': callerId,
      'email': email,
      'lastMessage': lastMessage,
    };

    final params = CallKitParams(
      id: uuid,
      nameCaller: displayName,
      appName: 'DheeTantra',
      avatar: 'https://i.pravatar.cc/100', // Replace with contact avatar if available
      handle: callerId,
      type: 0,
      duration: 30000,
      missedCallNotification: const NotificationParams(
        showNotification: true,
        isShowCallback: false,
        subtitle: 'Missed call',
        callbackText: 'Call back',
      ),
      extra: {
        ...data,
        'contact_name': displayName,
        'phone': callerId,
        'callerName': displayName,
        'callerNumber': callerId,
        'email': email,
        'lastMessage': lastMessage,
      },
      headers: <String, dynamic>{'apiKey': '1234'},
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        isShowCallID: true,
        isShowFullLockedScreen: true,
        // IMPORTANT: isFullScreen=true hone par plugin sirf activity dikhata hai
        // aur notification nahi banati. Android 14+ par full-screen intent
        // permission ke bina activity launch fail/denied hoti hai → ring nahi
        // bajti. isFullScreen=false hone par plugin notification-based incoming
        // call dikhata hai jo lock screen par bhi dikhti hai aur ringtone +
        // vibration hamesha bajta hai (channel enabled hone par). Ye sabse
        // reliable path hai.
        isFullScreen: false,
        isImportant: true,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#0955fa',
        backgroundUrl: 'assets/test.png',
        actionColor: '#4CAF50',
        textColor: '#ffffff',
        incomingCallNotificationChannelName: "Incoming Call",
        missedCallNotificationChannelName: "Missed Call",
        textAccept: 'उठाएं',
        textDecline: 'काटें',
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
    try {
      await FlutterCallkitIncoming.endAllCalls();
    } catch (e) {
      debugPrint('CALLKIT endAllCalls error: $e');
    }
    _currentCallId = null;
    _activeCalls.clear();
  }
}
