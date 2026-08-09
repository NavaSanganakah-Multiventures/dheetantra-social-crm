import 'package:flutter/material.dart';

import 'core/app_navigator.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/fcm_service.dart';
import 'services/notification_router.dart';
import 'services/callkit_service.dart';
import 'services/notification_center.dart';
import 'theme/app_theme.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';

/// Global route observer so child screens can refresh when they become
/// visible again (e.g. chat screen se wapas aane par).
final RouteObserver<ModalRoute<void>> routeObserver = RouteObserver<ModalRoute<void>>();

/// Top-level handler invoked by the OS when a push arrives while the app is
/// terminated or in background. Must be a top-level function (not a method)
/// and annotated with @pragma so the Dart AOT compiler preserves it.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  final type = message.data['type'] ?? '';
  // Background isolate mein SchedulerBinding nahi hota, isliye debugPrint ke
  // bajaye print use karo.
  // ignore: avoid_print
  print('[FCM Background] message type: $type');

  // App kill/band hone par bhi har message ka notification aana chahiye.
  // Notification-payload wale messages ko Android system tray dikhata hai,
  // lekin data-only messages ya custom handling ke liye local notification
  // khud show karte hain.
  if (type == 'incoming_call') {
    await CallKitService().showIncomingCall(message.data);
  } else if (message.notification == null) {
    // missed_call, new_message, ya koi bhi dusra data-only event.
    // If notification block is present, system shows it automatically so we don't duplicate.
    await FcmService().showBackgroundNotification(message);
  } else {
    // Bell badge aur notification screen bhi update karo — websocket band ho toh
    // bhi user ko missed calls/messages ka pata chale.
    try {
      final title = message.notification?.title ?? message.data['title'] ?? 'DheeTantra';
      final body = message.notification?.body ?? message.data['body'] ?? 'नया अपडेट प्राप्त हुआ';
      NotificationCenter().add(
        title: title,
        body: body,
        type: type == 'new_message' ? 'message' : (type == 'missed_call' ? 'call' : 'system'),
        data: Map<String, dynamic>.from(message.data),
      );
    } catch (e) {
      // Ignored for background
    }
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await ApiService().init();
  await FcmService().init();
  await CallKitService().init();
  FcmService().onNotificationTap = (data) => NotificationRouter().dispatch(data);
  runApp(const DheeTantraApp());
}

class DheeTantraApp extends StatelessWidget {
  const DheeTantraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DheeTantra',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      navigatorKey: appNavigatorKey,
      navigatorObservers: [routeObserver],
      home: const SplashScreen(),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
      },
    );
  }
}
