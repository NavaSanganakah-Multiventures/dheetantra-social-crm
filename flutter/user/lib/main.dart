import 'package:flutter/material.dart';

import 'core/app_navigator.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'services/api_service.dart';
import 'services/fcm_service.dart';
import 'services/notification_router.dart';
import 'services/callkit_service.dart';
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
  
  if (message.data['type'] == 'incoming_call') {
    await CallKitService().showIncomingCall(message.data);
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
      home: const SplashScreen(),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
      },
    );
  }
}
