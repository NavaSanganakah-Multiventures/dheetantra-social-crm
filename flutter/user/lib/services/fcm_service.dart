import 'dart:async';
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'callkit_service.dart';

/// Firebase Cloud Messaging service for the user app.
///
/// - Initializes Firebase (tolerates missing google-services.json so the app
///   still runs without push config).
/// - Registers/unregisters the device token with the DheeTantra backend.
/// - Shows local notifications while the app is in the foreground.
/// - Forwards tapped notifications (foreground, background, terminated) to
///   [onNotificationTap] so the UI can deep-link (open chat / call info).
class FcmService {
  static final FcmService _instance = FcmService._internal();
  factory FcmService() => _instance;
  FcmService._internal();

  static const _channelId = 'dheetantra';
  static const _channelName = 'DheeTantra Notifications';
  static const _enabledPref = 'notifications_enabled';

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  /// Monotonic notification ID — avoids Android ID collisions when two
  /// notifications land in the same second (epoch-seconds IDs replace each
  /// other in the tray).
  int _notificationId = 0;

  /// Set by [DheeTantraApp] to route taps (navigate to chat, open inbox...).
  void Function(Map<String, dynamic> data)? onNotificationTap;

  String? _token;
  String? get token => _token;
  bool _available = false;
  bool get isAvailable => _available;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      // Firebase is already initialized in main() with correct options.
      // Just verify it's available.
      if (Firebase.apps.isNotEmpty) {
        _available = true;
      } else {
        debugPrint('Firebase not initialized — push disabled');
        return;
      }
    } catch (e) {
      // google-services.json missing/placeholder — push disabled, app continues.
      debugPrint('Firebase init skipped: $e');
      return;
    }

    try {
      await _initLocalNotifications();
    } catch (e) {
      // Local notification plugin failure — push still works, tray won't.
      debugPrint('Local notifications init failed: $e');
    }

    // Foreground messages → local notification (system tray already shows
    // background/terminated messages from the notification payload).
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _handleForegroundMessage(message);
    });

    // App opened from a notification while in background.
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      _handleTap(message.data);
    });

    // App launched (terminated) from a notification.
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      // Slight delay so the navigator is ready.
      Future.delayed(const Duration(milliseconds: 600), () {
        _handleTap(initial.data);
      });
    }

    _messaging.onTokenRefresh.listen((newToken) async {
      _token = newToken;
      // Respect the notifications toggle — a token rotation must not silently
      // re-enable pushes the user disabled.
      if (await isEnabled()) {
        await _registerToken(newToken);
      }
    });
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidInit,
      iOS: darwinInit,
    );
    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (details) {
        final payload = details.payload;
        if (payload == null) return;
        try {
          final data = Map<String, dynamic>.from(
            Uri.splitQueryString(payload),
          );
          _handleTap(data);
        } catch (e) {
          debugPrint('Notification payload parse error: $e');
        }
      },
    );

    if (!kIsWeb && Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        _channelId,
        _channelName,
        description: 'New messages, calls and broadcast updates',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
      );
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
    }
  }

  /// Requests permission and registers the token with the backend.
  /// Call after login (or from splash once authenticated).
  Future<void> setupForUser() async {
    if (!_available) {
      debugPrint('[FCM] setupForUser: Firebase not available, skipping');
      return;
    }

    final enabled = await isEnabled();
    if (!enabled) {
      debugPrint('[FCM] setupForUser: notifications disabled by user');
      return;
    }

    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      debugPrint('[FCM] Permission status: ${settings.authorizationStatus}');
      if (settings.authorizationStatus != AuthorizationStatus.authorized &&
          settings.authorizationStatus != AuthorizationStatus.provisional) {
        debugPrint('[FCM] Permission denied');
        return;
      }
    } catch (e) {
      debugPrint('[FCM] Permission error: $e');
    }

    try {
      _token = await _messaging.getToken();
      debugPrint('[FCM] Token obtained: ${_token?.substring(0, 20)}...');
      if (_token != null) {
        final success = await _registerToken(_token!);
        debugPrint('[FCM] Token registration result: $success');
      }
    } catch (e) {
      debugPrint('[FCM] getToken error: $e');
    }
  }

  Future<bool> _registerToken(String token) async {
    String deviceType = 'android';
    if (!kIsWeb && Platform.isIOS) deviceType = 'ios';
    return ApiService().registerFcmToken(token, deviceType: deviceType);
  }

  /// Removes the token from the backend (logout / notifications disabled).
  Future<void> cleanup() async {
    final t = _token;
    _token = null;
    if (_available && t != null) {
      await ApiService().unregisterFcmToken(token: t);
    }
  }

  Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledPref) ?? true;
  }

  /// Persists the notifications toggle. When disabled, the device token is
  /// removed from the backend so no pushes arrive.
  Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledPref, enabled);
    if (enabled) {
      await setupForUser();
    } else {
      await cleanup();
    }
  }

  void _handleForegroundMessage(RemoteMessage message) {
    if (!_available) return;

    if (message.data['type'] == 'incoming_call') {
      CallKitService().showIncomingCall(message.data);
      return;
    }

    if (message.notification == null) {
      // Data-only message (e.g. call events) — surface via in-app overlay.
      _handleTap(message.data);
      return;
    }
    isEnabled().then((enabled) {
      if (!enabled) return;
      _showLocalNotification(
        message.notification?.title ?? 'DheeTantra',
        message.notification?.body ?? '',
        message.data,
      );
    });
  }

  Future<void> _showLocalNotification(String title, String body, Map<String, dynamic> data) async {
    try {
      // URL-encode values so Uri.splitQueryString on tap round-trips
      // correctly (contact names may contain '&' or '=').
      final payload = Uri(
        queryParameters: data.map((k, v) => MapEntry(k, v.toString())),
      ).query;
      const details = NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: 'New messages, calls and broadcast updates',
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
        ),
        iOS: DarwinNotificationDetails(presentSound: true, presentAlert: true),
      );
      _notificationId = (_notificationId + 1) & 0x7fffffff;
      await _local.show(
        _notificationId,
        title,
        body,
        details,
        payload: payload,
      );
    } catch (e) {
      debugPrint('Local notification error: $e');
    }
  }

  void _handleTap(Map<String, dynamic> data) {
    onNotificationTap?.call(data);
  }
}
