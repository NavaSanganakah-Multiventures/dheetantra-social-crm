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
import 'api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'plivo_voice_service.dart';

class CallKitService {
  static final CallKitService _instance = CallKitService._internal();
  factory CallKitService() => _instance;
  CallKitService._internal();

  bool _initialized = false;
  bool? _callsEnabledCache;

  // This map keeps track of the currently active/ringing calls.
  final Map<String, Map<String, dynamic>> _activeCalls = {};

  String? _currentCallId;

  // Agar app cold start / kill ke baad user call accept kare toh navigator abhi
  // ready nahi hota. Us event ko yahan queue karte hain aur HomeShell shuru hone
  // par navigate kar dete hain.
  Map<String, dynamic>? _pendingAcceptCall;

  // Same call ka accept ek hi baar process ho (onEvent actionCallAccept aur
  // acceptCallHandle dono ek saath fire ho sakte hain -> double CallScreen +
  // double answerCall race na ho isliye dedupe karte hain).
  final Set<String> _handledAcceptIds = {};

  // In-app overlay ne answer kar liya hai - native CallKit accept event
  // se duplicate CallScreen + double answerCall na ho isliye track karte hain.
  final Set<String> _appAnsweredIds = {};

  // HomeShell ready hone tak accept event ko queue karo - warna Splash/Login
  // screen ke upar CallScreen push ho sakta hai.
  bool _homeShellReady = false;

  /// Ek accept event ko sirf ek baar process karta hai. Returns false agar
  /// ye call pehle hi accept ho chuki hai.
  bool _handleAccept(String id, Map<String, dynamic> data) {
    if (id.isEmpty || _handledAcceptIds.contains(id)) {
      debugPrint('CALLKIT: accept for $id already handled, skipping duplicate');
      return false;
    }
    _handledAcceptIds.add(id);
    _currentCallId = id;
    // HomeShell ready hone par (navigator bhi ready) turant open karo,
    // warna pending mein save
    // karo taaki HomeShell shuru hone par route kar sake. CallScreen apne
    // aap permission check karke answerCall karega.
    if (appNavigatorKey.currentState != null && _homeShellReady) {
      debugPrint('CALLKIT: navigator ready, opening CallScreen');
      CallScreen.push(appNavigatorKey.currentContext!, data);
    } else {
      debugPrint('CALLKIT: navigator / HomeShell not ready, queuing accepted call');
      _pendingAcceptCall = data;
    }
    return true;
  }

  /// Route a decline/auto-reject to the correct backend path for the call's
  /// source. Plivo must call the decline endpoint so the conference is torn
  /// down (not just marked 'declined' locally, which left the caller on hold).
  Future<void> _declineBySource(String uuid, Map<String, dynamic> data) async {
    final source = data['source']?.toString() ?? '';
    final callId = data['id']?.toString() ?? uuid;
    try {
      if (source == 'whatsapp' || source == 'gsm') {
        await WebRTCService().rejectCall(Map<String, dynamic>.from(data));
      } else {
        await ApiService().declineCall(callId);
      }
    } catch (e) {
      debugPrint('CALLKIT: decline by source error: $e');
    }
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // acceptCallHandle register main() mein Firebase init se pehle bhi ho
    // jata hai (cold-start accept race miss na ho) - yahan dobara call karna
    // safe hai, registerAcceptHandleEarly idempotent hai.
    registerAcceptHandleEarly();

    // Listen to CallKit events (Action Answer/Decline)
    FlutterCallkitIncoming.onEvent.listen((CallEvent? event) {
      if (event == null) return;

      if (event is CallEventActionCallAccept) {
        debugPrint('CALLKIT: onEvent actionCallAccept id=${event.callKitParams.id}');
        final params = event.callKitParams;
        final callData = _activeCalls[params.id] ?? params.extra;
        if (callData != null) {
          final data = Map<String, dynamic>.from(callData);
          _handleAccept(params.id, data);
        }
      } else if (event is CallEventActionCallDecline) {
        debugPrint('CALLKIT: onEvent actionCallDecline id=${event.callKitParams.id}');
        final params = event.callKitParams;
        _currentCallId = null;
        _handledAcceptIds.remove(params.id);
        // IMPORTANT: lookup pehle, remove baad - warna in-memory callData
        // kabhi milta hi nahi aur rejectCall silently skip ho jata hai.
        final callData = _activeCalls[params.id] ?? params.extra;
        _activeCalls.remove(params.id);
        if (callData != null) {
          final data = Map<String, dynamic>.from(callData);
          // WhatsApp calls: reject via WebRTC. Plivo/Twilio route through
          // their own backend paths (Plivo decline tears down the conference;
          // a local-only status update would leave the caller on hold).
          unawaited(_declineBySource(params.id, data));
        }
      } else if (event is CallEventActionCallEnded) {
        debugPrint('CALLKIT: onEvent actionCallEnded id=${event.callKitParams.id}');
        final params = event.callKitParams;
        final callData = _activeCalls[params.id] ?? params.extra;
        final wasAccepted = _handledAcceptIds.contains(params.id);
        _currentCallId = null;
        _handledAcceptIds.remove(params.id);
        _activeCalls.remove(params.id);
        // If a Plivo call ended without being accepted (swiped away / system
        // dismissed), tear the conference down so the caller does not wait.
        if (!wasAccepted && callData != null) {
          final data = Map<String, dynamic>.from(callData);
          if (data['source']?.toString() == 'plivo') {
            final id = data['id']?.toString() ?? params.id;
            unawaited(ApiService().declineCall(id));
          }
        }
      } else if (event is CallEventActionCallTimeout) {
        debugPrint('CALLKIT: onEvent actionCallTimeout id=${event.id}');
        final callData = _activeCalls[event.id];
        _currentCallId = null;
        _handledAcceptIds.remove(event.id);
        _activeCalls.remove(event.id);
        // Timeout means the agent never answered; tear down a waiting Plivo
        // conference so the caller is not left ringing/on hold forever.
        if (callData != null) {
          final data = Map<String, dynamic>.from(callData);
          if (data['source']?.toString() == 'plivo') {
            final id = data['id']?.toString() ?? event.id;
            unawaited(ApiService().declineCall(id));
          }
        }
      }
    });

    // When WebRTC connected, inform CallKit so the native UI timer starts.
    // 'ended' par poori registry clear karte hain - warna accepted call ki
    // entry hamesha bani rahegi aur same-id agli call duplicate-guard se
    // permanently block ho jayegi (hangup sirf terminate API bhejta hai,
    // plugin ko koi event nahi milta).
    WebRTCService().onCallState.listen((state) {
      if (state == 'connected' && _currentCallId != null) {
        FlutterCallkitIncoming.setCallConnected(_currentCallId!);
      } else if (state == 'ended') {
        // Id-targeted cleanup - blanket clear/endAllCalls another ringing call
        // ki entry aur native ring bhi maar deta tha.
        final endedId = _currentCallId;
        _currentCallId = null;
        if (endedId != null) {
          _handledAcceptIds.remove(endedId);
          _activeCalls.remove(endedId);
          FlutterCallkitIncoming.endCall(endedId).then((_) {},
              onError: (Object e) {
            debugPrint('CALLKIT endCall($endedId) after ended error: $e');
          });
        }
      }
    });
  }

  bool _acceptHandleRegistered = false;

  /// acceptCallHandle native callback register karta hai. main() mein
  /// [CallKitService.init] se pehle bula kar cold-start accept (plugin ka
  /// 750ms callback window) ko jaldi capture karte hain - tab tak main isolate
  /// ka method channel ready na ho toh event lost ho jata hai.
  void registerAcceptHandleEarly() {
    if (_acceptHandleRegistered) return;
    _acceptHandleRegistered = true;
    try {
      FlutterCallkitIncoming.acceptCallHandle((dynamic rawData) {
        debugPrint('CALLKIT: acceptCallHandle (killed-state accept)');
        try {
          if (rawData is! Map) return;
          final data = _sanitizeCallData(Map<String, dynamic>.from(rawData));
          if (data.isEmpty) return;
          final id = data['id']?.toString() ?? '';
          if (id.isEmpty) return;
          // Registry mein pehle se hai (app foreground mein call dikhi thi) toh
          // attacker-influenced broadcast payload ko ignore karke trusted
          // registry data se accept karo.
          final existing = _activeCalls[id];
          if (existing != null) {
            _handleAccept(id, Map<String, dynamic>.from(existing));
            return;
          }
          // Cold-start accept (registry khali hoti hai) - yahan payload par
          // bharosa karna padta hai. Extra data (caller info, sdp...) ko
          // sanitize karke non-overriding merge karo taaki top-level
          // id/sdp/phoneNumberId override na ho sake.
          final rawExtra = rawData['extra'];
          if (rawExtra is Map) {
            _sanitizeCallData(Map<String, dynamic>.from(rawExtra))
                .forEach((key, value) => data.putIfAbsent(key, () => value));
          }
          _handleAccept(id, data);
        } catch (e) {
          debugPrint('CALLKIT acceptCallHandle error: $e');
        }
      });
    } catch (e) {
      debugPrint('CALLKIT acceptCallHandle register error: $e');
    }
  }

  /// Broadcast receiver se aaya payload whitelisted keys tak limit hota hai -
  /// attacker-influenced nested/junk data (jisme harmful keys ho sakti hain)
  /// accept flow mein merge na ho. Sirf flat string/number/bool fields rakh
  /// dete hain, jo CallScreen/WebRTC answer ke liye chahiye.
  Map<String, dynamic> _sanitizeCallData(Map<String, dynamic> raw) {
    const allowed = {
      'id', 'callId', 'sdp', 'sdpType', 'callerName', 'callerNumber',
      'contact_name', 'phone', 'email', 'lastMessage', 'phoneNumberId',
      'from', 'contactEmail', 'direction', 'type', 'status', 'nameCaller',
      'handle', 'avatar', 'source', 'conferenceName', 'streamUrl',
      'plivoConfigId',
    };
    final out = <String, dynamic>{};
    raw.forEach((key, value) {
      if (allowed.contains(key) &&
          (value is String || value is num || value is bool)) {
        out[key] = value;
      }
    });
    return out;
  }

  /// Request Android 13+ notification permission and Android 14+ full-screen
  /// intent permission. Call after the user is logged in.
  /// HomeShell ke ready hone par true karo. Accept event tab tak queue mein
  /// rahega jab tak HomeShell ready nahi ho jata.
  void markHomeShellReady() {
    _homeShellReady = true;
  }

  /// Returns true if there is an accepted call waiting to be routed.
  bool get hasPendingAcceptCall => _pendingAcceptCall != null;

  /// Returns any call accepted while the app was not yet initialized/navigated
  /// to HomeShell. The caller must then route to [CallScreen] and answer the
  /// WebRTC call. Returns null after the first read.
  Map<String, dynamic>? takePendingAcceptCall() {
    final data = _pendingAcceptCall;
    _pendingAcceptCall = null;
    return data;
  }

  /// In-app overlay jab call answer karti hai, tab plugin ko bata do
  /// aur CallKit accept event ka duplicate gracefully ignore karo.
  void markAnsweredByApp(String id) {
    if (id.isEmpty) return;
    _handledAcceptIds.add(id);
    _appAnsweredIds.add(id);
    _currentCallId = id;
    try {
      FlutterCallkitIncoming.setCallConnected(id);
    } catch (e) {
      debugPrint('CALLKIT markAnsweredByApp setCallConnected error: $e');
    }
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

  /// Call end hone par (hangup / remote end / WS ended) registry se entry
  /// hatata hai aur plugin ka native UI bhi close karta hai. CallScreen
  /// teardown ise call karta hai taaki same-id agli call block na ho.
  void handleCallEnded(String id) {
    if (id.isEmpty) return;
    _handledAcceptIds.remove(id);
    _activeCalls.remove(id);
    if (_currentCallId == id) _currentCallId = null;
    FlutterCallkitIncoming.endCall(id).then((_) {}, onError: (Object e) {
      debugPrint('CALLKIT endCall($id) error: $e');
    });
  }

  /// Reflects the user-facing "Calling enabled" toggle (settings_screen). When off,
  /// incoming calls are auto-rejected so the caller gets a busy tone and this
  /// device stays quiet. Server-side gating (per WhatsAppConfig.calling_enabled)
  /// is independent and still applies.
  Future<bool> isCallingEnabled() async {
    if (_callsEnabledCache != null) return _callsEnabledCache!;
    try {
      final prefs = await SharedPreferences.getInstance();
      _callsEnabledCache = prefs.getBool('calls_enabled') ?? true;
    } catch (_) {
      _callsEnabledCache = true;
    }
    return _callsEnabledCache!;
  }

  Future<void> showIncomingCall(Map<String, dynamic> data) async {
    final String uuid = data['id']?.toString() ?? 'unknown-call-id';
    if (!await isCallingEnabled()) {
      await _declineBySource(uuid, Map<String, dynamic>.from(data));
      return;
    }

    // Duplicate guard: agar ye call pehle se dikh rahi hai (WebSocket overlay
    // ya plugin ke through) toh dubara se show mat karo - warna double ring +
    // double UI hota hai aur user call attend nahi kar paata.
    if (uuid != 'unknown-call-id' && _activeCalls.containsKey(uuid)) {
      debugPrint('CALLKIT: call $uuid already showing, skipping duplicate');
      return;
    }

    // Line-busy guard (WhatsApp-style): agar koi aur call pehle se active ya
    // ringing hai toh nayi call ko turant auto-reject - user ko double ring
    // nahi dikhegi aur caller ko busy tone milega. Server pehle hi busy calls
    // ko push nahi karta; ye sirf defense-in-depth hai (race/server-offline
    // case). NOTE: app default dialer banne par PSTN incoming calls ke liye
    // bhi yahi guard chalta rahega - sirf reject path TelecomManager se hoga.
    if (_currentCallId != null && _currentCallId != uuid) {
      debugPrint('CALLKIT: line busy ($_currentCallId) - auto-rejecting $uuid');
      await _declineBySource(uuid, Map<String, dynamic>.from(data));
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

    // Trigger Plivo dynamic endpoint hop in the background so that by the time
    // the user answers, the correct SIP endpoint is fully registered.
    if (data['source']?.toString() == 'plivo' && data['plivoConfigId'] != null) {
      unawaited(PlivoVoiceService().switchAccountBackground(data['plivoConfigId'].toString()));
    }

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
        // WhatsApp-style full-screen incoming call UI dikhane ke liye.
        // Android 14+ par full-screen intent permission zaroori hai;
        // CallKitService.requestPermissions() use runtime mein maangta hai.
        isFullScreen: true,
        isImportant: true,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#0955fa',
        backgroundUrl: 'assets/test.png',
        actionColor: '#4CAF50',
        textColor: '#ffffff',
        incomingCallNotificationChannelName: "Incoming Call",
        missedCallNotificationChannelName: "Missed Call",
        textAccept: 'Answer',
        textDecline: 'Decline',
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
