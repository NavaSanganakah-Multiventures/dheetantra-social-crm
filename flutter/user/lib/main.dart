import 'package:flutter/material.dart';

import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/fcm_service.dart';
import 'services/notification_router.dart';
import 'theme/app_theme.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'firebase_options.dart';

/// Top-level handler invoked by the OS when a push arrives while the app is
/// terminated or in background. Must be a top-level function (not a method)
/// and annotated with @pragma so the Dart AOT compiler preserves it.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // Nothing else needed — the notification payload is automatically shown by
  // the system tray. Data-only messages can be processed here if needed.
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await ApiService().init();
  await FcmService().init();
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
      home: const SplashScreen(),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
      },
    );
  }
}
